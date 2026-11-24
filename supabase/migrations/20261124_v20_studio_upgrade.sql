-- BOCHKA v20.0-studio Migration
-- 1. Full trailer watch tracking (trailer_watched_full) + >=90% reward ('trailer_full') + 'til_trophy' solo cap 2/4
-- 2. Mass Share mechanics: 8s cooldown, 15 sends/day (+2 lives each), +50 pts capped at +750/day unconfirmed
-- 3. Unique new friend jackpot: +500 pts (outside daily send cap), +6 lives (no 12 cap), Friend Chip in user_trophies,
--    duel 1x1 & 3/4-4/4 unlock, duplicate friend open blocked from double rewards.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trailer_watched_full boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_share_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_share_points_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_share_at timestamptz;

ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS trailer_watched_full integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_trophies
  DROP CONSTRAINT IF EXISTS user_trophies_trophy_type_check;
ALTER TABLE public.user_trophies
  ADD CONSTRAINT user_trophies_trophy_type_check
  CHECK (trophy_type = ANY (ARRAY['friend_barrel'::text, 'movie_card'::text, 'friend_joined'::text]));

CREATE OR REPLACE FUNCTION public.bump_daily_metric(p_field text, p_delta integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.daily_metrics (day)
  VALUES (CURRENT_DATE)
  ON CONFLICT (day) DO NOTHING;

  IF p_field = 'players' THEN
    UPDATE public.daily_metrics SET players = players + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET total_players = total_players + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'barrels_created' THEN
    UPDATE public.daily_metrics SET barrels_created = barrels_created + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET barrels_created = barrels_created + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'barrels_opened' THEN
    UPDATE public.daily_metrics SET barrels_opened = barrels_opened + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET barrels_opened = barrels_opened + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'kp_clicks' THEN
    UPDATE public.daily_metrics SET kp_clicks = kp_clicks + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET kp_clicks = kp_clicks + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'trailer_completions' THEN
    UPDATE public.daily_metrics SET trailer_completions = trailer_completions + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET trailer_completions = trailer_completions + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'trailer_watched_full' THEN
    UPDATE public.daily_metrics SET trailer_watched_full = COALESCE(trailer_watched_full, 0) + p_delta WHERE day = CURRENT_DATE;
  ELSIF p_field = 'cinema_clicks' THEN
    UPDATE public.daily_metrics SET cinema_clicks = cinema_clicks + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET cinema_intent_clicks = cinema_intent_clicks + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'ocean_opens' THEN
    UPDATE public.daily_metrics SET ocean_opens = ocean_opens + p_delta WHERE day = CURRENT_DATE;
    UPDATE public.global_stats SET ocean_secret_opens = ocean_secret_opens + p_delta, updated_at = now() WHERE id = 1;
  ELSIF p_field = 'tickets_ordered' THEN
    UPDATE public.daily_metrics SET tickets_ordered = tickets_ordered + p_delta WHERE day = CURRENT_DATE;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_funnel_event_rpc(p_event text, p_uid text DEFAULT NULL::text, p_kp_screenshot_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kp_url text := trim(COALESCE(p_kp_screenshot_url, ''));
  v_clean_uid text := trim(COALESCE(p_uid, ''));
BEGIN
  IF p_event IN ('kp_clicks', 'trailer_completions', 'trailer_watched_full', 'cinema_clicks', 'ocean_opens') THEN
    PERFORM public.bump_daily_metric(p_event, 1);
  END IF;

  IF p_event = 'trailer_watched_full' AND v_clean_uid <> '' AND NOT public.is_sandbox_uid(v_clean_uid) THEN
    INSERT INTO public.users (uid) VALUES (v_clean_uid) ON CONFLICT (uid) DO NOTHING;
    UPDATE public.users
    SET trailer_watched_full = true,
        trailer_rewarded = true,
        updated_at = now()
    WHERE uid = v_clean_uid;
  END IF;

  IF p_event = 'kp_screenshot_verified' AND v_clean_uid <> '' AND NOT public.is_sandbox_uid(v_clean_uid) THEN
    IF v_kp_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cinema-passes/kp/' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kp_screenshot_url');
    END IF;

    UPDATE public.users
    SET
      premiere_points = premiere_points + CASE WHEN NOT kp_verified THEN 500 ELSE 0 END,
      lives = lives + CASE WHEN NOT kp_verified THEN 1 ELSE 0 END,
      lives_updated_at = CASE WHEN NOT kp_verified AND lives + 1 >= 3 THEN now() ELSE lives_updated_at END,
      kp_verified = true,
      kp_screenshot_url = v_kp_url,
      updated_at = now()
    WHERE uid = v_clean_uid;
    PERFORM public.bump_daily_metric('kp_clicks', 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(p_uid text, p_tg_id text DEFAULT NULL::text, p_tg_username text DEFAULT NULL::text, p_display_name text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u public.users%ROWTYPE;
  inserted_count int := 0;
  v_has_social boolean := false;
  v_has_broadcast boolean := false;
  v_effective_stage smallint := 1;
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
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  v_has_social := EXISTS (
    SELECT 1
    FROM public.social_connections sc
    WHERE sc.sender_uid = u.uid
       OR sc.receiver_uid = u.uid
       OR (
         u.tg_user_id IS NOT NULL
         AND (sc.sender_tg_id = u.tg_user_id OR sc.receiver_tg_id = u.tg_user_id)
       )
  );

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
    'daily_shares_count', u.daily_shares_count,
    'daily_share_points', COALESCE(u.daily_share_points, 0),
    'avatar_url', COALESCE(u.avatar_url, ''),
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', u.temu_surge_claimed,
    'has_social_connection', v_has_social,
    'is_seed_admin', COALESCE(u.is_seed_admin, false),
    'is_blogger_seed', COALESCE(u.is_blogger_seed, false),
    'seed_prefix', COALESCE(u.seed_prefix, ''),
    'has_broadcast_barrel', v_has_broadcast,
    'tg_write_access', COALESCE(u.tg_write_access, false) OR (u.tg_chat_id IS NOT NULL)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_ticket_shard_rpc(p_uid text, p_source text DEFAULT 'level'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'level')));
  cfg public.global_stats%ROWTYPE;
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_burn_deadline timestamptz := timestamptz '2026-12-16 00:00:00+05';
  v_prev_shards integer := 0;
  v_next_shards integer := 0;
  v_claimed text[] := '{}';
  v_solo_cnt integer := 0;
  v_has_confirmed_friend boolean := false;
  v_has_live_pvp_duel boolean := false;
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

  IF COALESCE(u.is_seed_admin, false) OR COALESCE(u.is_blogger_seed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'merged_ticket', false,
      'shards', COALESCE(u.ticket_shards, 0),
      'reason', 'seed_admin_excluded',
      'fallback_points', 0,
      'pending_tickets_count', 0,
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  v_claimed := COALESCE(u.shard_sources_claimed, '{}');
  v_prev_shards := LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0)));
  v_solo_cnt := COALESCE((SELECT COUNT(*) FROM unnest(v_claimed) AS x WHERE x IN ('solo_til', 'trailer_full', 'til_trophy')), 0);

  -- Повторная заявка одного не-дуэльного источника блокируется (кроме multi-step solo / duel / friend_opened)
  IF v_src NOT IN ('duel', 'solo_til', 'til_trophy', 'friend_opened') AND v_src = ANY(v_claimed) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'shard_source_already_claimed',
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- Соло-источники ('solo_til', 'trailer_full', 'til_trophy'): общий потолок строго 2/4!
  IF v_src IN ('solo_til', 'trailer_full', 'til_trophy') AND (v_prev_shards >= 2 OR v_solo_cnt >= 2) THEN
    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts,
      trailer_watched_full = CASE WHEN v_src = 'trailer_full' THEN true ELSE COALESCE(trailer_watched_full, false) END,
      trailer_rewarded = CASE WHEN v_src = 'trailer_full' THEN true ELSE trailer_rewarded END,
      lives = CASE WHEN v_src = 'trailer_full' THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
      lives_updated_at = CASE WHEN v_src = 'trailer_full' THEN now() ELSE lives_updated_at END,
      shard_sources_claimed = CASE WHEN v_src = 'trailer_full' AND NOT ('trailer_full' = ANY(v_claimed)) THEN array_append(v_claimed, 'trailer_full') ELSE v_claimed END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_full' THEN
      PERFORM public.bump_daily_metric('trailer_watched_full', 1);
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'solo_cap_reached',
      'fallback_points', v_fallback_pts,
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- Защита от спама для боёв против Тиля и дуэлей (15с кулдаун)
  IF v_src IN ('duel', 'solo_til') AND u.last_shard_at IS NOT NULL AND (now() - u.last_shard_at) < interval '15 seconds' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'shard_rate_limited',
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  v_next_shards := v_prev_shards + 1;

  -- Части 3/4 и 4/4 строго требуют подтверждённого друга или живой дуэли 1x1!
  IF v_next_shards >= 3 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = v_uid
        AND sc.receiver_uid <> v_uid
        AND NOT public.is_sandbox_uid(sc.receiver_uid)
        AND (COALESCE(sc.opened_barrel, false) = true OR COALESCE(sc.duels_together, 0) > 0)
    ) INTO v_has_confirmed_friend;

    IF NOT v_has_confirmed_friend THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.barrels b
        WHERE b.sender_uid = v_uid
          AND COALESCE(b.is_broadcast, false) = false
          AND b.opened_by_uid IS NOT NULL
          AND b.opened_by_uid <> ''
          AND b.opened_by_uid <> v_uid
          AND NOT public.is_sandbox_uid(b.opened_by_uid)
      ) INTO v_has_confirmed_friend;
    END IF;

    v_has_live_pvp_duel := false;
    IF v_src = 'duel' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.duel_settlements ds
        JOIN public.duel_antes da
          ON da.room_id = ds.room_id AND da.round_key = ds.round_key
        WHERE ds.winner_uid = v_uid
          AND ds.settled_at >= now() - interval '15 minutes'
          AND da.uid <> v_uid
          AND NOT public.is_sandbox_uid(da.uid)
      ) INTO v_has_live_pvp_duel;
    END IF;

    IF NOT v_has_confirmed_friend AND NOT v_has_live_pvp_duel THEN
      UPDATE public.users
      SET
        premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts,
        last_shard_at = now(),
        updated_at = now()
      WHERE uid = v_uid
      RETURNING * INTO u;

      RETURN jsonb_build_object(
        'ok', true,
        'source', v_src,
        'shards', v_prev_shards,
        'prev_shards', v_prev_shards,
        'merged_ticket', false,
        'granted', false,
        'duplicate_blocked', false,
        'reason', 'friend_or_duel_required',
        'fallback_points', v_fallback_pts,
        'premiere_points', COALESCE(u.premiere_points, 0),
        'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives,
        'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
      );
    END IF;
  END IF;

  -- Накопление 1/4, 2/4, 3/4
  IF v_next_shards < 4 THEN
    UPDATE public.users
    SET
      ticket_shards = v_next_shards,
      shard_sources_claimed = CASE WHEN v_src IN ('duel', 'friend_opened') THEN v_claimed ELSE array_append(v_claimed, v_src) END,
      trailer_watched_full = CASE WHEN v_src = 'trailer_full' THEN true ELSE COALESCE(trailer_watched_full, false) END,
      trailer_rewarded = CASE WHEN v_src = 'trailer_full' THEN true ELSE trailer_rewarded END,
      lives = CASE WHEN v_src = 'trailer_full' THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
      lives_updated_at = CASE WHEN v_src = 'trailer_full' THEN now() ELSE lives_updated_at END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_full' THEN
      PERFORM public.bump_daily_metric('trailer_watched_full', 1);
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', u.ticket_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', false,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- 4-я часть (4/4): атомарно проверяем global_stats (100 всего / 6 в сутки МСК)
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
      shard_sources_claimed = '{}',
      last_shard_at = now(),
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
      'duplicate_blocked', false,
      'reason', v_deny_reason,
      'fallback_points', v_fallback_pts,
      'premiere_points', u.premiere_points,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'daily_tickets_issued', cfg.daily_tickets_issued,
      'max_daily_tickets', cfg.max_daily_tickets,
      'tickets_won', cfg.tickets_won,
      'max_total_tickets', cfg.max_total_tickets,
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
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
    ticket_shards = 0,
    shard_sources_claimed = '{}',
    last_shard_at = now(),
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
    'duplicate_blocked', false,
    'pending_tickets_count', u.pending_tickets_count,
    'premiere_points', u.premiere_points,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', cfg.max_daily_tickets,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets,
    'lives', u.lives,
    'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_share_life(p_uid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_shares_today integer := 0;
  v_pts_today integer := 0;
  v_pts_add integer := 0;
  v_retry_sec integer := 0;
BEGIN
  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_not_found');
  END IF;

  IF u.daily_shares_date IS NULL OR u.daily_shares_date < msk_date THEN
    v_shares_today := 0;
  ELSE
    v_shares_today := GREATEST(0, COALESCE(u.daily_shares_count, 0));
  END IF;

  IF u.daily_share_points_date IS NULL OR u.daily_share_points_date < msk_date THEN
    v_pts_today := 0;
  ELSE
    v_pts_today := GREATEST(0, COALESCE(u.daily_share_points, 0));
  END IF;

  IF u.last_share_at IS NOT NULL AND (now() - u.last_share_at) < interval '8 seconds' THEN
    v_retry_sec := GREATEST(1, CEIL(8 - EXTRACT(EPOCH FROM (now() - u.last_share_at)))::integer);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'share_cooldown',
      'retry_after_sec', v_retry_sec,
      'lives', u.lives,
      'premiere_points', u.premiere_points,
      'daily_shares_count', v_shares_today,
      'daily_shares_limit', 15,
      'daily_share_points', v_pts_today,
      'daily_share_points_cap', 750
    );
  END IF;

  IF v_shares_today >= 15 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit',
      'lives', u.lives,
      'premiere_points', u.premiere_points,
      'daily_shares_count', v_shares_today,
      'daily_shares_limit', 15,
      'daily_share_points', v_pts_today,
      'daily_share_points_cap', 750
    );
  END IF;

  v_pts_add := LEAST(50, GREATEST(0, 750 - v_pts_today));

  UPDATE public.users
  SET
    lives = COALESCE(lives, 0) + 2,
    lives_updated_at = now(),
    premiere_points = COALESCE(premiere_points, 0) + v_pts_add,
    daily_shares_count = v_shares_today + 1,
    daily_shares_date = msk_date,
    daily_share_points = v_pts_today + v_pts_add,
    daily_share_points_date = msk_date,
    last_share_at = now(),
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'lives_added', 2,
    'points_added', v_pts_add,
    'premiere_points', u.premiere_points,
    'daily_shares_count', u.daily_shares_count,
    'daily_shares_limit', 15,
    'daily_share_points', u.daily_share_points,
    'daily_share_points_cap', 750,
    'points_capped', (v_pts_add = 0)
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.claim_personal_barrel_open_rpc(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.claim_personal_barrel_open_rpc(
  p_barrel_id text,
  p_viewer_uid text,
  p_viewer_tg_id text DEFAULT ''::text,
  p_viewer_username text DEFAULT ''::text,
  p_viewer_name text DEFAULT ''::text,
  p_viewer_avatar text DEFAULT ''::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bid text := trim(coalesce(p_barrel_id, ''));
  v_uid text := trim(coalesce(p_viewer_uid, ''));
  v_tg text := trim(coalesce(p_viewer_tg_id, ''));
  v_avatar text := left(trim(coalesce(p_viewer_avatar, '')), 300);
  v_name text := left(COALESCE(NULLIF(trim(coalesce(p_viewer_name, '')), ''), 'Друг'), 48);
  b public.barrels%ROWTYPE;
  s_user public.users%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_root_code text := NULL;
  v_seed_prefix text := NULL;
  v_is_self boolean := false;
  v_already_connected boolean := false;
  v_shard_res jsonb := '{}'::jsonb;
  v_chip_img text := './public/sprites/fighter_1.webp';
  v_chip_bid text := '';
BEGIN
  IF v_bid = '' OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'params_required');
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', true,
      'locked', false,
      'is_self', (b.sender_uid = v_uid OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND b.sender_tg_id = v_tg)),
      'sender_rewarded', false
    );
  END IF;

  v_is_self := (
    (b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND b.sender_uid = v_uid)
    OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND v_tg <> '' AND b.sender_tg_id = v_tg)
  );

  IF v_is_self THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', true,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'duplicate_friend_blocked', false,
      'reason', 'self_open_no_reward'
    );
  END IF;

  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' THEN
    SELECT * INTO s_user FROM public.users WHERE uid = b.sender_uid;
    IF FOUND THEN
      v_root_code := COALESCE(NULLIF(s_user.root_tracking_code, ''), NULLIF(s_user.seed_tracking_code, ''));
      v_seed_prefix := COALESCE(NULLIF(s_user.seed_prefix, ''), NULLIF(b.broadcast_prefix, ''));
    END IF;
  END IF;

  PERFORM public.get_or_create_player_profile(
    v_uid,
    NULLIF(v_tg, ''),
    NULLIF(trim(coalesce(p_viewer_username, '')), ''),
    COALESCE(NULLIF(trim(coalesce(p_viewer_name, '')), ''), 'Игрок')
  );

  UPDATE public.users
  SET
    seed_prefix = COALESCE(NULLIF(seed_prefix, ''), v_seed_prefix),
    root_tracking_code = COALESCE(NULLIF(root_tracking_code, ''), v_root_code),
    referred_by_uid = COALESCE(referred_by_uid, b.sender_uid),
    avatar_url = CASE WHEN v_avatar ~ '^https://[^ ]+$' THEN v_avatar ELSE avatar_url END,
    traffic_source = CASE
      WHEN COALESCE(traffic_source, '') IN ('', 'organic') AND v_seed_prefix IS NOT NULL THEN v_seed_prefix
      ELSE traffic_source
    END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO v_user;

  IF b.opened_by_uid IS NOT NULL AND b.opened_by_uid <> '' AND b.opened_by_uid <> v_uid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', true,
      'first_open', false,
      'sender_rewarded', false,
      'opened_by_uid', b.opened_by_uid,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  IF b.opened_by_uid = v_uid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'duplicate_friend_blocked', true,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  -- Запираем личную бочку на открывшего друга и фиксируем в barrel_opens_ledger
  UPDATE public.barrels
  SET
    opened_by_uid = v_uid,
    opened_at = now(),
    opens_count = COALESCE(opens_count, 0) + 1
  WHERE short_id = v_bid;

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (v_bid, v_uid)
  ON CONFLICT DO NOTHING;

  -- Проверяем, подключался ли уже ЭТОТ друг ранее в social_connections (в любом направлении для отправителя)
  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND NOT public.is_sandbox_uid(v_uid) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = b.sender_uid
        AND COALESCE(sc.opened_barrel, false) = true
        AND (
          sc.receiver_uid = v_uid
          OR (v_tg <> '' AND sc.receiver_tg_id = v_tg)
        )
    ) INTO v_already_connected;

    UPDATE public.social_connections
    SET
      opened_barrel = true,
      receiver_name = CASE WHEN v_name <> '' THEN v_name ELSE receiver_name END,
      receiver_username = COALESCE(NULLIF(trim(coalesce(p_viewer_username, '')), ''), receiver_username),
      receiver_tg_id = COALESCE(NULLIF(v_tg, ''), receiver_tg_id),
      updated_at = now()
    WHERE sender_uid = b.sender_uid AND receiver_uid = v_uid;

    IF NOT FOUND THEN
      INSERT INTO public.social_connections (
        sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel
      )
      VALUES (
        b.sender_uid, v_uid, NULLIF(b.sender_tg_id, ''), NULLIF(v_tg, ''), v_name, NULLIF(trim(coalesce(p_viewer_username, '')), ''), true
      );
    END IF;

    IF v_already_connected THEN
      RETURN jsonb_build_object(
        'ok', true,
        'is_broadcast', false,
        'is_self', false,
        'locked', false,
        'first_open', true,
        'sender_rewarded', false,
        'duplicate_friend_blocked', true,
        'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
        'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
      );
    END IF;

    -- УНИКАЛЬНЫЙ НОВЫЙ ДРУГ -> ДЖЕКПОТ: +500 очков (вне дневного лимита 750!), +6 жизней, Фишка друга, доступ к 1x1 и 3/4-4/4!
    UPDATE public.users
    SET
      friends_brought = COALESCE(friends_brought, 0) + 1,
      premiere_points = COALESCE(premiere_points, 0) + 500,
      premiere_score = LEAST(99.5, COALESCE(premiere_score, 0) + 20.0),
      lives = COALESCE(lives, 0) + 6,
      ui_stage = GREATEST(COALESCE(ui_stage, 1), 4),
      lives_updated_at = now(),
      updated_at = now()
    WHERE uid = b.sender_uid;

    v_chip_img := COALESCE(NULLIF(v_avatar, ''), NULLIF(trim(COALESCE(v_user.avatar_url, '')), ''), './public/sprites/fighter_1.webp');
    v_chip_bid := 'fj_' || left(b.sender_uid, 40) || '_' || left(v_uid, 40);

    INSERT INTO public.user_trophies (
      owner_uid, trophy_type, barrel_id, image_url, label, rarity, won_from_name
    )
    VALUES (
      b.sender_uid, 'friend_joined', v_chip_bid, v_chip_img, v_name, 'common', v_name
    )
    ON CONFLICT (owner_uid, barrel_id) WHERE barrel_id IS NOT NULL DO NOTHING;

    v_shard_res := public.award_ticket_shard_rpc(b.sender_uid, 'friend_opened');

    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', false,
      'first_open', true,
      'sender_rewarded', true,
      'duplicate_friend_blocked', false,
      'jackpot_points', 500,
      'jackpot_lives', 6,
      'friend_chip_minted', true,
      'sender_shard_res', v_shard_res,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_broadcast', false,
    'is_self', false,
    'locked', false,
    'first_open', true,
    'sender_rewarded', false,
    'duplicate_friend_blocked', false,
    'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
    'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_barrel_search_started(
  p_barrel_id text,
  p_opener_uid text,
  p_opener_tg_id text DEFAULT NULL::text,
  p_opener_username text DEFAULT NULL::text,
  p_opener_name text DEFAULT ''::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.barrels%ROWTYPE;
  sender_row public.users%ROWTYPE;
BEGIN
  IF p_barrel_id IS NULL OR public.is_sandbox_uid(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = trim(p_barrel_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  PERFORM public.get_or_create_player_profile(p_opener_uid, p_opener_tg_id, p_opener_username, p_opener_name);
  UPDATE public.users
  SET has_played_solo = true, updated_at = now()
  WHERE uid = trim(p_opener_uid);

  IF b.sender_uid IS NULL
     OR public.is_sandbox_uid(b.sender_uid)
     OR b.sender_uid = trim(p_opener_uid)
     OR (
       b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> ''
       AND NULLIF(trim(COALESCE(p_opener_tg_id, '')), '') = b.sender_tg_id
     )
  THEN
    RETURN jsonb_build_object('ok', true, 'is_self', true, 'credited_lives', 0);
  END IF;

  PERFORM public.get_or_create_player_profile(b.sender_uid, b.sender_tg_id, b.sender_username, b.sender_name);

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    b.sender_uid,
    trim(p_opener_uid),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(p_opener_name, ''))) > 0 THEN left(trim(p_opener_name), 40) ELSE 'Друг из Цеха' END,
    NULLIF(trim(COALESCE(p_opener_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    receiver_tg_id = COALESCE(EXCLUDED.receiver_tg_id, public.social_connections.receiver_tg_id),
    receiver_name = CASE WHEN EXCLUDED.receiver_name <> 'Друг из Цеха' THEN EXCLUDED.receiver_name ELSE public.social_connections.receiver_name END,
    receiver_username = COALESCE(EXCLUDED.receiver_username, public.social_connections.receiver_username),
    updated_at = now();

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    trim(p_opener_uid),
    b.sender_uid,
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(b.sender_name, ''))) > 0 THEN left(trim(b.sender_name), 40) ELSE 'Автор бочки' END,
    NULLIF(trim(COALESCE(b.sender_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    updated_at = now();

  SELECT * INTO sender_row FROM public.users WHERE uid = b.sender_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'credited_lives', 0,
    'sender_uid', b.sender_uid,
    'sender_tg_id', COALESCE(sender_row.tg_user_id, b.sender_tg_id, ''),
    'sender_lives', COALESCE(sender_row.lives, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_friend_opened_lives(p_barrel_id text, p_sender_uid text, p_opener_uid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_rows integer := 0;
  sender_lives integer := 0;
  sender_tg text := '';
BEGIN
  IF p_barrel_id IS NULL OR public.is_sandbox_uid(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', false, 'credited', false);
  END IF;

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (trim(p_barrel_id), trim(p_opener_uid))
  ON CONFLICT (barrel_id, opener_uid) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows > 0 THEN
    UPDATE public.barrels SET opens_count = opens_count + 1 WHERE short_id = trim(p_barrel_id);
    PERFORM public.bump_daily_metric('barrels_opened', 1);

    UPDATE public.users
    SET
      has_played_solo = true,
      premiere_points = premiere_points + 150,
      updated_at = now()
    WHERE uid = trim(p_opener_uid);
  ELSE
    UPDATE public.users
    SET has_played_solo = true, updated_at = now()
    WHERE uid = trim(p_opener_uid);
  END IF;

  IF p_sender_uid IS NOT NULL AND NOT public.is_sandbox_uid(p_sender_uid) THEN
    SELECT COALESCE(tg_user_id, ''), lives INTO sender_tg, sender_lives FROM public.users WHERE uid = trim(p_sender_uid);
  END IF;

  RETURN jsonb_build_object('ok', true, 'credited', false, 'sender_lives', COALESCE(sender_lives, 0), 'sender_tg_id', COALESCE(sender_tg, ''));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_personal_barrel_open_rpc(text, text, text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_barrel_search_started(text, text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_friend_opened_lives(text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_share_life(text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_event_rpc(text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_daily_metric(text, integer) TO PUBLIC, anon, authenticated;
