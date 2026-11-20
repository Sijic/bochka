-- ============================================================================
-- MIGRATION v13.0 (server_ticket_guard):
-- 1. Жёсткий серверный потолок пула билетов кампании (global_stats.max_total_tickets)
--    + настройка в /admin/ (admin_update_config)
-- 2. Серверный счётчик билетов на руках у игрока (users.pending_tickets_count)
--    и защита от повторного фарма Ур. 3 (users.level3_ticket_checked)
-- 3. Атомарная выдача билета через try_award_cinema_ticket_rpc (жёсткие лимиты:
--    is_paused, дата сгорания 16.12.2026, max_total_tickets, max_daily_tickets, hourly_cap)
-- 4. Серверная синхронизация жизненного цикла билетов в ticket_passes:
--    reconcile_user_ticket_passes_rpc (автовозврат 24ч + сгорание 16.12)
--    и reclaim_gift_ticket_pass_rpc (ручной возврат с 10.12)
-- ============================================================================

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS max_total_tickets integer NOT NULL DEFAULT 150;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pending_tickets_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level3_ticket_checked boolean NOT NULL DEFAULT false;

-- Синхронизируем pending_tickets_count с существующим флагом has_pending_ticket
UPDATE public.users
SET pending_tickets_count = GREATEST(pending_tickets_count, CASE WHEN has_pending_ticket THEN 1 ELSE 0 END)
WHERE has_pending_ticket = true AND pending_tickets_count = 0;

-- Расширяем допустимые статусы ticket_passes (добавляем reclaimed и burned_dec16)
ALTER TABLE public.ticket_passes DROP CONSTRAINT IF EXISTS ticket_passes_status_check;
ALTER TABLE public.ticket_passes
  ADD CONSTRAINT ticket_passes_status_check
  CHECK (status IN ('issued', 'claimed', 'sent', 'rejected', 'expired_returned', 'reclaimed', 'burned_dec16'));

-- ----------------------------------------------------------------------------
-- 1. Жёсткий серверный резерв билета (Ур. 3 / Дуэль / Суперигра)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_award_cinema_ticket_rpc(
  p_uid text,
  p_source text DEFAULT 'level3'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'level3')));
  cfg public.global_stats%ROWTYPE;
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  hour_stamp text := to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD-HH24');
  v_hourly_cap integer := 1;
  v_burn_deadline timestamptz := timestamptz '2026-12-16 00:00:00+05';
  v_deny_reason text := '';
  v_fallback_pts integer := 250;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'uid_required');
  END IF;

  IF public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'reason', 'sandbox_uid_blocked', 'fallback_points', 0);
  END IF;

  -- Гарантируем наличие строки игрока
  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'config_missing');
  END IF;

  -- Сброс суточного и часового счётчиков по МСК
  IF cfg.daily_reset_date < msk_date THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := msk_date;
  END IF;
  IF coalesce(cfg.hourly_reset_stamp, '') <> hour_stamp THEN
    cfg.hourly_tickets_issued := 0;
    cfg.hourly_reset_stamp := hour_stamp;
  END IF;

  v_hourly_cap := LEAST(
    GREATEST(1, coalesce(cfg.max_daily_tickets, 5)),
    GREATEST(2, CEIL(GREATEST(1, coalesce(cfg.max_daily_tickets, 5))::numeric / 6.0)::integer)
  );

  -- Жёсткие проверки стоп-крана продюсера
  IF now() >= v_burn_deadline THEN
    v_deny_reason := 'campaign_ended_dec16';
  ELSIF coalesce(cfg.is_paused, false) THEN
    v_deny_reason := 'paused';
  ELSIF v_src = 'level3' AND coalesce(u.level3_ticket_checked, false) THEN
    v_deny_reason := 'level3_already_checked';
    v_fallback_pts := 150;
  ELSIF coalesce(cfg.tickets_won, 0) >= coalesce(cfg.max_total_tickets, 150) THEN
    v_deny_reason := 'total_cap_reached';
  ELSIF coalesce(cfg.daily_tickets_issued, 0) >= coalesce(cfg.max_daily_tickets, 5) THEN
    v_deny_reason := 'daily_cap_reached';
  ELSIF coalesce(cfg.hourly_tickets_issued, 0) >= v_hourly_cap THEN
    v_deny_reason := 'hourly_cap_reached';
  END IF;

  IF v_deny_reason <> '' THEN
    UPDATE public.global_stats
    SET
      daily_tickets_issued = cfg.daily_tickets_issued,
      daily_reset_date = cfg.daily_reset_date,
      hourly_tickets_issued = cfg.hourly_tickets_issued,
      hourly_reset_stamp = cfg.hourly_reset_stamp
    WHERE id = 1;

    UPDATE public.users
    SET
      premiere_points = premiere_points + v_fallback_pts,
      level3_ticket_checked = (level3_ticket_checked OR v_src = 'level3'),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', v_deny_reason,
      'fallback_points', v_fallback_pts,
      'premiere_points', u.premiere_points,
      'pending_tickets_count', coalesce(u.pending_tickets_count, 0),
      'daily_tickets_issued', cfg.daily_tickets_issued,
      'max_daily_tickets', cfg.max_daily_tickets,
      'tickets_won', cfg.tickets_won,
      'max_total_tickets', cfg.max_total_tickets
    );
  END IF;

  -- Слот разрешён: атомарно списываем 1 билет из общего и суточного пула
  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued + 1,
    daily_reset_date = cfg.daily_reset_date,
    hourly_tickets_issued = cfg.hourly_tickets_issued + 1,
    hourly_reset_stamp = cfg.hourly_reset_stamp,
    tickets_won = coalesce(cfg.tickets_won, 0) + 1,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO cfg;

  UPDATE public.users
  SET
    pending_tickets_count = coalesce(pending_tickets_count, 0) + 1,
    has_pending_ticket = true,
    level3_ticket_checked = (level3_ticket_checked OR v_src = 'level3'),
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
-- 2. Обновляем issue_gift_ticket_link: списывает ровно 1 из pending_tickets_count
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_gift_ticket_link(
  p_short_id text,
  p_sender_uid text,
  p_sender_tg_id text DEFAULT NULL,
  p_sender_username text DEFAULT NULL,
  p_sender_name text DEFAULT '',
  p_recipient_name text DEFAULT '',
  p_recipient_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  v_photo text := NULLIF(trim(COALESCE(p_recipient_photo_url, '')), '');
  v_avail integer := 0;
  v_next integer := 0;
BEGIN
  IF public.is_sandbox_uid(p_sender_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  IF now() >= timestamptz '2026-12-16 00:00:00+05' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_ended_dec16');
  END IF;

  IF v_photo IS NOT NULL AND v_photo !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/passes/' THEN
    v_photo := NULL;
  END IF;

  SELECT * INTO u FROM public.users WHERE uid = trim(p_sender_uid) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_ticket');
  END IF;

  v_avail := GREATEST(coalesce(u.pending_tickets_count, 0), CASE WHEN coalesce(u.has_pending_ticket, false) THEN 1 ELSE 0 END);
  IF v_avail <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_ticket');
  END IF;

  INSERT INTO public.ticket_passes (
    short_id, sender_uid, sender_tg_id, sender_username, sender_name,
    recipient_name, recipient_photo_url, kp_screenshot_url, status
  )
  VALUES (
    trim(p_short_id),
    trim(p_sender_uid),
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    left(COALESCE(p_recipient_name, ''), 50),
    v_photo,
    u.kp_screenshot_url,
    'issued'
  );

  v_next := GREATEST(0, v_avail - 1);
  UPDATE public.users
  SET
    pending_tickets_count = v_next,
    has_pending_ticket = (v_next > 0),
    updated_at = now()
  WHERE uid = trim(p_sender_uid);

  RETURN jsonb_build_object('ok', true, 'gift_id', trim(p_short_id), 'remaining_pending', v_next);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Серверный жизненный цикл билетов (24ч автовозврат + сгорание 16.12)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_user_ticket_passes_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_returned integer := 0;
  v_burned integer := 0;
  v_burn_deadline timestamptz := timestamptz '2026-12-16 00:00:00+05';
  v_pending integer := 0;
  v_passes jsonb := '[]'::jsonb;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  IF now() >= v_burn_deadline THEN
    UPDATE public.ticket_passes
    SET status = 'burned_dec16'
    WHERE sender_uid = v_uid AND status = 'issued';
    GET DIAGNOSTICS v_burned = ROW_COUNT;

    IF v_burned > 0 THEN
      UPDATE public.global_stats
      SET tickets_burned = coalesce(tickets_burned, 0) + v_burned, updated_at = now()
      WHERE id = 1;
    END IF;

    UPDATE public.users
    SET pending_tickets_count = 0, has_pending_ticket = false, updated_at = now()
    WHERE uid = v_uid;
  ELSE
    -- Автовозврат неактивированных билетов старше 24ч (слот переиспользуется без довыпуска!)
    UPDATE public.ticket_passes
    SET status = 'expired_returned'
    WHERE sender_uid = v_uid
      AND status = 'issued'
      AND created_at < (now() - interval '24 hours');
    GET DIAGNOSTICS v_returned = ROW_COUNT;

    IF v_returned > 0 THEN
      UPDATE public.users
      SET
        pending_tickets_count = coalesce(pending_tickets_count, 0) + v_returned,
        has_pending_ticket = true,
        updated_at = now()
      WHERE uid = v_uid;
    END IF;
  END IF;

  SELECT GREATEST(coalesce(pending_tickets_count, 0), CASE WHEN coalesce(has_pending_ticket, false) THEN 1 ELSE 0 END)
  INTO v_pending
  FROM public.users
  WHERE uid = v_uid;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'passId', tp.short_id,
    'recipientName', coalesce(tp.recipient_name, 'Друг'),
    'status', tp.status,
    'sentAt', floor(extract(epoch from tp.created_at) * 1000),
    'expires24hAt', floor(extract(epoch from (tp.created_at + interval '24 hours')) * 1000)
  ) ORDER BY tp.created_at DESC), '[]'::jsonb)
  INTO v_passes
  FROM public.ticket_passes tp
  WHERE tp.sender_uid = v_uid
  LIMIT 25;

  RETURN jsonb_build_object(
    'ok', true,
    'returned_count', v_returned,
    'burned_count', v_burned,
    'pending_tickets_count', coalesce(v_pending, 0),
    'passes', v_passes
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Ручной возврат билета отправителем (с 10.12 или после 24ч)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reclaim_gift_ticket_pass_rpc(
  p_uid text,
  p_short_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_sid text := trim(coalesce(p_short_id, ''));
  v_tp public.ticket_passes%ROWTYPE;
  v_next integer := 0;
BEGIN
  IF v_uid = '' OR v_sid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  IF now() >= timestamptz '2026-12-16 00:00:00+05' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_ended_dec16');
  END IF;

  SELECT * INTO v_tp
  FROM public.ticket_passes
  WHERE short_id = v_sid AND sender_uid = v_uid
  FOR UPDATE;

  IF NOT FOUND OR v_tp.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reclaimable');
  END IF;

  IF now() < timestamptz '2026-12-10 00:00:00+05' AND v_tp.created_at >= (now() - interval '24 hours') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early_to_reclaim');
  END IF;

  UPDATE public.ticket_passes
  SET status = 'reclaimed'
  WHERE short_id = v_sid;

  UPDATE public.users
  SET
    pending_tickets_count = coalesce(pending_tickets_count, 0) + 1,
    has_pending_ticket = true,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING pending_tickets_count INTO v_next;

  RETURN jsonb_build_object('ok', true, 'pending_tickets_count', coalesce(v_next, 1));
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Обновляем award_duel_premiere_bank_rpc с жёсткой проверкой max_total_tickets
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_duel_premiere_bank_rpc(
  p_uid text,
  p_points_bonus integer DEFAULT 450,
  p_solo boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_pts integer := greatest(0, least(1800, coalesce(p_points_bonus, 450)));
  v_gs public.global_stats%ROWTYPE;
  v_drop_ticket boolean := false;
  v_user public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO v_gs FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF FOUND THEN
    IF v_gs.daily_reset_date < msk_date THEN
      v_gs.daily_tickets_issued := 0;
      v_gs.daily_reset_date := msk_date;
    END IF;

    IF NOT coalesce(v_gs.is_paused, false)
       AND now() < timestamptz '2026-12-16 00:00:00+05'
       AND coalesce(v_gs.tickets_won, 0) < coalesce(v_gs.max_total_tickets, 150)
       AND coalesce(v_gs.daily_tickets_issued, 0) < coalesce(v_gs.max_daily_tickets, 5)
       AND random() < (CASE WHEN p_solo THEN 0.12 ELSE 0.22 END)
    THEN
      v_drop_ticket := true;
      UPDATE public.global_stats
      SET
        daily_tickets_issued = v_gs.daily_tickets_issued + 1,
        daily_reset_date = v_gs.daily_reset_date,
        tickets_won = coalesce(v_gs.tickets_won, 0) + 1,
        updated_at = now()
      WHERE id = 1;
    END IF;
  END IF;

  UPDATE public.users
  SET
    premiere_points = premiere_points + v_pts,
    duels_played = duels_played + 1,
    duels_won = duels_won + 1,
    pending_tickets_count = coalesce(pending_tickets_count, 0) + (CASE WHEN v_drop_ticket THEN 1 ELSE 0 END),
    has_pending_ticket = CASE WHEN v_drop_ticket THEN true ELSE has_pending_ticket END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'premiere_points', v_user.premiere_points,
    'lives', v_user.lives,
    'duels_won', v_user.duels_won,
    'pending_tickets_count', coalesce(v_user.pending_tickets_count, 0),
    'ticket_dropped', v_drop_ticket
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Обновляем admin_update_config (добавляем max_total_tickets без перегрузки PGRST203)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.admin_update_config(
  p_win_every_n_hits integer,
  p_max_daily_tickets integer,
  p_max_premiere_winners integer,
  p_is_paused boolean,
  p_max_total_tickets integer DEFAULT NULL
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
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object('ok', true, 'stats', row_to_json(gs));
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_award_cinema_ticket_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_user_ticket_passes_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_gift_ticket_pass_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_duel_premiere_bank_rpc(text, integer, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_config(integer, integer, integer, boolean, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Защищаем legacy try_reserve_ticket_slot общим потолком max_total_tickets и датой 16.12
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_reserve_ticket_slot(p_increment_strike boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.global_stats%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  hour_stamp text := to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD-HH24');
  hourly_cap integer := 1;
BEGIN
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF cfg.daily_reset_date < msk_date THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := msk_date;
  END IF;

  IF COALESCE(cfg.hourly_reset_stamp, '') <> hour_stamp THEN
    cfg.hourly_tickets_issued := 0;
    cfg.hourly_reset_stamp := hour_stamp;
  END IF;

  hourly_cap := LEAST(
    GREATEST(1, COALESCE(cfg.max_daily_tickets, 5)),
    GREATEST(2, CEIL(GREATEST(1, COALESCE(cfg.max_daily_tickets, 5))::numeric / 6.0)::integer)
  );

  IF NOT cfg.is_paused
     AND now() < timestamptz '2026-12-16 00:00:00+05'
     AND COALESCE(cfg.tickets_won, 0) < COALESCE(cfg.max_total_tickets, 150)
     AND cfg.daily_tickets_issued < cfg.max_daily_tickets
     AND cfg.hourly_tickets_issued < hourly_cap
  THEN
    UPDATE public.global_stats
    SET
      daily_tickets_issued = cfg.daily_tickets_issued + 1,
      daily_reset_date = cfg.daily_reset_date,
      hourly_tickets_issued = cfg.hourly_tickets_issued + 1,
      hourly_reset_stamp = cfg.hourly_reset_stamp,
      tickets_won = tickets_won + 1,
      updated_at = now()
    WHERE id = 1;
    RETURN true;
  END IF;

  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued,
    daily_reset_date = cfg.daily_reset_date,
    hourly_tickets_issued = cfg.hourly_tickets_issued,
    hourly_reset_stamp = cfg.hourly_reset_stamp
  WHERE id = 1;
  RETURN false;
END;
$$;
