-- v20.7: Viral x2 Boost + First Friend/Duel Exclusive + Branch Battle + Homescreen Shortcut + Rework Guard

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS points_boost_x2_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_social_exclusive_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homescreen_shortcut_added boolean NOT NULL DEFAULT false;

-- Обновляем get_or_create_player_profile (сохраняя все поля v20.4 + новые поля v20.7)
CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(
  p_uid text,
  p_tg_id text DEFAULT NULL::text,
  p_tg_username text DEFAULT NULL::text,
  p_display_name text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u public.users%ROWTYPE;
  inserted_count int := 0;
  v_has_social boolean := false;
  v_friends_count int := 0;
  v_has_broadcast boolean := false;
  v_effective_stage smallint := 1;
  v_trophies_count int := 0;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, lives)
  VALUES (
    trim(p_uid),
    NULLIF(trim(COALESCE(p_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_tg_username, '')), ''),
    COALESCE(p_display_name, ''),
    3
  )
  ON CONFLICT (uid) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    PERFORM public.bump_daily_metric('players', 1);
  END IF;

  UPDATE public.users
  SET
    tg_user_id = COALESCE(NULLIF(trim(COALESCE(p_tg_id, '')), ''), tg_user_id),
    tg_username = COALESCE(NULLIF(trim(COALESCE(p_tg_username, '')), ''), tg_username),
    display_name = CASE WHEN length(trim(COALESCE(p_display_name, ''))) > 0 THEN trim(p_display_name) ELSE display_name END,
    daily_shares_count = CASE WHEN daily_shares_date < msk_date THEN 0 ELSE daily_shares_count END,
    daily_shares_date = msk_date,
    daily_share_points = CASE WHEN daily_share_points_date < msk_date THEN 0 ELSE COALESCE(daily_share_points, 0) END,
    daily_share_points_date = msk_date,
    daily_social_mask = CASE WHEN daily_social_date < msk_date THEN '' ELSE daily_social_mask END,
    daily_social_date = msk_date,
    superprize_unlocked_at = CASE
      WHEN superprize_unlocked_at IS NULL AND COALESCE(premiere_points, 0) >= 5000 THEN now()
      ELSE superprize_unlocked_at
    END,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  SELECT COUNT(*)::integer
  INTO v_trophies_count
  FROM public.user_trophies ut
  WHERE ut.owner_uid = u.uid;

  SELECT COUNT(DISTINCT CASE WHEN sc.sender_uid = u.uid THEN sc.receiver_uid ELSE sc.sender_uid END)::integer
  INTO v_friends_count
  FROM public.social_connections sc
  WHERE (
      sc.sender_uid = u.uid
      OR sc.receiver_uid = u.uid
      OR (
        u.tg_user_id IS NOT NULL
        AND (sc.sender_tg_id = u.tg_user_id OR sc.receiver_tg_id = u.tg_user_id)
      )
    )
    AND sc.sender_uid <> sc.receiver_uid
    AND NOT public.is_sandbox_uid(CASE WHEN sc.sender_uid = u.uid THEN sc.receiver_uid ELSE sc.sender_uid END);

  v_friends_count := GREATEST(
    COALESCE(u.friends_brought, 0),
    COALESCE(v_friends_count, 0),
    CASE WHEN u.referred_by_uid IS NOT NULL AND u.referred_by_uid <> '' AND u.referred_by_uid <> u.uid THEN 1 ELSE 0 END
  );

  v_has_social := v_friends_count > 0;

  v_has_broadcast := EXISTS (
    SELECT 1
    FROM public.barrels b
    WHERE b.sender_uid = u.uid
      AND COALESCE(b.is_broadcast, false) = true
  );

  v_effective_stage := GREATEST(
    LEAST(COALESCE(u.ui_stage, 1), 3),
    CASE
      WHEN COALESCE(u.duels_played, 0) > 0
        OR COALESCE(u.current_level, 1) >= 6
        OR COALESCE(u.premiere_points, 0) >= 1500 THEN 4
      WHEN COALESCE(u.packed_count, 0) >= 1 OR COALESCE(u.temu_surge_claimed, false) THEN 3
      WHEN COALESCE(u.has_played_solo, false) OR COALESCE(u.current_level, 1) >= 2 THEN 2
      ELSE 1
    END
  );

  IF v_effective_stage <> COALESCE(u.ui_stage, 1) THEN
    UPDATE public.users
    SET ui_stage = v_effective_stage,
        updated_at = now()
    WHERE uid = u.uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_points', u.premiere_points,
    'current_level', u.current_level,
    'has_played_solo', u.has_played_solo,
    'tickets_gifted', u.tickets_gifted,
    'duels_won', u.duels_won,
    'duels_played', u.duels_played,
    'trophies_count', COALESCE(v_trophies_count, 0),
    'golden_ticket_shards', LEAST(12, GREATEST(0, COALESCE(u.golden_ticket_shards, 0))),
    'golden_levels_claimed', COALESCE(to_jsonb(u.golden_levels_claimed), '[]'::jsonb),
    'superprize_unlocked_at', u.superprize_unlocked_at,
    'trailer_rewarded', u.trailer_rewarded,
    'trailer_watched_full', COALESCE(u.trailer_watched_full, false),
    'kp_click_rewarded', u.kp_click_rewarded,
    'daily_social_mask', u.daily_social_mask,
    'premiere_won', u.premiere_won,
    'premiere_confirmed', u.premiere_confirmed,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'has_pending_ticket', u.has_pending_ticket,
    'pending_tickets_count', COALESCE(u.pending_tickets_count, CASE WHEN u.has_pending_ticket THEN 1 ELSE 0 END),
    'ticket_shards', LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0))),
    'kp_verified', u.kp_verified,
    'kp_screenshot_url', COALESCE(u.kp_screenshot_url, ''),
    'packed_count', u.packed_count,
    'friends_brought', u.friends_brought,
    'friends_count', v_friends_count,
    'daily_shares_count', u.daily_shares_count,
    'daily_share_points', COALESCE(u.daily_share_points, 0),
    'avatar_url', COALESCE(u.avatar_url, ''),
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won,
    'last_special_knock_at', u.last_special_knock_at,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', u.temu_surge_claimed,
    'has_social_connection', v_has_social,
    'is_seed_admin', COALESCE(u.is_seed_admin, false),
    'is_blogger_seed', COALESCE(u.is_blogger_seed, false),
    'seed_prefix', COALESCE(u.seed_prefix, ''),
    'traffic_source', COALESCE(u.traffic_source, ''),
    'has_broadcast_barrel', v_has_broadcast,
    'tg_write_access', COALESCE(u.tg_write_access, false) OR (u.tg_chat_id IS NOT NULL),
    'points_boost_x2_until', u.points_boost_x2_until,
    'first_social_exclusive_claimed', COALESCE(u.first_social_exclusive_claimed, false),
    'homescreen_shortcut_added', COALESCE(u.homescreen_shortcut_added, false)
  );
END;
$function$;

-- Эксклюзив за 1-го друга или 1-ю дуэль 1x1: доступ к 3/4-4/4, редкая кино-фишка, буст очков x2 на 15 мин
CREATE OR REPLACE FUNCTION public.claim_first_social_exclusive_rpc(
  p_uid text,
  p_trigger text DEFAULT 'friend_or_duel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_trig text := lower(trim(coalesce(p_trigger, 'friend_or_duel')));
  u public.users%ROWTYPE;
  v_eligible boolean := false;
  v_boost_until timestamptz;
  v_new_pts integer := 0;
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  IF COALESCE(u.first_social_exclusive_claimed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'already_claimed', true,
      'reason', 'already_claimed',
      'points_boost_x2_until', u.points_boost_x2_until,
      'premiere_points', COALESCE(u.premiere_points, 0),
      'rare_chip_unlocked', true,
      'shards_34_unlocked', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.social_connections sc
    WHERE (sc.sender_uid = v_uid OR sc.receiver_uid = v_uid)
      AND sc.sender_uid <> sc.receiver_uid
  ) THEN
    v_eligible := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.barrels b WHERE b.sender_uid = v_uid
  ) THEN
    v_eligible := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.duel_settlements ds WHERE ds.winner_uid = v_uid
  ) OR COALESCE(u.duels_played, 0) > 0 THEN
    v_eligible := true;
  ELSIF v_trig IN ('first_friend_pack_sent', 'first_duel_1x1', 'ping_pong_revenge') AND COALESCE(u.packed_count, 0) > 0 THEN
    v_eligible := true;
  END IF;

  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'friend_or_duel_required',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  v_boost_until := GREATEST(COALESCE(u.points_boost_x2_until, now()), now()) + interval '15 minutes';
  v_new_pts := COALESCE(u.premiere_points, 0) + 300;

  UPDATE public.users
  SET
    first_social_exclusive_claimed = true,
    points_boost_x2_until = v_boost_until,
    premiere_points = v_new_pts,
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'trigger', v_trig,
    'rare_chip_unlocked', true,
    'shards_34_unlocked', true,
    'points_boost_x2_until', v_boost_until,
    'points_added', 300,
    'premiere_points', v_new_pts
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_first_social_exclusive_rpc(text, text) TO PUBLIC, anon, authenticated;

-- Явная фиксация: Отработка без Тиля не открывает редкие фишки и 3/4-4/4 части билета
CREATE OR REPLACE FUNCTION public.claim_workshop_recovery_life_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_user public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_shifts integer := 0;
  v_new_lives integer := 0;
  v_new_pts integer := 0;
  v_retry_sec integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE uid = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  v_shifts := CASE
    WHEN COALESCE(v_user.daily_recovery_date, DATE '2000-01-01') < msk_date THEN 0
    ELSE COALESCE(v_user.daily_recovery_shifts, 0)
  END;

  IF COALESCE(v_user.lives, 0) >= 3 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'lives_ceiling_reached',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  IF v_shifts >= 6 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'daily_recovery_limit',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  IF v_user.last_recovery_shift_at IS NOT NULL
     AND now() - v_user.last_recovery_shift_at < interval '20 seconds'
  THEN
    v_retry_sec := GREATEST(1, CEIL(20.0 - EXTRACT(EPOCH FROM (now() - v_user.last_recovery_shift_at)))::integer);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'recovery_cooldown',
      'retry_after_sec', v_retry_sec,
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  v_new_lives := LEAST(3, COALESCE(v_user.lives, 0) + 1);
  v_new_pts := COALESCE(v_user.premiere_points, 0) + 75;
  v_shifts := v_shifts + 1;

  UPDATE public.users
  SET
    lives = v_new_lives,
    premiere_points = v_new_pts,
    daily_recovery_shifts = v_shifts,
    daily_recovery_date = msk_date,
    last_recovery_shift_at = now(),
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'lives_added', 1,
    'points_added', 75,
    'lives', v_new_lives,
    'premiere_points', v_new_pts,
    'daily_recovery_shifts', v_shifts,
    'max_daily_shifts', 6,
    'rare_chip_eligible', false,
    'shards_34_eligible', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_workshop_recovery_life_rpc(text) TO PUBLIC, anon, authenticated;

-- Битва веток продюсеров (pr_*) и блогеров (bl_*)
CREATE OR REPLACE FUNCTION public.get_branch_battle_stats_rpc(p_branch_prefix text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pref text := lower(trim(coalesce(p_branch_prefix, '')));
  v_include_qa boolean := (v_pref LIKE '%qa_test%');
  v_my jsonb := NULL;
  v_top jsonb := '[]'::jsonb;
BEGIN
  IF v_pref <> '' AND v_pref !~ '^(pr|bl)_' THEN
    v_pref := '';
  END IF;

  WITH raw_branches AS (
    SELECT
      CASE
        WHEN COALESCE(seed_prefix, '') ~ '^(pr|bl)_' THEN lower(seed_prefix)
        WHEN COALESCE(traffic_source, '') ~ '^(pr|bl)_' THEN lower(traffic_source)
        ELSE NULL
      END AS branch_key,
      COALESCE(premiere_points, 0)::bigint AS pts
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
      AND (v_include_qa OR COALESCE(display_name, '') NOT ILIKE 'QA_TEST_%')
      AND (
        COALESCE(seed_prefix, '') ~ '^(pr|bl)_'
        OR COALESCE(traffic_source, '') ~ '^(pr|bl)_'
      )
  ),
  agg AS (
    SELECT
      branch_key AS prefix,
      CASE WHEN branch_key LIKE 'bl_%' THEN 'blog' ELSE 'prod' END AS role,
      COUNT(*)::integer AS members_count,
      SUM(pts)::bigint AS total_points,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, SUM(pts) DESC, branch_key ASC)::integer AS rank
    FROM raw_branches
    WHERE branch_key IS NOT NULL
    GROUP BY branch_key
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'prefix', a.prefix,
          'role', a.role,
          'members_count', a.members_count,
          'total_points', a.total_points,
          'rank', a.rank
        )
        ORDER BY a.rank ASC
      )
      FROM agg a
      WHERE a.rank <= 10
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object(
        'prefix', a.prefix,
        'role', a.role,
        'members_count', a.members_count,
        'total_points', a.total_points,
        'rank', a.rank
      )
      FROM agg a
      WHERE v_pref <> '' AND a.prefix = v_pref
      LIMIT 1
    )
  INTO v_top, v_my;

  RETURN jsonb_build_object(
    'ok', true,
    'my_branch', v_my,
    'top_branches', v_top
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_branch_battle_stats_rpc(text) TO PUBLIC, anon, authenticated;

-- Фиксация добавления ярлыка на главный экран телефона (addToHomeScreen)
CREATE OR REPLACE FUNCTION public.record_homescreen_shortcut_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  INSERT INTO public.users (uid, homescreen_shortcut_added)
  VALUES (v_uid, true)
  ON CONFLICT (uid) DO UPDATE
    SET homescreen_shortcut_added = true, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'homescreen_shortcut_added', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_homescreen_shortcut_rpc(text) TO PUBLIC, anon, authenticated;
