-- БОЧКА v20.6: 30s Trailer Base Reward + 90% 2x Points Bonus + Telegram Push Anti-Spam Tracking
-- Preserves 100-ticket total cap, 6-per-day MSK cap, solo 2/4 cap, and seed exclusion.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_service_push_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_push_event text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_push_error text DEFAULT NULL;

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

  -- Защита от дубля 30s базовой награды трейлера
  IF v_src = 'trailer_30s' AND (v_trailer_30s_done OR ('trailer_full' = ANY(v_claimed))) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed_source',
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- v20.6: Если игрок уже получил Этап 1 на 30-й секунде и досмотрел трейлер >=90%, начисляем x2 бонус (+250 ⭐) без дублирования четвертинки!
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
      'ok', true,
      'source', v_src,
      'shards', LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0))),
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'double_points_bonus', true,
      'bonus_points', v_base_pts,
      'total_trailer_points', v_base_pts * 2,
      'reason', 'full_watch_2x_bonus',
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives,
      'trailer_watched_full', true
    );
  END IF;

  -- Защита от дубликата обычных одноразовых источников
  IF v_src NOT IN ('duel', 'friend_opened') AND v_src = ANY(v_claimed) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed_source',
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- Потолок соло-источников (<= 2/4)
  IF v_src IN ('solo_til', 'trailer_30s', 'trailer_full', 'til_trophy') AND (v_prev_shards >= 2 OR v_solo_cnt >= 2) THEN
    UPDATE public.users
    SET
      premiere_points = COALESCE(premiere_points, 0) + CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE v_fallback_pts END,
      trailer_watched_full = CASE WHEN v_src = 'trailer_full' THEN true ELSE COALESCE(trailer_watched_full, false) END,
      trailer_rewarded = CASE WHEN v_src IN ('trailer_30s', 'trailer_full') THEN true ELSE trailer_rewarded END,
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
      'ok', true,
      'source', v_src,
      'shards', v_prev_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', false,
      'duplicate_blocked', false,
      'reason', 'solo_cap_reached',
      'fallback_points', CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE v_fallback_pts END,
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- Кулдаун на бои/дуэли (15с)
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

  -- Части 3/4 и 4/4 требуют реального друга или дуэли 1x1
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
      'ok', true,
      'source', v_src,
      'shards', v_next_shards,
      'prev_shards', v_prev_shards,
      'merged_ticket', false,
      'granted', true,
      'base_points', CASE WHEN v_src = 'trailer_30s' THEN v_base_pts ELSE 0 END,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0),
      'lives', u.lives,
      'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  -- 4/4 -> Склейка в целый билет с проверкой глобального лимита (100 всего / 6 в сутки МСК)
  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF cfg.daily_reset_date IS DISTINCT FROM msk_date THEN
    UPDATE public.global_stats SET daily_tickets_issued = 0, daily_reset_date = msk_date, updated_at = now() WHERE id = 1
    RETURNING * INTO cfg;
  END IF;

  IF now() >= v_burn_deadline THEN
    v_deny_reason := 'burn_deadline_passed';
  ELSIF COALESCE(u.prize_excluded, false) THEN
    v_deny_reason := 'prize_excluded';
  ELSIF COALESCE(cfg.tickets_won, 0) >= COALESCE(cfg.max_total_tickets, 100) THEN
    v_deny_reason := 'total_limit_reached';
  ELSIF COALESCE(cfg.daily_tickets_issued, 0) >= COALESCE(cfg.max_daily_tickets, 6) THEN
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
      'lives', u.lives, 'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
    );
  END IF;

  UPDATE public.global_stats
  SET tickets_won = tickets_won + 1, daily_tickets_issued = daily_tickets_issued + 1, updated_at = now()
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
    'ok', true,
    'source', v_src,
    'shards', 0,
    'prev_shards', v_prev_shards,
    'merged_ticket', true,
    'granted', true,
    'pending_tickets_count', u.pending_tickets_count,
    'premiere_points', COALESCE(u.premiere_points, 0),
    'lives', u.lives,
    'daily_tickets_issued', cfg.daily_tickets_issued,
    'max_daily_tickets', cfg.max_daily_tickets,
    'tickets_won', cfg.tickets_won,
    'max_total_tickets', cfg.max_total_tickets,
    'trailer_watched_full', COALESCE(u.trailer_watched_full, false)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO PUBLIC, anon, authenticated;

-- Серверная проверка антиспам-кулдауна (максимум 1 сервисный пуш в 24 часа)
CREATE OR REPLACE FUNCTION public.check_and_mark_service_push_rpc(
  p_uid text,
  p_event text DEFAULT 'service_return_push',
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  u public.users%ROWTYPE;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'allowed', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'allowed', false, 'reason', 'user_not_found');
  END IF;

  IF NOT COALESCE(u.tg_write_access, false) OR NULLIF(trim(coalesce(u.tg_chat_id, u.tg_user_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'allowed', false, 'reason', 'no_write_access');
  END IF;

  IF u.last_service_push_at IS NOT NULL AND u.last_service_push_at > now() - interval '24 hours' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', false,
      'reason', 'service_cooldown_24h',
      'next_allowed_at', u.last_service_push_at + interval '24 hours'
    );
  END IF;

  IF NOT COALESCE(p_dry_run, false) THEN
    UPDATE public.users
    SET last_service_push_at = now(), last_push_event = left(coalesce(p_event, 'service_return_push'), 64), updated_at = now()
    WHERE uid = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'allowed', true,
    'chat_id', coalesce(nullif(trim(u.tg_chat_id), ''), trim(u.tg_user_id))
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_and_mark_service_push_rpc(text, text, boolean) TO service_role;
