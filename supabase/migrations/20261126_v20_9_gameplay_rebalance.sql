-- БОЧКА v20.9: Gameplay & Retention Upgrade (Strictly RF)
-- 1) Ping-Pong Revenge bonus table & RPC (+1 life +200 stars, 1x per pair/barrel, anti-self & anti-duplicate)
-- 2) Two-Part Trailer Secret Code (60s -> "19-", 90% -> "-97" + +1 life + +250 stars) with anti-seek on both
-- 3) Rebalanced Recovery Shift (max 2 shifts/day MSK, 0 stars, +1 life up to ceiling 2, 15 min cooldown)
-- 4) Quiet Homescreen Shortcut (+100 stars once per player, decoupled from push opt-in decline popup)

CREATE TABLE IF NOT EXISTS public.ping_pong_revenge_claims (
  id bigserial PRIMARY KEY,
  revenge_uid text NOT NULL,
  target_uid text NOT NULL,
  original_barrel_id text NOT NULL,
  revenge_barrel_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revenge_uid, original_barrel_id)
);

ALTER TABLE public.ping_pong_revenge_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trailer_60s_claimed_at timestamptz DEFAULT NULL;

-- 1) 1-клик Пинг-Понг месть: +1 ❤️ жизнь и +200 ⭐ звёзд (1 раз на уникальную пару/бочку)
CREATE OR REPLACE FUNCTION public.claim_ping_pong_revenge_bonus_rpc(
  p_uid text,
  p_original_barrel_id text,
  p_revenge_barrel_id text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_orig text := trim(coalesce(p_original_barrel_id, ''));
  v_rev text := trim(coalesce(p_revenge_barrel_id, ''));
  b public.barrels%ROWTYPE;
  u public.users%ROWTYPE;
  v_already boolean := false;
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_or_sandbox_uid');
  END IF;
  IF v_orig = '' THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'original_barrel_required');
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = v_orig LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'barrel_not_found');
  END IF;

  IF COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'broadcast_not_eligible');
  END IF;

  IF COALESCE(b.sender_uid, '') = '' OR b.sender_uid = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'duplicate_blocked', true, 'reason', 'self_revenge_blocked');
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  SELECT EXISTS (
    SELECT 1
    FROM public.ping_pong_revenge_claims c
    WHERE c.revenge_uid = v_uid
      AND (c.original_barrel_id = v_orig OR c.target_uid = b.sender_uid)
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed_revenge',
      'lives', COALESCE(u.lives, 0),
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  INSERT INTO public.ping_pong_revenge_claims (revenge_uid, target_uid, original_barrel_id, revenge_barrel_id)
  VALUES (v_uid, b.sender_uid, v_orig, v_rev);

  UPDATE public.users
  SET
    lives = COALESCE(lives, 0) + 1,
    lives_updated_at = now(),
    premiere_points = COALESCE(premiere_points, 0) + 200,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  PERFORM public.bump_daily_metric('ping_pong_revenge', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'duplicate_blocked', false,
    'lives_added', 1,
    'points_added', 200,
    'lives', COALESCE(u.lives, 0),
    'premiere_points', COALESCE(u.premiere_points, 0),
    'target_uid', b.sender_uid
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_ping_pong_revenge_bonus_rpc(text, text, text) TO PUBLIC, anon, authenticated;

-- 2a) Трейлер 60с чекпоинт: +100 ⭐ + ПЕРВАЯ половина кода "19-" + таймстамп для анти-перемотки 90%
CREATE OR REPLACE FUNCTION public.claim_trailer_60s_checkpoint_rpc(
  p_uid text,
  p_watched_sec numeric DEFAULT 0
)
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
    'hint', 'Первая половина секретного кода: «19-...». Вторая половина и +1 ❤️ откроются в финале ролика (через 20 сек)!'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_trailer_60s_checkpoint_rpc(text, numeric) TO PUBLIC, anon, authenticated;

-- 2b) Финал 90% трейлера (trailer_full): +250 ⭐ +1 ❤️ и ВТОРАЯ половина кода "-97" + анти-перемотка от 60с
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
      lives = COALESCE(lives, 0) + 1,
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
      'double_points_bonus', true, 'bonus_points', v_base_pts, 'lives_added', 1,
      'total_trailer_points', v_base_pts * 2 + 100,
      'code_part', '-97', 'full_code', '19-97',
      'hint', 'Вторая половина кода: «...-97»! Полная комбинация в цеху: 19-97 (+3 ❤️)',
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
      lives = CASE WHEN v_src = 'trailer_30s' THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
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
      lives = CASE WHEN v_src = 'trailer_30s' THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
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

GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO PUBLIC, anon, authenticated;

-- 3) Перебалансировка Отработки без Тиля: макс 2 смены/сут, 0 ⭐ звёзд, +1 ❤️ до потолка 2 ❤️, кулдаун 15 мин
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

  IF COALESCE(v_user.lives, 0) >= 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'lives_ceiling_reached',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 2,
      'max_lives_ceiling', 2,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  IF v_shifts >= 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'daily_recovery_limit',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 2,
      'max_lives_ceiling', 2,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  IF v_user.last_recovery_shift_at IS NOT NULL
     AND now() - v_user.last_recovery_shift_at < interval '15 minutes'
  THEN
    v_retry_sec := GREATEST(1, CEIL(900.0 - EXTRACT(EPOCH FROM (now() - v_user.last_recovery_shift_at)))::integer);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'recovery_cooldown',
      'retry_after_sec', v_retry_sec,
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 2,
      'max_lives_ceiling', 2,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  v_new_lives := LEAST(2, COALESCE(v_user.lives, 0) + 1);
  v_shifts := v_shifts + 1;

  UPDATE public.users
  SET
    lives = v_new_lives,
    daily_recovery_shifts = v_shifts,
    daily_recovery_date = msk_date,
    last_recovery_shift_at = now(),
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'lives_added', 1,
    'points_added', 0,
    'lives', v_new_lives,
    'premiere_points', COALESCE(v_user.premiere_points, 0),
    'daily_recovery_shifts', v_shifts,
    'max_daily_shifts', 2,
    'max_lives_ceiling', 2,
    'rare_chip_eligible', false,
    'shards_34_eligible', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_workshop_recovery_life_rpc(text) TO PUBLIC, anon, authenticated;

-- 4) Ярлык в меню (+100 ⭐ 1 раз на игрока, независимо от статуса пушей)
CREATE OR REPLACE FUNCTION public.record_homescreen_shortcut_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  u public.users%ROWTYPE;
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_or_sandbox_uid');
  END IF;

  INSERT INTO public.users (uid, homescreen_shortcut_added)
  VALUES (v_uid, true)
  ON CONFLICT (uid) DO UPDATE
    SET homescreen_shortcut_added = true, updated_at = now();

  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  IF COALESCE(u.homescreen_bonus_claimed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'homescreen_shortcut_added', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  UPDATE public.users
  SET
    homescreen_shortcut_added = true,
    homescreen_bonus_claimed = true,
    premiere_points = COALESCE(premiere_points, 0) + 100,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'homescreen_shortcut_added', true,
    'granted', true,
    'duplicate_blocked', false,
    'points_added', 100,
    'premiere_points', COALESCE(u.premiere_points, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_homescreen_shortcut_rpc(text) TO PUBLIC, anon, authenticated;
