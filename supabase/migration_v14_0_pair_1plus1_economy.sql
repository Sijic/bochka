-- ============================================================================
-- MIGRATION v14.0 (pair_1plus1_economy):
-- 1. Безубыточная модель билетов "1+1 Соседнее кресло за 0 ₽":
--    - global_stats: max_total_tickets = 100, max_daily_tickets = 8, require_pair_receipt = true
--    - ticket_orders: pair_receipt_url (скрин 1-го купленного билета), pair_seat_pref (соседнее место)
--    - Storage RLS cinema-passes: разрешена папка 'receipts' для загрузки скрина 1-го билета
-- 2. Публичный RPC get_ticket_pool_status_rpc() для честного счётчика остатка на Уровне 3
-- 3. Обновлённый submit_gift_ticket_order (проверяет pair_receipt_url когда require_pair_receipt = true)
-- 4. Обновлённый admin_update_config (тумблер REQUIRE_PAIR_RECEIPT в /admin/)
-- ============================================================================

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS require_pair_receipt boolean NOT NULL DEFAULT true;

UPDATE public.global_stats
SET
  max_total_tickets = 100,
  max_daily_tickets = 8,
  require_pair_receipt = true,
  updated_at = now()
WHERE id = 1;

ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS pair_receipt_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS pair_seat_pref text DEFAULT '';

-- Разрешаем загрузку сжатого скриншота купленного 1-го билета в cinema-passes/receipts/*
DROP POLICY IF EXISTS "Anon upload cinema-passes photos" ON storage.objects;
CREATE POLICY "Anon upload cinema-passes photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'cinema-passes'
    AND (storage.foldername(name))[1] = ANY (ARRAY['passes','kp','receipts'])
    AND name ~* '\.(webp|jpe?g|png)$'
  );

-- ----------------------------------------------------------------------------
-- 1. Живой остаток пула билетов для честного отображения на Уровне 3 и #screen-pass
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ticket_pool_status_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.global_stats%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_daily_issued integer := 0;
  v_max_daily integer := 8;
  v_total_issued integer := 0;
  v_max_total integer := 100;
  v_daily_rem integer := 0;
  v_total_rem integer := 0;
BEGIN
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_max_daily := GREATEST(0, COALESCE(cfg.max_daily_tickets, 8));
  v_max_total := GREATEST(0, COALESCE(cfg.max_total_tickets, 100));
  v_daily_issued := CASE WHEN cfg.daily_reset_date < msk_date THEN 0 ELSE GREATEST(0, COALESCE(cfg.daily_tickets_issued, 0)) END;
  v_total_issued := GREATEST(0, COALESCE(cfg.tickets_won, 0));

  v_total_rem := GREATEST(0, v_max_total - v_total_issued);
  v_daily_rem := LEAST(v_total_rem, GREATEST(0, v_max_daily - v_daily_issued));

  IF COALESCE(cfg.is_paused, false) OR now() >= timestamptz '2026-12-16 00:00:00+05' THEN
    v_daily_rem := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'daily_issued', v_daily_issued,
    'max_daily', v_max_daily,
    'daily_remaining', v_daily_rem,
    'total_issued', v_total_issued,
    'max_total', v_max_total,
    'total_remaining', v_total_rem,
    'is_paused', COALESCE(cfg.is_paused, false),
    'require_pair_receipt', COALESCE(cfg.require_pair_receipt, true)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Обновляем submit_gift_ticket_order (поддержка скриншота 1-го билета и места рядом)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_gift_ticket_order(text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_gift_ticket_order(
  p_gift_id text,
  p_receiver_uid text,
  p_receiver_tg_id text,
  p_receiver_username text,
  p_receiver_name text,
  p_city_cinema text,
  p_fallback_phone text DEFAULT NULL,
  p_pair_receipt_url text DEFAULT NULL,
  p_pair_seat_pref text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tp public.ticket_passes%ROWTYPE;
  vc public.verified_contacts%ROWTYPE;
  cfg public.global_stats%ROWTYPE;
  clean_phone text := '';
  v_receipt text := NULLIF(trim(COALESCE(p_pair_receipt_url, '')), '');
  v_seat text := left(trim(COALESCE(p_pair_seat_pref, '')), 120);
  order_id uuid;
  new_sender_lives integer := 0;
BEGIN
  IF p_receiver_tg_id IS NULL OR length(trim(p_receiver_tg_id)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'telegram_required');
  END IF;
  IF p_receiver_uid IS NOT NULL AND public.is_sandbox_uid(p_receiver_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;
  IF p_city_cinema IS NULL OR length(trim(p_city_cinema)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1;

  -- Валидация URL скриншота 1-го купленного билета (строго из бакета cinema-passes)
  IF v_receipt IS NOT NULL AND v_receipt !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/' THEN
    v_receipt := NULL;
  END IF;

  IF COALESCE(cfg.require_pair_receipt, true) AND v_receipt IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pair_receipt_required');
  END IF;

  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(p_gift_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF (tp.sender_tg_id IS NOT NULL AND tp.sender_tg_id <> '' AND tp.sender_tg_id = trim(p_receiver_tg_id))
     OR (tp.sender_uid = trim(COALESCE(p_receiver_uid, '')))
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_claim_blocked');
  END IF;

  IF tp.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  SELECT * INTO vc FROM public.verified_contacts WHERE tg_user_id = trim(p_receiver_tg_id);
  IF FOUND THEN
    clean_phone := '+' || regexp_replace(vc.phone, '[^0-9]', '', 'g');
  ELSIF p_fallback_phone IS NOT NULL AND length(regexp_replace(p_fallback_phone, '[^0-9]', '', 'g')) >= 10 THEN
    clean_phone := '+' || regexp_replace(p_fallback_phone, '[^0-9]', '', 'g');
  END IF;

  IF length(regexp_replace(clean_phone, '[^0-9]', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'contact_not_verified');
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.verified_phone = clean_phone) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_already_used');
  END IF;

  INSERT INTO public.ticket_orders (
    gift_id, status,
    receiver_uid, receiver_tg_id, receiver_username, receiver_name,
    verified_phone, city_cinema, recipient_photo_url,
    sender_uid, sender_tg_id, sender_username, sender_name,
    kp_screenshot_url, pair_receipt_url, pair_seat_pref
  )
  VALUES (
    tp.short_id, 'pending',
    trim(COALESCE(p_receiver_uid, '')),
    trim(p_receiver_tg_id),
    NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    CASE WHEN length(trim(COALESCE(p_receiver_name, ''))) > 0 THEN left(trim(p_receiver_name), 48) ELSE COALESCE(tp.recipient_name, 'Гость') END,
    clean_phone,
    left(trim(p_city_cinema), 120),
    tp.recipient_photo_url,
    tp.sender_uid,
    tp.sender_tg_id,
    tp.sender_username,
    tp.sender_name,
    tp.kp_screenshot_url,
    COALESCE(v_receipt, ''),
    v_seat
  )
  RETURNING id INTO order_id;

  UPDATE public.ticket_passes
  SET
    status = 'claimed',
    receiver_uid = trim(COALESCE(p_receiver_uid, '')),
    receiver_tg_id = trim(p_receiver_tg_id),
    receiver_username = NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    sender_rewarded = true,
    claimed_at = now()
  WHERE short_id = tp.short_id;

  UPDATE public.users
  SET
    lives = lives + 4,
    lives_updated_at = now(),
    friends_brought = friends_brought + 1,
    tickets_gifted = tickets_gifted + 1,
    premiere_points = premiere_points + 3500,
    updated_at = now()
  WHERE uid = tp.sender_uid
  RETURNING lives INTO new_sender_lives;

  PERFORM public.bump_daily_metric('tickets_ordered', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', order_id,
    'sender_tg_id', COALESCE(tp.sender_tg_id, ''),
    'sender_name', COALESCE(tp.sender_name, ''),
    'sender_lives', COALESCE(new_sender_lives, 4),
    'verified_phone', clean_phone,
    'city_cinema', left(trim(p_city_cinema), 120),
    'pair_receipt_url', COALESCE(v_receipt, ''),
    'pair_seat_pref', v_seat
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Обновляем admin_update_config: добавляем тумблер REQUIRE_PAIR_RECEIPT
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean, integer);

CREATE OR REPLACE FUNCTION public.admin_update_config(
  p_win_every_n_hits integer,
  p_max_daily_tickets integer,
  p_max_premiere_winners integer,
  p_is_paused boolean,
  p_max_total_tickets integer DEFAULT NULL,
  p_require_pair_receipt boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  UPDATE public.global_stats
  SET
    win_every_n_hits = GREATEST(1, COALESCE(p_win_every_n_hits, win_every_n_hits)),
    max_daily_tickets = GREATEST(0, COALESCE(p_max_daily_tickets, max_daily_tickets)),
    max_premiere_winners = GREATEST(0, COALESCE(p_max_premiere_winners, max_premiere_winners)),
    max_total_tickets = GREATEST(0, COALESCE(p_max_total_tickets, max_total_tickets)),
    is_paused = COALESCE(p_is_paused, is_paused),
    require_pair_receipt = COALESCE(p_require_pair_receipt, require_pair_receipt),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object('ok', true, 'stats', row_to_json(gs));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_pool_status_rpc() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_gift_ticket_order(text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_config(integer, integer, integer, boolean, integer, boolean) TO authenticated;
