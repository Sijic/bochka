-- v20.26-rf:
-- 1) Revoke PUBLIC / anon / authenticated EXECUTE on check_and_mark_service_push_rpc (backend-only tg-webhook RPC)
-- 2) Rebalance trailer rewards in award_ticket_shard_rpc:
--    * trailer_30s (40s mid): modest advance +2 lives (instead of >= 6)
--    * trailer_full (90% finale): main pack +4 lives (+ +250 pts -> +350 total with 60s checkpoint, unlocks 19-97)
-- 3) Update claim_trailer_60s_checkpoint_rpc hint for +4 lives in finale

REVOKE ALL ON FUNCTION public.check_and_mark_service_push_rpc(text, text, boolean) FROM PUBLIC, anon, authenticated;

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
  v_burn_deadline timestamptz := timestamptz '2026-12-17 00:00:00+03';
  v_daily_quota integer := public.get_dynamic_daily_ticket_quota(msk_date);
  v_prev_shards integer := 0;
  v_next_shards integer := 0;
  v_claimed text[] := '{}';
  v_solo_cnt integer := 0;
  v_has_confirmed_friend boolean := false;
  v_has_live_pvp_duel boolean := false;
  v_deny_reason text := '';
  v_fallback_pts integer := 500;
  v_trailer_30s_done boolean := false;
  v_trailer_60s_done boolean := false;
  v_base_pts integer := 250;
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
  v_trailer_30s_done := ('trailer_30s' = ANY(v_claimed));
  v_trailer_60s_done := COALESCE(u.trailer_60s_rewarded, false) OR ('trailer_60s' = ANY(v_claimed));

  v_solo_cnt := COALESCE((
    SELECT COUNT(*)::int
    FROM unnest(v_claimed) AS x
    WHERE x IN ('solo_til', 'trailer_30s', 'trailer_full', 'til_trophy')
  ), 0);

  IF v_src = 'trailer_30s' AND (v_trailer_30s_done OR ('trailer_full' = ANY(v_claimed))) THEN
    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'already_claimed_source',
      'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  IF v_src = 'trailer_full' THEN
    IF ('trailer_full' = ANY(v_claimed)) OR COALESCE(u.trailer_watched_full, false) THEN
      RETURN jsonb_build_object(
        'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
        'merged_ticket', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'already_claimed_source',
        'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives, 'trailer_watched_full', true, 'code_part', '-97', 'full_code', '19-97'
      );
    END IF;

    IF NOT v_trailer_30s_done THEN
      RETURN jsonb_build_object(
        'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
        'merged_ticket', false, 'granted', false, 'duplicate_blocked', false, 'reason', 'trailer_30s_required',
        'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives, 'trailer_watched_full', false
      );
    END IF;

    IF NOT v_trailer_60s_done THEN
      RETURN jsonb_build_object(
        'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
        'merged_ticket', false, 'granted', false, 'duplicate_blocked', false, 'reason', 'trailer_60s_required',
        'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives, 'trailer_watched_full', false
      );
    END IF;

    IF u.trailer_60s_claimed_at IS NOT NULL AND (now() - u.trailer_60s_claimed_at) < interval '18 seconds' THEN
      RETURN jsonb_build_object(
        'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
        'merged_ticket', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'seek_speed_blocked_90pct',
        'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives, 'trailer_watched_full', false
      );
    END IF;

    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + v_base_pts,
      trailer_watched_full = true,
      trailer_rewarded = true,
      lives = LEAST(30, COALESCE(lives, 0) + 4),
      lives_updated_at = now(),
      shard_sources_claimed = array_append(v_claimed, 'trailer_full'),
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    PERFORM public.bump_daily_metric('trailer_watched_full', 1);

    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0))),
      'prev_shards', v_prev_shards, 'merged_ticket', false, 'granted', false,
      'double_points_bonus', true, 'bonus_points', v_base_pts, 'lives_added', 4,
      'total_trailer_points', v_base_pts * 2 + 100,
      'code_part', '-97', 'full_code', '19-97',
      'hint', 'Вторая половина кода: «...-97»! Главная пачка +4 ❤️ и код 19-97 (+3 ❤️ в цеху) открыты!',
      'reason', 'full_watch_2x_bonus', 'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives, 'trailer_watched_full', true
    );
  END IF;

  IF v_src NOT IN ('duel', 'friend_opened') AND v_src = ANY(v_claimed) THEN
    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'already_claimed_source',
      'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  IF v_src IN ('solo_til', 'trailer_30s', 'til_trophy') AND (v_prev_shards >= 2 OR v_solo_cnt >= 2) THEN
    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE v_fallback_pts END,
      trailer_rewarded = CASE WHEN v_src = 'trailer_30s' THEN true ELSE trailer_rewarded END,
      trailer_30s_claimed_at = CASE WHEN v_src = 'trailer_30s' THEN COALESCE(trailer_30s_claimed_at, now()) ELSE trailer_30s_claimed_at END,
      lives = CASE WHEN v_src = 'trailer_30s' THEN LEAST(30, COALESCE(lives, 0) + 2) ELSE lives END,
      lives_updated_at = CASE WHEN v_src = 'trailer_30s' THEN now() ELSE lives_updated_at END,
      shard_sources_claimed = CASE WHEN v_src = 'trailer_30s' AND NOT ('trailer_30s' = ANY(v_claimed)) THEN array_append(v_claimed, 'trailer_30s') ELSE v_claimed END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_30s' THEN
      PERFORM public.bump_daily_metric('trailer_completions', 1);
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', false, 'duplicate_blocked', false, 'reason', 'solo_cap_reached',
      'fallback_points', CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE v_fallback_pts END,
      'lives_added', CASE WHEN v_src = 'trailer_30s' THEN 2 ELSE 0 END,
      'premiere_points', COALESCE(u.premiere_points, 0), 'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  IF v_src IN ('duel', 'solo_til') AND u.last_shard_at IS NOT NULL AND (now() - u.last_shard_at) < interval '15 seconds' THEN
    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'shard_rate_limited',
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0), 'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  v_next_shards := v_prev_shards + 1;

  IF v_next_shards >= 3 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.social_connections sc
      WHERE sc.sender_uid = v_uid AND sc.receiver_uid <> v_uid AND NOT public.is_sandbox_uid(sc.receiver_uid)
        AND (COALESCE(sc.opened_barrel, false) = true OR COALESCE(sc.duels_together, 0) > 0)
    ) INTO v_has_confirmed_friend;

    IF NOT v_has_confirmed_friend THEN
      SELECT EXISTS (
        SELECT 1 FROM public.barrels b
        WHERE b.sender_uid = v_uid AND COALESCE(b.is_broadcast, false) = false
          AND b.opened_by_uid IS NOT NULL AND b.opened_by_uid <> '' AND b.opened_by_uid <> v_uid
          AND NOT public.is_sandbox_uid(b.opened_by_uid)
      ) INTO v_has_confirmed_friend;
    END IF;

    IF NOT v_has_confirmed_friend THEN
      SELECT EXISTS (
        SELECT 1 FROM public.ping_pong_relay_claims rc
        WHERE rc.sender_uid = v_uid
          AND rc.new_recipient_uid <> v_uid
          AND NOT public.is_sandbox_uid(rc.new_recipient_uid)
      ) INTO v_has_confirmed_friend;
    END IF;

    v_has_live_pvp_duel := false;
    IF v_src = 'duel' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.duel_settlements ds
        JOIN public.duel_antes da ON da.room_id = ds.room_id AND da.round_key = ds.round_key
        WHERE ds.winner_uid = v_uid AND ds.settled_at >= now() - interval '15 minutes'
          AND da.uid <> v_uid AND NOT public.is_sandbox_uid(da.uid)
      ) INTO v_has_live_pvp_duel;
    END IF;

    IF NOT v_has_confirmed_friend AND NOT v_has_live_pvp_duel THEN
      UPDATE public.users
      SET premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts, last_shard_at = now(), updated_at = now()
      WHERE uid = v_uid
      RETURNING * INTO u;

      RETURN jsonb_build_object(
        'ok', true, 'source', v_src, 'shards', v_prev_shards, 'prev_shards', v_prev_shards,
        'merged_ticket', false, 'granted', false, 'duplicate_blocked', false,
        'reason', 'friend_or_duel_required', 'fallback_points', v_fallback_pts,
        'premiere_points', COALESCE(u.premiere_points, 0),
        'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
        'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
      );
    END IF;
  END IF;

  IF v_next_shards < 4 THEN
    UPDATE public.users
    SET
      ticket_shards = v_next_shards,
      shard_sources_claimed = CASE WHEN v_src IN ('duel', 'friend_opened') THEN v_claimed ELSE array_append(v_claimed, v_src) END,
      trailer_rewarded = CASE WHEN v_src = 'trailer_30s' THEN true ELSE trailer_rewarded END,
      trailer_30s_claimed_at = CASE WHEN v_src = 'trailer_30s' THEN COALESCE(trailer_30s_claimed_at, now()) ELSE trailer_30s_claimed_at END,
      lives = CASE WHEN v_src = 'trailer_30s' THEN LEAST(30, COALESCE(lives, 0) + 2) ELSE lives END,
      lives_updated_at = CASE WHEN v_src = 'trailer_30s' THEN now() ELSE lives_updated_at END,
      premiere_points = COALESCE(premiere_points, 0) + CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE 0 END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_30s' THEN
      PERFORM public.bump_daily_metric('trailer_completions', 1);
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', v_next_shards, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', true,
      'base_points', CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE 0 END,
      'lives_added', CASE WHEN v_src = 'trailer_30s' THEN 2 ELSE 0 END,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF cfg.daily_reset_date IS DISTINCT FROM msk_date THEN
    UPDATE public.global_stats
    SET daily_tickets_issued = 0, daily_reset_date = msk_date, max_daily_tickets = v_daily_quota, updated_at = now()
    WHERE id = 1
    RETURNING * INTO cfg;
  END IF;

  IF now() >= v_burn_deadline OR v_daily_quota <= 0 THEN
    v_deny_reason := 'burn_deadline_passed';
  ELSIF COALESCE(u.prize_excluded, false) THEN
    v_deny_reason := 'prize_excluded';
  ELSIF COALESCE(cfg.tickets_won, 0) >= COALESCE(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_limit_reached';
  ELSIF COALESCE(cfg.daily_tickets_issued, 0) >= v_daily_quota THEN
    v_deny_reason := 'daily_limit_reached';
  END IF;

  IF v_deny_reason <> '' THEN
    UPDATE public.users
    SET ticket_shards = 3, premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts, last_shard_at = now(), updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true, 'source', v_src, 'shards', 3, 'prev_shards', v_prev_shards,
      'merged_ticket', false, 'granted', false, 'reason', v_deny_reason,
      'fallback_points', v_fallback_pts, 'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false),
      'daily_tickets_issued', COALESCE(cfg.daily_tickets_issued, 0),
      'max_daily_tickets', v_daily_quota,
      'tickets_won', COALESCE(cfg.tickets_won, 0),
      'max_total_tickets', COALESCE(cfg.max_total_tickets, 100)
    );
  END IF;

  UPDATE public.global_stats
  SET
    tickets_won = tickets_won + 1,
    daily_tickets_issued = daily_tickets_issued + 1,
    max_daily_tickets = v_daily_quota,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO cfg;

  UPDATE public.users
  SET
    ticket_shards = 0,
    has_pending_ticket = true,
    pending_tickets_count = COALESCE(pending_tickets_count, 0) + 1,
    shard_sources_claimed = CASE WHEN v_src IN ('duel', 'friend_opened') THEN v_claimed ELSE array_append(v_claimed, v_src) END,
    last_shard_at = now(),
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  PERFORM public.bump_daily_metric('tickets_won', 1);

  RETURN jsonb_build_object(
    'ok', true, 'source', v_src, 'shards', 0, 'prev_shards', v_prev_shards,
    'merged_ticket', true, 'granted', true,
    'pending_tickets_count', u.pending_tickets_count,
    'premiere_points', COALESCE(u.premiere_points, 0),
    'lives', u.lives,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', v_daily_quota,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets,
    'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_trailer_60s_checkpoint_rpc(p_uid text, p_watched_sec numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  u public.users%ROWTYPE;
  v_claimed text[] := '{}';
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_or_sandbox_uid');
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;
  v_claimed := COALESCE(u.shard_sources_claimed, '{}');

  IF COALESCE(u.trailer_60s_rewarded, false) OR ('trailer_60s' = ANY(v_claimed)) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed_60s',
      'premiere_points', COALESCE(u.premiere_points, 0),
      'trailer_60s_rewarded', true,
      'code_part', '19-'
    );
  END IF;

  IF COALESCE(p_watched_sec, 0) < 58 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'watched_sec_too_low',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  IF NOT ('trailer_30s' = ANY(v_claimed)) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'trailer_30s_required',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  IF u.trailer_30s_claimed_at IS NOT NULL AND (now() - u.trailer_30s_claimed_at) < interval '25 seconds' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'seek_speed_blocked',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  UPDATE public.users
  SET
    premiere_points = COALESCE(premiere_points, 0) + 100,
    trailer_60s_rewarded = true,
    trailer_60s_claimed_at = now(),
    shard_sources_claimed = CASE WHEN 'trailer_60s' = ANY(v_claimed) THEN v_claimed ELSE array_append(v_claimed, 'trailer_60s') END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'duplicate_blocked', false,
    'bonus_points', 100,
    'premiere_points', COALESCE(u.premiere_points, 0),
    'trailer_60s_rewarded', true,
    'code_part', '19-',
    'hint', 'Первая половина секретного кода: «19-...». Вторая половина, +4 ❤️ и +250 ⭐ откроются в финале ролика (через 20 сек)!'
  );
END;
$function$;
