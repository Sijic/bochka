-- ============================================================================
-- MIGRATION v14.2 (seed_admin_hub):
-- 1. Первые игроки-админы посева (is_seed_admin = true) — НЕ участвуют в розыгрышах
--    (билеты 1+1, Закрытая Премьера, ТОП-10/ТОП-20, Тиль-билет, выписка заказов).
-- 2. Персональные стартовые бочки (barrels.seed_traffic_source / seed_target_handle):
--    продюсер-админ из одного окна "Бот-Админ посева" может упаковать персональные бочки
--    как друзьям (src_prod1..6), так и именным блогерам (src_blogger_<name_en>),
--    и каждый получатель + вся его цепочка наследует именно метку этой бочки!
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_seed_admin boolean NOT NULL DEFAULT false;

ALTER TABLE public.barrels
  ADD COLUMN IF NOT EXISTS seed_traffic_source text,
  ADD COLUMN IF NOT EXISTS seed_target_handle text;

-- 1. Регистрация/пометка первого игрока-админа посева (команда / продюсер)
CREATE OR REPLACE FUNCTION public.register_seed_admin_rpc(
  p_uid text,
  p_tg_id text DEFAULT NULL,
  p_tg_username text DEFAULT NULL,
  p_display_name text DEFAULT '',
  p_seed_tag text DEFAULT 'seed_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_uid text := trim(COALESCE(p_uid, ''));
  clean_tag text := left(regexp_replace(lower(trim(COALESCE(p_seed_tag, 'seed_admin'))), '[^a-z0-9_]', '', 'g'), 40);
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN
    RETURN jsonb_build_object('ok', true, 'is_seed_admin', true, 'sandbox', true);
  END IF;
  IF clean_tag = '' THEN clean_tag := 'seed_admin'; END IF;

  PERFORM public.get_or_create_player_profile(clean_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));

  UPDATE public.users
  SET
    is_seed_admin = true,
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN clean_tag ELSE traffic_source END,
    updated_at = now()
  WHERE uid = clean_uid;

  RETURN jsonb_build_object('ok', true, 'uid', clean_uid, 'is_seed_admin', true, 'seed_tag', clean_tag);
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_seed_admin_rpc(text, text, text, text, text) TO anon, authenticated;

-- 2. Обновляем create_barrel_pack_rpc (поддержка персональной метки на бочке для друга/блогера)
DROP FUNCTION IF EXISTS public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_barrel_pack_rpc(
  p_short_id text,
  p_mode text,
  p_message text,
  p_frame_style text,
  p_sender_uid text,
  p_sender_tg_id text,
  p_sender_username text,
  p_sender_name text,
  p_photo_url text,
  p_voice_url text,
  p_target_index integer,
  p_seed_traffic_source text DEFAULT NULL,
  p_seed_target_handle text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := NULLIF(trim(COALESCE(p_sender_uid, '')), '');
  v_photo text := NULLIF(trim(COALESCE(p_photo_url, '')), '');
  v_voice text := NULLIF(trim(COALESCE(p_voice_url, '')), '');
  v_seed_src text := NULLIF(left(regexp_replace(lower(trim(COALESCE(p_seed_traffic_source, ''))), '[^a-z0-9_]', '', 'g'), 40), '');
  v_seed_handle text := NULLIF(left(trim(COALESCE(p_seed_target_handle, '')), 40), '');
  v_prev_surge boolean := false;
  v_prev_stage smallint := 1;
  v_surge_now boolean := false;
  v_score numeric(5,2) := 72.00;
  v_ui_stage smallint := 3;
  v_packed integer := 1;
  v_has_social boolean := false;
BEGIN
  IF p_short_id IS NULL OR length(trim(p_short_id)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_short_id');
  END IF;
  IF v_uid IS NOT NULL AND public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;
  IF v_seed_src IS NOT NULL AND v_seed_src NOT LIKE 'src\_%' THEN
    v_seed_src := NULL;
  END IF;

  IF v_photo IS NOT NULL AND v_photo !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_photo := NULL;
  END IF;
  IF v_voice IS NOT NULL AND v_voice !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_voice := NULL;
  END IF;

  INSERT INTO public.barrels (
    short_id, mode, message, frame_style,
    sender_uid, sender_tg_id, sender_username, sender_name,
    photo_url, voice_url, target_index,
    seed_traffic_source, seed_target_handle
  )
  VALUES (
    trim(p_short_id),
    COALESCE(p_mode, 'friend'),
    left(COALESCE(p_message, ''), 80),
    COALESCE(p_frame_style, 'flashlight'),
    v_uid,
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    v_photo,
    v_voice,
    GREATEST(0, LEAST(9, COALESCE(p_target_index, 0))),
    v_seed_src,
    v_seed_handle
  );

  IF v_uid IS NOT NULL THEN
    SELECT temu_surge_claimed, ui_stage
    INTO v_prev_surge, v_prev_stage
    FROM public.users
    WHERE uid = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      v_prev_surge := false;
      v_prev_stage := 1;
    END IF;

    v_has_social := EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = v_uid OR sc.receiver_uid = v_uid
    );

    v_surge_now := NOT COALESCE(v_prev_surge, false);

    INSERT INTO public.users (
      uid, tg_user_id, tg_username, display_name,
      packed_count, premiere_score, temu_surge_claimed, ui_stage, lives_updated_at
    )
    VALUES (
      v_uid,
      NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
      NULLIF(trim(COALESCE(p_sender_username, '')), ''),
      left(COALESCE(p_sender_name, ''), 48),
      1,
      72.00,
      true,
      3,
      now()
    )
    ON CONFLICT (uid) DO UPDATE SET
      packed_count = public.users.packed_count + 1,
      premiere_score = GREATEST(public.users.premiere_score, 72.00),
      temu_surge_claimed = true,
      ui_stage = GREATEST(
        public.users.ui_stage,
        CASE
          WHEN NOT public.users.temu_surge_claimed THEN 3
          WHEN v_has_social OR public.users.duels_played > 0 OR public.users.friends_brought > 0 THEN 4
          ELSE 3
        END
      ),
      updated_at = now()
    RETURNING premiere_score, ui_stage, packed_count
    INTO v_score, v_ui_stage, v_packed;
  END IF;

  PERFORM public.bump_daily_metric('barrels_created', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'short_id', trim(p_short_id),
    'surge_triggered', v_surge_now,
    'premiere_score', v_score,
    'ui_stage', v_ui_stage,
    'packed_count', v_packed,
    'temu_surge_claimed', true,
    'seed_traffic_source', v_seed_src,
    'seed_target_handle', v_seed_handle
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer, text, text) TO anon, authenticated;

-- 3. Наследование персональной метки бочки (barrels.seed_traffic_source > sender.traffic_source)
CREATE OR REPLACE FUNCTION public.record_traffic_source_rpc(
  p_uid text, p_source text, p_tg_id text DEFAULT NULL, p_tg_username text DEFAULT NULL, p_display_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_uid text := trim(COALESCE(p_uid, ''));
  raw_src text := lower(trim(COALESCE(p_source, '')));
  clean_src text;
  ref_uid text := NULL;
  parent_src text;
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN
    RETURN jsonb_build_object('ok', true, 'sandbox', true);
  END IF;
  clean_src := left(regexp_replace(raw_src, '[^a-z0-9_]', '', 'g'), 40);
  IF clean_src = '' THEN clean_src := 'organic'; END IF;

  PERFORM public.get_or_create_player_profile(clean_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));

  -- Друг или блогер пришёл по бочке (pack_<id>) -> берём сначала персональную метку самой бочки, затем источник отправителя!
  IF clean_src LIKE 'pack\_%' THEN
    SELECT COALESCE(NULLIF(b.seed_traffic_source, ''), NULLIF(u.traffic_source, ''), 'organic'), b.sender_uid
    INTO parent_src, ref_uid
    FROM public.barrels b LEFT JOIN public.users u ON u.uid = b.sender_uid
    WHERE b.short_id = substring(clean_src FROM 6) LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  ELSIF clean_src LIKE 'ref\_%' THEN
    ref_uid := substring(clean_src FROM 5);
    SELECT COALESCE(NULLIF(u.traffic_source, ''), 'organic') INTO parent_src
    FROM public.users u WHERE lower(u.uid) = lower(ref_uid) LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  END IF;

  UPDATE public.users SET
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN clean_src ELSE traffic_source END,
    referred_by_uid = COALESCE(referred_by_uid, ref_uid),
    updated_at = now()
  WHERE uid = clean_uid AND clean_uid <> COALESCE(ref_uid, '');

  RETURN jsonb_build_object('ok', true, 'uid', clean_uid, 'traffic_source', clean_src);
END; $$;
GRANT EXECUTE ON FUNCTION public.record_traffic_source_rpc(text, text, text, text, text) TO anon, authenticated;

-- 4. ЗАПРЕТ РОЗЫГРЫША БИЛЕТОВ ДЛЯ АДМИНОВ ПОСЕВА (is_seed_admin = true)
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

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  -- Админ-сеятель команды не участвует в розыгрыше призовых билетов!
  IF COALESCE(u.is_seed_admin, false) THEN
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
  IF coalesce(cfg.hourly_reset_stamp, '') <> hour_stamp THEN
    cfg.hourly_tickets_issued := 0;
    cfg.hourly_reset_stamp := hour_stamp;
  END IF;

  v_hourly_cap := LEAST(
    GREATEST(1, coalesce(cfg.max_daily_tickets, 8)),
    GREATEST(2, CEIL(GREATEST(1, coalesce(cfg.max_daily_tickets, 8))::numeric / 6.0)::integer)
  );

  IF now() >= v_burn_deadline THEN
    v_deny_reason := 'campaign_ended_dec16';
  ELSIF coalesce(cfg.is_paused, false) THEN
    v_deny_reason := 'paused';
  ELSIF v_src = 'level3' AND coalesce(u.level3_ticket_checked, false) THEN
    v_deny_reason := 'level3_already_checked';
    v_fallback_pts := 150;
  ELSIF coalesce(cfg.tickets_won, 0) >= coalesce(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_cap_reached';
  ELSIF coalesce(cfg.daily_tickets_issued, 0) >= coalesce(cfg.max_daily_tickets, 8) THEN
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
GRANT EXECUTE ON FUNCTION public.try_award_cinema_ticket_rpc(text, text) TO anon, authenticated;

-- 5. ЗАПРЕТ ВЫИГРЫША В СУПЕРИГРЕ ПРЕМЬЕРЫ И ТИЛЕ ДЛЯ АДМИНОВ ПОСЕВА
CREATE OR REPLACE FUNCTION public.play_premiere_strike(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  cfg public.global_stats%ROWTYPE;
  v_strike_seq bigint;
  roll numeric := random();
  delta numeric(6,2) := 0.00;
  new_score numeric(6,2);
  pts_gain integer := 40;
  outcome text := 'empty_screamer';
  v_qualified_100 boolean := false;
  v_win_every integer := 100;
  v_premiere_won_now boolean := false;
  v_is_seed_admin boolean := false;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;
  v_is_seed_admin := COALESCE(u.is_seed_admin, false);

  IF u.has_pending_ticket AND NOT v_is_seed_admin THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'pending_ticket_choice',
      'lives', u.lives,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'has_pending_ticket', true
    );
  END IF;

  IF u.lives <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_lives',
      'lives', 0,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'near_miss', (u.premiere_score >= 90.0)
    );
  END IF;

  v_strike_seq := nextval('public.premiere_strike_seq');
  SELECT win_every_n_hits INTO v_win_every FROM public.global_stats WHERE id = 1;
  v_win_every := GREATEST(10, COALESCE(v_win_every, 100));

  IF u.lives = 3 THEN
    u.lives_updated_at := now();
  END IF;
  u.lives := u.lives - 1;
  u.has_played_solo := true;
  v_qualified_100 := (NOT v_is_seed_admin) AND (COALESCE(u.friends_brought, 0) >= 3) AND (COALESCE(u.kp_verified, false) OR COALESCE(u.tickets_gifted, 0) >= 1);

  IF (NOT v_is_seed_admin) AND (v_strike_seq % v_win_every) = 0 THEN
    IF public.try_reserve_ticket_slot(true) THEN
      u.has_pending_ticket := true;
      outcome := 'golden_ticket';
      pts_gain := 250;
    END IF;
  END IF;

  IF outcome <> 'golden_ticket' THEN
    IF u.premiere_score < 35 THEN
      IF roll < 0.78 THEN delta := 35.00; outcome := 'score_hit'; pts_gain := 95; END IF;
    ELSIF u.premiere_score < 60 THEN
      IF roll < 0.68 THEN delta := 25.00; outcome := 'score_hit'; pts_gain := 105; END IF;
    ELSIF u.premiere_score < 80 THEN
      IF roll < 0.56 THEN delta := 12.00; outcome := 'score_hit'; pts_gain := 115; END IF;
    ELSIF u.premiere_score < 90 THEN
      IF roll < 0.44 THEN delta := 7.50; outcome := 'score_hit'; pts_gain := 125; END IF;
    ELSIF u.premiere_score < 95.5 THEN
      IF roll < 0.34 THEN delta := 2.60; outcome := 'score_hit'; pts_gain := 135; END IF;
    ELSIF u.premiere_score < 98.4 THEN
      IF roll < 0.24 THEN delta := 0.85; outcome := 'score_hit'; pts_gain := 145; END IF;
    ELSIF u.premiere_score < 99.4 THEN
      IF roll < 0.16 THEN
        delta := LEAST(0.20, GREATEST(0.00, 99.40 - u.premiere_score));
        IF delta > 0 THEN outcome := 'score_hit'; pts_gain := 160; END IF;
      END IF;
    ELSE
      IF v_qualified_100 AND NOT u.premiere_won THEN
        SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
        IF NOT cfg.is_paused AND cfg.premiere_winners_count < cfg.max_premiere_winners AND roll < 0.18 THEN
          v_premiere_won_now := true;
          outcome := 'premiere_win';
          pts_gain := 500;
          u.premiere_won := true;
          u.premiere_code := COALESCE(NULLIF(u.premiere_code, ''), 'BCH-VIP-' || upper(substr(md5(u.uid || ':' || now()::text), 1, 6)));
          UPDATE public.global_stats
          SET premiere_winners_count = premiere_winners_count + 1, updated_at = now()
          WHERE id = 1;
        END IF;
      END IF;
      IF NOT v_premiere_won_now THEN
        delta := 0.00;
        outcome := 'empty_screamer';
        pts_gain := 60;
      END IF;
    END IF;
  END IF;

  IF u.premiere_won THEN
    new_score := 100.00;
  ELSIF v_qualified_100 THEN
    new_score := LEAST(99.90, u.premiere_score + delta);
  ELSE
    new_score := LEAST(99.40, u.premiere_score + delta);
  END IF;

  IF (v_strike_seq % 10) = 0 OR outcome IN ('golden_ticket', 'premiere_win') THEN
    UPDATE public.global_stats
    SET total_strikes = GREATEST(total_strikes, v_strike_seq), updated_at = now()
    WHERE id = 1;
  END IF;

  UPDATE public.users
  SET
    lives = u.lives,
    lives_updated_at = u.lives_updated_at,
    last_strike_at = now(),
    has_played_solo = true,
    premiere_score = new_score,
    premiere_points = premiere_points + pts_gain,
    has_pending_ticket = u.has_pending_ticket,
    premiere_won = u.premiere_won,
    premiere_code = u.premiere_code,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', outcome,
    'delta', delta,
    'points_gain', pts_gain,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_points', u.premiere_points,
    'has_pending_ticket', u.has_pending_ticket,
    'premiere_won', u.premiere_won,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'near_miss', (u.lives <= 0 AND u.premiere_score >= 90.0),
    'seed_admin_excluded', v_is_seed_admin
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.play_premiere_strike(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_ocean_tapper_reward(
  p_uid text,
  p_taps integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  clean_taps integer := GREATEST(0, LEAST(120, COALESCE(p_taps, 0)));
  lives_award integer := 0;
  gift_awarded boolean := false;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF NOT u.easter_egg_claimed THEN
    IF clean_taps >= 40 THEN
      lives_award := 5;
    ELSIF clean_taps >= 20 THEN
      lives_award := 4;
    ELSE
      lives_award := 3;
    END IF;
  END IF;

  -- Админ посева НЕ забирает подарочные билеты из призового пула!
  IF NOT COALESCE(u.is_seed_admin, false) AND clean_taps >= 40 AND NOT u.easter_egg_gift_won AND NOT u.has_pending_ticket THEN
    IF public.try_reserve_ticket_slot(false) THEN
      gift_awarded := true;
    END IF;
  END IF;

  UPDATE public.users
  SET
    easter_egg_claimed = true,
    easter_egg_best_taps = GREATEST(easter_egg_best_taps, clean_taps),
    easter_egg_gift_won = (easter_egg_gift_won OR gift_awarded),
    has_pending_ticket = (has_pending_ticket OR gift_awarded),
    lives = lives + lives_award,
    lives_updated_at = CASE WHEN lives + lives_award >= 3 THEN now() ELSE lives_updated_at END,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'lives_awarded', lives_award,
    'gift_awarded', gift_awarded,
    'lives', u.lives,
    'best_taps', u.easter_egg_best_taps,
    'seed_admin_excluded', COALESCE(u.is_seed_admin, false)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_ocean_tapper_reward(text, integer) TO anon, authenticated;

-- 6. Исключаем is_seed_admin из ТОП-10/ТОП-20 розыгрыша Премьеры
CREATE OR REPLACE FUNCTION public.get_premiere_leaderboard_rpc(p_uid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leaders_arr jsonb;
  me_row public.users%ROWTYPE;
  my_rank bigint := 0;
  tenth_pts integer := 0;
  my_effective integer := 0;
  my_bonus_pct integer := 0;
  my_qualified boolean := false;
  my_tier integer := 0;
BEGIN
  WITH scored AS (
    SELECT
      uid,
      CASE
        WHEN length(trim(COALESCE(display_name, ''))) > 0 THEN left(trim(display_name), 26)
        WHEN tg_username IS NOT NULL AND length(tg_username) > 0 THEN '@' || left(tg_username, 22)
        ELSE 'Игрок #' || upper(right(uid, 4))
      END AS name,
      premiere_points,
      (CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS effective_points,
      (LEAST(5, COALESCE(friends_brought, 0)) * 10) AS friend_bonus_pct,
      CASE
        WHEN COALESCE(friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(friends_brought, 0) = 1 THEN 1
        ELSE 0
      END AS referral_tier,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed,
      updated_at,
      (COALESCE(friends_brought, 0) >= 2 AND premiere_points > 0) AS qualified_top10
    FROM public.users
    WHERE NOT COALESCE(is_seed_admin, false)
      AND NOT public.is_sandbox_uid(uid)
      AND (premiere_points > 0 OR premiere_score > 0 OR friends_brought > 0)
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
      ) AS rank,
      uid, name, premiere_points, effective_points, friend_bonus_pct, referral_tier,
      premiere_score, current_level, friends_brought, tickets_gifted, duels_won,
      premiere_confirmed, qualified_top10
    FROM scored
    ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
    LIMIT 25
  )
  SELECT COALESCE(jsonb_agg(row_to_json(ranked)), '[]'::jsonb)
  INTO leaders_arr
  FROM ranked;

  SELECT COALESCE(MIN(sub.eff_pts), 0)
  INTO tenth_pts
  FROM (
    SELECT
      (CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS eff_pts
    FROM public.users
    WHERE NOT COALESCE(is_seed_admin, false)
      AND NOT public.is_sandbox_uid(uid)
      AND premiere_points > 0
    ORDER BY
      (COALESCE(friends_brought, 0) >= 2 AND premiere_points > 0) DESC,
      ((CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer) DESC,
      duels_won DESC,
      premiere_score DESC
    LIMIT 10
  ) sub;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      my_bonus_pct := LEAST(5, COALESCE(me_row.friends_brought, 0)) * 10;
      my_effective := (CASE WHEN COALESCE(me_row.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(COALESCE(me_row.premiere_points, 0) * (1.0 + my_bonus_pct / 100.0))::integer;
      my_qualified := (NOT COALESCE(me_row.is_seed_admin, false))
        AND (COALESCE(me_row.friends_brought, 0) >= 2 AND COALESCE(me_row.premiere_points, 0) > 0);
      my_tier := CASE
        WHEN COALESCE(me_row.friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(me_row.friends_brought, 0) = 1 THEN 1
        ELSE 0
      END;

      IF NOT COALESCE(me_row.is_seed_admin, false) THEN
        SELECT COUNT(*) + 1
        INTO my_rank
        FROM public.users other
        WHERE NOT COALESCE(other.is_seed_admin, false)
          AND NOT public.is_sandbox_uid(other.uid)
          AND (other.premiere_points > 0 OR other.premiere_score > 0 OR other.friends_brought > 0)
          AND (
            ((COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) AND NOT my_qualified)
            OR (
              (COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) = my_qualified
              AND (
                ((CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                  + ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer) > my_effective
                OR (
                  ((CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                    + ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer) = my_effective
                  AND (
                    other.duels_won > me_row.duels_won
                    OR (other.duels_won = me_row.duels_won AND other.premiere_score > me_row.premiere_score)
                  )
                )
              )
            )
          );
      ELSE
        my_rank := 0;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leaders', leaders_arr,
    'tenth_points', tenth_pts,
    'me', CASE WHEN me_row.uid IS NOT NULL THEN jsonb_build_object(
      'uid', me_row.uid,
      'is_seed_admin', COALESCE(me_row.is_seed_admin, false),
      'rank', my_rank,
      'qualified_top10', my_qualified,
      'referral_tier', my_tier,
      'in_top10', (my_rank >= 1 AND my_rank <= 10 AND my_qualified),
      'premiere_points', me_row.premiere_points,
      'effective_points', my_effective,
      'friend_bonus_pct', my_bonus_pct,
      'premiere_score', me_row.premiere_score,
      'current_level', me_row.current_level,
      'friends_brought', me_row.friends_brought,
      'tickets_gifted', me_row.tickets_gifted,
      'duels_won', me_row.duels_won,
      'points_to_top10', GREATEST(0, tenth_pts - my_effective + CASE WHEN my_rank > 10 THEN 10 ELSE 0 END)
    ) ELSE NULL END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_premiere_leaderboard_rpc(text) TO anon, authenticated;

-- 7. Обновляем admin_get_dashboard: исключаем is_seed_admin из призового ТОПа, считаем отдельно seed_admins_count
CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  seq_strikes bigint := 0;
  seq_called boolean := false;
  daily_arr jsonb;
  orders_arr jsonb;
  leaders_arr jsonb;
  traffic_obj jsonb;
  tags_arr jsonb;
  stats_obj jsonb;
  v_seed_admins int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  SELECT last_value, is_called INTO seq_strikes, seq_called FROM public.premiere_strike_seq;
  IF NOT COALESCE(seq_called, false) THEN seq_strikes := 0; END IF;
  SELECT COUNT(*)::int INTO v_seed_admins FROM public.users WHERE COALESCE(is_seed_admin, false) AND NOT public.is_sandbox_uid(uid);

  stats_obj := row_to_json(gs)::jsonb || jsonb_build_object(
    'total_strikes', GREATEST(COALESCE(gs.total_strikes, 0), COALESCE(seq_strikes, 0)),
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'tickets_burned', COALESCE(gs.tickets_burned, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0),
    'seed_admins_count', v_seed_admins
  );

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day ASC), '[]'::jsonb) INTO daily_arr
  FROM (SELECT * FROM public.daily_metrics ORDER BY day DESC LIMIT 21) d;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb) INTO orders_arr
  FROM public.ticket_orders o;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) INTO leaders_arr
  FROM (
    SELECT uid, tg_user_id, tg_username, display_name, premiere_points, premiere_score,
           current_level, lives, friends_brought, tickets_gifted, duels_won, packed_count,
           kp_verified, kp_screenshot_url, premiere_won, premiere_confirmed, premiere_code,
           COALESCE(traffic_source, 'organic') AS traffic_source, updated_at
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
      AND NOT COALESCE(is_seed_admin, false)
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at DESC
    LIMIT 50
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO tags_arr
  FROM (
    SELECT COALESCE(NULLIF(traffic_source, ''), 'organic') AS tag,
           COUNT(*)::int AS players,
           COALESCE(SUM(packed_count), 0)::int AS barrels_packed,
           COALESCE(SUM(friends_brought), 0)::int AS friends_brought,
           COALESCE(SUM(tickets_gifted), 0)::int AS tickets_gifted
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
      AND NOT COALESCE(is_seed_admin, false)
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  ) t;

  SELECT jsonb_build_object(
    'friends_seed', COUNT(*) FILTER (
      WHERE traffic_source LIKE 'src\_prod%'
         OR traffic_source LIKE 'src\_prd%'
         OR traffic_source LIKE 'src\_friend%'
    ),
    'test_seed', COUNT(*) FILTER (WHERE traffic_source LIKE 'src\_test%'),
    'social_ads', COUNT(*) FILTER (WHERE traffic_source IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')),
    'bloggers_til', COUNT(*) FILTER (
      WHERE traffic_source LIKE 'src\_%'
        AND traffic_source NOT LIKE 'src\_prod%'
        AND traffic_source NOT LIKE 'src\_prd%'
        AND traffic_source NOT LIKE 'src\_friend%'
        AND traffic_source NOT LIKE 'src\_test%'
        AND traffic_source NOT IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')
    ),
    'referrals_viral', COUNT(*) FILTER (WHERE COALESCE(NULLIF(traffic_source,''),'organic') NOT LIKE 'src\_%'),
    'seed_admins_count', v_seed_admins,
    'by_tag', tags_arr
  ) INTO traffic_obj
  FROM public.users
  WHERE NOT public.is_sandbox_uid(uid)
    AND NOT COALESCE(is_seed_admin, false);

  RETURN jsonb_build_object(
    'ok', true,
    'stats', stats_obj,
    'daily', daily_arr,
    'orders', orders_arr,
    'leaders', leaders_arr,
    'traffic', traffic_obj
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard() TO authenticated;
