-- ============================================================================
-- MIGRATION v19.4 (solo_ticket_guard):
-- Закрытие дыры соло-фарма билетов против бота Тиля (p_source = 'solo_til'):
-- 1. По 'solo_til' игрок может получить МАКСИМУМ 2 части билета (до 2/4).
--    При попытке 3-й части от бота -> 'solo_cap_reached' + fallback +500 ⭐.
-- 2. 3/4 и 4/4 части (и сборка целого билета) засчитываются СТРОГО при наличии:
--    - подтверждённой записи в public.social_connections (opened_barrel=true или duels_together>0)
--      [или запертой другом личной бочки barrels.opened_by_uid], ЛИБО
--    - недавней победы в ЖИВОЙ дуэли 1x1 с реальным вторым игроком (не ботом, p_source = 'duel').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.award_ticket_shard_rpc(
  p_uid text,
  p_source text DEFAULT 'level'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'pending_tickets_count', 0
    );
  END IF;

  v_claimed := COALESCE(u.shard_sources_claimed, '{}');
  v_prev_shards := LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0)));
  v_solo_cnt := COALESCE((SELECT COUNT(*) FROM unnest(v_claimed) AS x WHERE x = 'solo_til'), 0);

  -- Антифрод: один и тот же не-дуэльный источник нельзя надюпать в цикле 0..3
  IF v_src NOT IN ('duel', 'solo_til') AND v_src = ANY(v_claimed) THEN
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
      'premiere_points', COALESCE(u.premiere_points, 0)
    );
  END IF;

  -- Соло против бота Тиля ('solo_til'): максимум 2 части (до 2/4)!
  IF v_src = 'solo_til' AND (v_prev_shards >= 2 OR v_solo_cnt >= 2) THEN
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
      'reason', 'solo_cap_reached',
      'fallback_points', v_fallback_pts,
      'premiere_points', COALESCE(u.premiere_points, 0),
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0)
    );
  END IF;

  -- Для дуэлей и соло-Тиля защитный кулдаун 15 секунд против параллельных запросов
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
      'premiere_points', COALESCE(u.premiere_points, 0)
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
        'pending_tickets_count', COALESCE(u.pending_tickets_count, 0)
      );
    END IF;
  END IF;

  -- Части 1/4, 2/4, 3/4 накапливаются с записью источника в shard_sources_claimed
  IF v_next_shards < 4 THEN
    UPDATE public.users
    SET
      ticket_shards = v_next_shards,
      shard_sources_claimed = CASE WHEN v_src = 'duel' THEN v_claimed ELSE array_append(v_claimed, v_src) END,
      last_shard_at = now(),
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
      'duplicate_blocked', false,
      'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
      'premiere_points', COALESCE(u.premiere_points, 0)
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
    'max_total_tickets', cfg.max_total_tickets
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO anon, authenticated;
