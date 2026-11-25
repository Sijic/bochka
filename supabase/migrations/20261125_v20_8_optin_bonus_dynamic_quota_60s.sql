-- БОЧКА v20.8: Motivated Opt-in Bonuses (+1 life +150 stars / +100 stars shortcut),
-- Dynamic Daily Ticket Quota (4/5/6 MSK through Dec 16, 100 total cap),
-- and 60s Trailer Mid-Checkpoint (+100 stars + Secret Knock Hint) with Anti-Seek Guard.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_optin_bonus_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homescreen_bonus_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailer_60s_rewarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailer_30s_claimed_at timestamptz DEFAULT NULL;

-- Динамическая суточная квота билетов по МСК:
-- до 10.12 включительно -> 4/сутки
-- 11.12 .. 14.12       -> 5/сутки
-- 15.12 .. 16.12       -> 6/сутки
-- с 17.12              -> 0/сутки
-- Арифметика (с учетом уже выданных 5 на 25.11): 5 + 15*4 + 4*5 + 2*6 = 97 <= 100 (доживает до 16.12!)
CREATE OR REPLACE FUNCTION public.get_dynamic_daily_ticket_quota(p_msk_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d date := COALESCE(p_msk_date, (now() AT TIME ZONE 'Europe/Moscow')::date);
BEGIN
  IF v_d <= DATE '2026-12-10' THEN
    RETURN 4;
  ELSIF v_d <= DATE '2026-12-14' THEN
    RETURN 5;
  ELSIF v_d <= DATE '2026-12-16' THEN
    RETURN 6;
  END IF;
  RETURN 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dynamic_daily_ticket_quota(date) TO PUBLIC, anon, authenticated;

-- Одноразовый бонус за разрешение Telegram-пушей (+1 жизнь и +150 звезд)
CREATE OR REPLACE FUNCTION public.claim_push_optin_bonus_rpc(p_uid text)
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

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  IF NOT COALESCE(u.tg_write_access, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'write_access_not_enabled',
      'lives', COALESCE(u.lives, 0),
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  IF COALESCE(u.push_optin_bonus_claimed, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed',
      'lives', COALESCE(u.lives, 0),
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  UPDATE public.users
  SET
    push_optin_bonus_claimed = true,
    lives = COALESCE(lives, 0) + 1,
    lives_updated_at = now(),
    premiere_points = COALESCE(premiere_points, 0) + 150,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'duplicate_blocked', false,
    'lives_added', 1,
    'points_added', 150,
    'lives', COALESCE(u.lives, 0),
    'premiere_points', COALESCE(u.premiere_points, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_push_optin_bonus_rpc(text) TO PUBLIC, anon, authenticated;

-- Ярлык на экран при отказе от пушей (+100 звезд, защита от дубля)
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

  IF COALESCE(u.tg_write_access, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'homescreen_shortcut_added', true,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'push_already_enabled',
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

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

-- Промежуточный микро-чекпоинт 60-й секунды VK-трейлера (+100 звезд + подсказка секретного стука)
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
      'trailer_60s_rewarded', true
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
    'hint', 'Секретный стук: у моря 3-пауза-2, в цеху 19-97 (+3 ❤️)'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_trailer_60s_checkpoint_rpc(text, numeric) TO PUBLIC, anon, authenticated;

-- Обновляем award_ticket_shard_rpc: динамическая квота (4/5/6 МСК), сохранение trailer_30s_claimed_at, финал 16.12 23:59 МСК
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

  IF v_src = 'trailer_full' AND v_trailer_30s_done AND NOT ('trailer_full' = ANY(v_claimed)) THEN
    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + v_base_pts,
      trailer_watched_full = true,
      trailer_rewarded = true,
      lives = GREATEST(COALESCE(lives, 0), 6),
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
      'double_points_bonus', true, 'bonus_points', v_base_pts, 'total_trailer_points', v_base_pts * 2,
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

  IF v_src IN ('solo_til', 'trailer_30s', 'trailer_full', 'til_trophy') AND (v_prev_shards >= 2 OR v_solo_cnt >= 2) THEN
    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE v_fallback_pts END,
      trailer_watched_full = CASE WHEN v_src = 'trailer_full' THEN true ELSE COALESCE(trailer_watched_full, false) END,
      trailer_rewarded = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN true ELSE trailer_rewarded END,
      trailer_30s_claimed_at = CASE WHEN v_src = 'trailer_30s' THEN COALESCE(trailer_30s_claimed_at, now()) ELSE trailer_30s_claimed_at END,
      lives = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
      lives_updated_at = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN now() ELSE lives_updated_at END,
      shard_sources_claimed = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') AND NOT (v_src = ANY(v_claimed)) THEN array_append(v_claimed, v_src) ELSE v_claimed END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_full' THEN
      PERFORM public.bump_daily_metric('trailer_watched_full', 1);
    ELSIF v_src = 'trailer_30s' THEN
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
      trailer_watched_full = CASE WHEN v_src = 'trailer_full' THEN true ELSE COALESCE(trailer_watched_full, false) END,
      trailer_rewarded = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN true ELSE trailer_rewarded END,
      trailer_30s_claimed_at = CASE WHEN v_src = 'trailer_30s' THEN COALESCE(trailer_30s_claimed_at, now()) ELSE trailer_30s_claimed_at END,
      lives = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN GREATEST(COALESCE(lives, 0), 6) ELSE lives END,
      lives_updated_at = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN now() ELSE lives_updated_at END,
      premiere_points = COALESCE(premiere_points, 0) + CASE WHEN v_src = 'trailer_30s' THEN v_base_pts WHEN v_src = 'trailer_full' THEN v_fallback_pts ELSE 0 END,
      last_shard_at = now(),
      updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    IF v_src = 'trailer_full' THEN
      PERFORM public.bump_daily_metric('trailer_watched_full', 1);
    ELSIF v_src = 'trailer_30s' THEN
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

  -- 4/4 -> Склейка в целый билет с динамической суточной квотой (4/5/6 МСК) и общим капом 100
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

-- Обновляем try_award_cinema_ticket_rpc на динамическую квоту
CREATE OR REPLACE FUNCTION public.try_award_cinema_ticket_rpc(p_uid text, p_source text DEFAULT 'shard4'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'shard4')));
  cfg public.global_stats%ROWTYPE;
  u public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_burn_deadline timestamptz := timestamptz '2026-12-17 00:00:00+03';
  v_daily_quota integer := public.get_dynamic_daily_ticket_quota(msk_date);
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
      'ok', true, 'granted', false, 'reason', 'seed_admin_excluded',
      'fallback_points', 0, 'pending_tickets_count', 0
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

  IF now() >= v_burn_deadline OR v_daily_quota <= 0 THEN
    v_deny_reason := 'campaign_ended_dec16';
  ELSIF COALESCE(cfg.is_paused, false) THEN
    v_deny_reason := 'paused';
  ELSIF COALESCE(cfg.tickets_won, 0) >= COALESCE(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_cap_reached';
  ELSIF COALESCE(cfg.daily_tickets_issued, 0) >= v_daily_quota THEN
    v_deny_reason := 'daily_cap_reached';
  END IF;

  IF v_deny_reason <> '' THEN
    UPDATE public.global_stats
    SET daily_tickets_issued = cfg.daily_tickets_issued, daily_reset_date = cfg.daily_reset_date, max_daily_tickets = v_daily_quota, updated_at = now()
    WHERE id = 1;

    UPDATE public.users
    SET premiere_points = COALESCE(premiere_points, 0) + v_fallback_pts, updated_at = now()
    WHERE uid = v_uid
    RETURNING * INTO u;

    RETURN jsonb_build_object(
      'ok', true, 'granted', false, 'reason', v_deny_reason,
      'fallback_points', v_fallback_pts, 'premiere_points', u.premiere_points,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'daily_tickets_issued', cfg.daily_tickets_issued,
      'max_daily_tickets', v_daily_quota,
      'tickets_won', cfg.tickets_won,
      'max_total_tickets', cfg.max_total_tickets
    );
  END IF;

  UPDATE public.global_stats
  SET
    daily_tickets_issued = cfg.daily_tickets_issued + 1,
    daily_reset_date = cfg.daily_reset_date,
    max_daily_tickets = v_daily_quota,
    tickets_won = COALESCE(cfg.tickets_won, 0) + 1,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO cfg;

  UPDATE public.users
  SET pending_tickets_count = COALESCE(pending_tickets_count, 0) + 1, has_pending_ticket = true, updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true, 'granted', true, 'source', v_src,
    'pending_tickets_count', u.pending_tickets_count,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', v_daily_quota,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.try_award_cinema_ticket_rpc(text, text) TO PUBLIC, anon, authenticated;

-- Обновляем award_duel_premiere_bank_rpc на динамическую квоту и потолок 100
CREATE OR REPLACE FUNCTION public.award_duel_premiere_bank_rpc(
  p_uid text,
  p_points_bonus integer DEFAULT 450,
  p_solo boolean DEFAULT false,
  p_count_win boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_pts integer := greatest(0, least(1800, coalesce(p_points_bonus, 450)));
  v_gs public.global_stats%ROWTYPE;
  v_drop_ticket boolean := false;
  v_user public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_daily_quota integer := public.get_dynamic_daily_ticket_quota(msk_date);
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
       AND now() < timestamptz '2026-12-17 00:00:00+03'
       AND v_daily_quota > 0
       AND coalesce(v_gs.tickets_won, 0) < coalesce(v_gs.max_total_tickets, 100)
       AND coalesce(v_gs.daily_tickets_issued, 0) < v_daily_quota
       AND random() < (CASE WHEN p_solo THEN 0.12 ELSE 0.22 END)
    THEN
      v_drop_ticket := true;
      UPDATE public.global_stats
      SET
        daily_tickets_issued = v_gs.daily_tickets_issued + 1,
        daily_reset_date = v_gs.daily_reset_date,
        max_daily_tickets = v_daily_quota,
        tickets_won = coalesce(v_gs.tickets_won, 0) + 1,
        updated_at = now()
      WHERE id = 1;
    END IF;
  END IF;

  UPDATE public.users
  SET
    premiere_points = premiere_points + v_pts,
    duels_played = duels_played + (CASE WHEN coalesce(p_count_win, false) THEN 1 ELSE 0 END),
    duels_won = duels_won + (CASE WHEN coalesce(p_count_win, false) THEN 1 ELSE 0 END),
    superprize_unlocked_at = COALESCE(
      superprize_unlocked_at,
      CASE WHEN premiere_points + v_pts >= 5000 THEN now() ELSE NULL END
    ),
    current_level = GREATEST(
      COALESCE(current_level, 1),
      CASE
        WHEN premiere_points + v_pts >= 5000
          THEN 2 + LEAST(11, FLOOR(((premiere_points + v_pts) - 5000) / 3000.0)::integer)
        ELSE COALESCE(current_level, 1)
      END
    ),
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
    'current_level', v_user.current_level,
    'lives', v_user.lives,
    'duels_won', v_user.duels_won,
    'duels_played', v_user.duels_played,
    'pending_tickets_count', coalesce(v_user.pending_tickets_count, 0),
    'ticket_dropped', v_drop_ticket
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_duel_premiere_bank_rpc(text, integer, boolean, boolean) TO PUBLIC, anon, authenticated;

-- Обновляем прозрачный виджет фонда призов: отображает текущую динамическую дневную квоту
CREATE OR REPLACE FUNCTION public.get_public_raffle_transparency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  gs public.global_stats%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_daily_quota integer := public.get_dynamic_daily_ticket_quota(msk_date);
  v_daily_issued integer := 0;
BEGIN
  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  v_daily_issued := CASE
    WHEN gs.daily_reset_date IS DISTINCT FROM msk_date THEN 0
    ELSE COALESCE(gs.daily_tickets_issued, 0)
  END;
  RETURN jsonb_build_object(
    'ok', true,
    'total_players', COALESCE(gs.total_players, 0),
    'total_strikes', COALESCE(gs.total_strikes, 0),
    'daily_tickets_issued', v_daily_issued,
    'max_daily_tickets', v_daily_quota,
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'max_total_tickets', COALESCE(gs.max_total_tickets, 100),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0),
    'max_premiere_winners', COALESCE(gs.max_premiere_winners, 0),
    'is_paused', COALESCE(gs.is_paused, false)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_raffle_transparency() TO PUBLIC, anon, authenticated;

-- Обновляем get_or_create_player_profile (добавляем флаги бонусов v20.8)
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
    'trailer_60s_rewarded', COALESCE(u.trailer_60s_rewarded, false),
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
    'homescreen_shortcut_added', COALESCE(u.homescreen_shortcut_added, false),
    'push_optin_bonus_claimed', COALESCE(u.push_optin_bonus_claimed, false),
    'homescreen_bonus_claimed', COALESCE(u.homescreen_bonus_claimed, false)
  );
END;
$function$;
