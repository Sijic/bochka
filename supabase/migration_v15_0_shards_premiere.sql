-- ============================================================================
-- MIGRATION v15.0 (shards_premiere):
-- 1. Простая азартная механика билетов: 4 части (25% × 4) = 1 целый билет ДРУГУ (БЕЗ чеков!)
--    - global_stats: max_total_tickets = 100, max_daily_tickets = 6,
--      max_premiere_winners = 20, require_pair_receipt = false (по умолчанию)
--    - users: ticket_shards (0..3 -> 4-я часть склеивает 1 целый билет и сбрасывает в 0)
-- 2. Атомарный серверный RPC award_ticket_shard_rpc(p_uid, p_source):
--    - Исключает is_seed_admin и is_blogger_seed из призового пула
--    - На 1/4, 2/4, 3/4 инкрементит ticket_shards
--    - На 4/4 атомарно проверяет лимит global_stats (100 всего / 6 в сутки МСК):
--      * если слот есть -> склеивает 1 целый билет (pending_tickets_count + 1, ticket_shards = 0)
--      * если дневной/общий пул выбран -> +500 ⭐ в рейтинг Закрытого показа (ticket_shards = 0)
-- 3. Чистая активация подарка другом submit_gift_ticket_order (без чека по умолчанию,
--    жёсткий запрет самовыкупа opener_uid != sender_uid и receiver_tg_id != sender_tg_id)
-- ============================================================================

ALTER TABLE public.global_stats
  ALTER COLUMN require_pair_receipt SET DEFAULT false;

UPDATE public.global_stats
SET
  max_total_tickets = 100,
  max_daily_tickets = 6,
  max_premiere_winners = 20,
  require_pair_receipt = false,
  updated_at = now()
WHERE id = 1;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ticket_shards integer NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 1. Живой остаток пула билетов (обновлённый дефолт: 6/сут, 100 всего, без чеков)
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
  v_max_daily integer := 6;
  v_total_issued integer := 0;
  v_max_total integer := 100;
  v_daily_rem integer := 0;
  v_total_rem integer := 0;
BEGIN
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_max_daily := GREATEST(0, COALESCE(cfg.max_daily_tickets, 6));
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
    'require_pair_receipt', COALESCE(cfg.require_pair_receipt, false),
    'max_premiere_winners', GREATEST(1, COALESCE(cfg.max_premiere_winners, 20))
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Атомарная выдача 1 части билета (1/4 -> 2/4 -> 3/4 -> 4/4 склейка в целый билет)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_ticket_shard_rpc(
  p_uid text,
  p_source text DEFAULT 'level'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'level')));
  cfg public.global_stats%ROWTYPE;
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_burn_deadline timestamptz := timestamptz '2026-12-16 00:00:00+05';
  v_prev_shards integer := 0;
  v_next_shards integer := 0;
  v_deny_reason text := '';
  v_fallback_pts integer := 500;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'uid_required');
  END IF;

  IF public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'merged_ticket', false, 'shards', 0, 'reason', 'sandbox_uid_blocked', 'fallback_points', 0);
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  -- Игроки команды посева (продюсеры и блогеры) исключены из розыгрыша призовых билетов
  IF COALESCE(u.is_seed_admin, false) OR COALESCE(u.is_blogger_seed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'merged_ticket', false,
      'shards', COALESCE(u.ticket_shards, 0),
      'reason', 'seed_admin_excluded',
      'fallback_points', 0,
      'pending_tickets_count', 0
    );
  END IF;

  v_prev_shards := LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0)));
  v_next_shards := v_prev_shards + 1;

  -- Части 1/4, 2/4, 3/4 просто накапливаются без списания пула
  IF v_next_shards < 4 THEN
    UPDATE public.users
    SET
      ticket_shards = v_next_shards,
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', u.ticket_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  -- 4-я часть (4/4): атомарно проверяем жёсткий потолок global_stats (100 всего / 6 в сутки МСК)
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'config_missing');
  END IF;

  IF cfg.daily_reset_date < msk_date THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := msk_date;
  END IF;

  IF now() >= v_burn_deadline THEN
    v_deny_reason := 'campaign_ended_dec16';
  ELSIF COALESCE(cfg.is_paused, false) THEN
    v_deny_reason := 'paused';
  ELSIF COALESCE(cfg.tickets_won, 0) >= COALESCE(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_cap_reached';
  ELSIF COALESCE(cfg.daily_tickets_issued, 0) >= COALESCE(cfg.max_daily_tickets, 6) THEN
    v_deny_reason := 'daily_cap_reached';
  END IF;

  IF v_deny_reason <> '' THEN
    UPDATE public.global_stats
    SET
      daily_tickets_issued = cfg.daily_tickets_issued,
      daily_reset_date = cfg.daily_reset_date,
      updated_at = now()
    WHERE id = 1;

    UPDATE public.users
    SET
      ticket_shards = 0,
      premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts,
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', 0,
      'prev_shards', 4,
      'merged_ticket', false,
      'granted', false,
      'reason', v_deny_reason,
      'fallback_points', v_fallback_pts,
      'premiere_points', u.premiere_points,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'daily_tickets_issued', cfg.daily_tickets_issued,
      'max_daily_tickets', cfg.max_daily_tickets,
      'tickets_won', cfg.tickets_won,
      'max_total_tickets', cfg.max_total_tickets
    );
  END IF;

  -- Слот в пуле есть -> склеиваем 4 части в 1 целый золотой билет для друга, сбрасываем shards = 0
  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued + 1,
    daily_reset_date = cfg.daily_reset_date,
    tickets_won = COALESCE(cfg.tickets_won, 0) + 1,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO cfg;

  UPDATE public.users
  SET
    ticket_shards = 0,
    pending_tickets_count = COALESCE(pending_tickets_count, 0) + 1,
    has_pending_ticket = true,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'source', v_src,
    'shards', 0,
    'prev_shards', 4,
    'merged_ticket', true,
    'granted', true,
    'pending_tickets_count', u.pending_tickets_count,
    'premiere_points', u.premiere_points,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', cfg.max_daily_tickets,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Обновляем try_award_cinema_ticket_rpc (совместимость + исключение blogger_seed + 6/сут + 500 ⭐)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_award_cinema_ticket_rpc(
  p_uid text,
  p_source text DEFAULT 'shard4'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'shard4')));
  cfg public.global_stats%ROWTYPE;
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_burn_deadline timestamptz := timestamptz '2026-12-16 00:00:00+05';
  v_deny_reason text := '';
  v_fallback_pts integer := 500;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'uid_required');
  END IF;

  IF public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'reason', 'sandbox_uid_blocked', 'fallback_points', 0);
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  IF COALESCE(u.is_seed_admin, false) OR COALESCE(u.is_blogger_seed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'seed_admin_excluded',
      'fallback_points', 0,
      'pending_tickets_count', 0
    );
  END IF;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'config_missing');
  END IF;

  IF cfg.daily_reset_date < msk_date THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := msk_date;
  END IF;

  IF now() >= v_burn_deadline THEN
    v_deny_reason := 'campaign_ended_dec16';
  ELSIF COALESCE(cfg.is_paused, false) THEN
    v_deny_reason := 'paused';
  ELSIF COALESCE(cfg.tickets_won, 0) >= COALESCE(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_cap_reached';
  ELSIF COALESCE(cfg.daily_tickets_issued, 0) >= COALESCE(cfg.max_daily_tickets, 6) THEN
    v_deny_reason := 'daily_cap_reached';
  END IF;

  IF v_deny_reason <> '' THEN
    UPDATE public.global_stats
    SET
      daily_tickets_issued = cfg.daily_tickets_issued,
      daily_reset_date = cfg.daily_reset_date,
      updated_at = now()
    WHERE id = 1;

    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts,
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', v_deny_reason,
      'fallback_points', v_fallback_pts,
      'premiere_points', u.premiere_points,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'daily_tickets_issued', cfg.daily_tickets_issued,
      'max_daily_tickets', cfg.max_daily_tickets,
      'tickets_won', cfg.tickets_won,
      'max_total_tickets', cfg.max_total_tickets
    );
  END IF;

  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued + 1,
    daily_reset_date = cfg.daily_reset_date,
    tickets_won = COALESCE(cfg.tickets_won, 0) + 1,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO cfg;

  UPDATE public.users
  SET
    pending_tickets_count = COALESCE(pending_tickets_count, 0) + 1,
    has_pending_ticket = true,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'source', v_src,
    'pending_tickets_count', u.pending_tickets_count,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', cfg.max_daily_tickets,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Обновляем submit_gift_ticket_order (без чека по умолчанию + строгий запрет opener_uid != sender_uid)
-- ----------------------------------------------------------------------------
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

  IF v_receipt IS NOT NULL AND v_receipt !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/' THEN
    v_receipt := NULL;
  END IF;

  -- v15.0: По умолчанию require_pair_receipt = false (бесплатный билет другу без чеков!)
  IF COALESCE(cfg.require_pair_receipt, false) AND v_receipt IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pair_receipt_required');
  END IF;

  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(p_gift_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Жёсткая серверная защита: собрать и забрать билет себе НЕЛЬЗЯ (opener_uid != sender_uid)
  IF (tp.sender_tg_id IS NOT NULL AND tp.sender_tg_id <> '' AND tp.sender_tg_id = trim(p_receiver_tg_id))
     OR (tp.sender_uid IS NOT NULL AND tp.sender_uid <> '' AND tp.sender_uid = trim(COALESCE(p_receiver_uid, '')))
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

GRANT EXECUTE ON FUNCTION public.get_ticket_pool_status_rpc() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_award_cinema_ticket_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_gift_ticket_order(text, text, text, text, text, text, text, text, text) TO anon, authenticated;
