-- БОЧКА v20.10: Безопасная виральность, Эстафета +1 новый друг и Отработка 5 мин (Строго РФ)
-- 1) Таблица и RPC для Эстафеты после Пинг-Понга (+300 ⭐ и доступ к 3/4 билета 1 раз на игрока, только новому уникальному другу)
-- 2) Авто-триггер Эстафеты внутри claim_personal_barrel_open_rpc при открытии бочки новым другом
-- 3) award_ticket_shard_rpc: учет ping_pong_relay_claims для 3/4 доступа
-- 4) Отработка без Тиля: макс 2 смены/сут МСК, 0 ⭐ звёзд, потолок 2 ❤️, кулдаун снижен до 5 мин (300 сек)

CREATE TABLE IF NOT EXISTS public.ping_pong_relay_claims (
  id bigserial PRIMARY KEY,
  sender_uid text NOT NULL UNIQUE,
  ping_pong_target_uid text NOT NULL,
  relay_barrel_id text NOT NULL DEFAULT '',
  new_recipient_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ping_pong_relay_claims ENABLE ROW LEVEL SECURITY;

-- Обновляем award_ticket_shard_rpc: учитываем ping_pong_relay_claims как подтверждённую связь для 3/4
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

-- 1) Эстафета после Пинг-Понга: +300 ⭐ и доступ к 3/4 билета 1 раз на игрока только за НОВОГО уникального друга
CREATE OR REPLACE FUNCTION public.claim_ping_pong_relay_bonus_rpc(
  p_sender_uid text,
  p_relay_barrel_id text DEFAULT ''::text,
  p_recipient_uid text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender text := trim(coalesce(p_sender_uid, ''));
  v_barrel text := trim(coalesce(p_relay_barrel_id, ''));
  v_recipient text := trim(coalesce(p_recipient_uid, ''));
  v_ping_pong_target text := '';
  v_same_friend boolean := false;
  v_already boolean := false;
  u public.users%ROWTYPE;
  v_shard_res jsonb := '{}'::jsonb;
BEGIN
  IF v_sender = '' OR v_recipient = '' OR public.is_sandbox_uid(v_sender) OR public.is_sandbox_uid(v_recipient) THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_or_sandbox_uid');
  END IF;

  IF v_recipient = v_sender THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'duplicate_blocked', true, 'reason', 'self_relay_blocked');
  END IF;

  SELECT c.target_uid
  INTO v_ping_pong_target
  FROM public.ping_pong_revenge_claims c
  WHERE c.revenge_uid = v_sender
  ORDER BY c.id DESC
  LIMIT 1;

  IF COALESCE(v_ping_pong_target, '') = '' THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'duplicate_blocked', false, 'reason', 'ping_pong_required');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.ping_pong_revenge_claims c
    WHERE c.revenge_uid = v_sender
      AND c.target_uid = v_recipient
  ) INTO v_same_friend;

  IF v_same_friend THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'same_friend_blocked',
      'ping_pong_target_uid', v_ping_pong_target
    );
  END IF;

  INSERT INTO public.users (uid) VALUES (v_sender) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_sender FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.ping_pong_relay_claims rc WHERE rc.sender_uid = v_sender
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'duplicate_blocked', true,
      'reason', 'already_claimed_relay',
      'premiere_points', COALESCE(u.premiere_points, 0),
      'ticket_shards', COALESCE(u.ticket_shards, 0),
      'unlocked_34', true
    );
  END IF;

  INSERT INTO public.ping_pong_relay_claims (sender_uid, ping_pong_target_uid, relay_barrel_id, new_recipient_uid)
  VALUES (v_sender, v_ping_pong_target, v_barrel, v_recipient);

  -- Фиксируем социальную связь для 3/4, если она ещё не создана
  INSERT INTO public.social_connections (sender_uid, receiver_uid, opened_barrel)
  VALUES (v_sender, v_recipient, true)
  ON CONFLICT DO NOTHING;

  UPDATE public.social_connections
  SET opened_barrel = true, updated_at = now()
  WHERE sender_uid = v_sender AND receiver_uid = v_recipient AND COALESCE(opened_barrel, false) = false;

  UPDATE public.users
  SET
    premiere_points = COALESCE(premiere_points, 0) + 300,
    updated_at = now()
  WHERE uid = v_sender
  RETURNING * INTO u;

  -- Если у игрока < 3 четвертинок, продвигаем к 3/4 (с учетом уже открытого доступа)
  IF COALESCE(u.ticket_shards, 0) < 3 THEN
    v_shard_res := public.award_ticket_shard_rpc(v_sender, 'relay_new_friend');
    SELECT * INTO u FROM public.users WHERE uid = v_sender;
  END IF;

  PERFORM public.bump_daily_metric('ping_pong_relay', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'duplicate_blocked', false,
    'points_added', 300,
    'premiere_points', COALESCE(u.premiere_points, 0),
    'ticket_shards', COALESCE(u.ticket_shards, 0),
    'pending_tickets_count', COALESCE(u.pending_tickets_count, 0),
    'unlocked_34', true,
    'new_recipient_uid', v_recipient,
    'ping_pong_target_uid', v_ping_pong_target,
    'shard_res', v_shard_res
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_ping_pong_relay_bonus_rpc(text, text, text) TO PUBLIC, anon, authenticated;

-- 2) Интеграция Эстафеты внутрь claim_personal_barrel_open_rpc при вскрытии личной бочки новым другом
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
  v_relay_res jsonb := '{}'::jsonb;
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

  UPDATE public.barrels
  SET
    opened_by_uid = v_uid,
    opened_at = now(),
    opens_count = COALESCE(opens_count, 0) + 1
  WHERE short_id = v_bid;

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (v_bid, v_uid)
  ON CONFLICT DO NOTHING;

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

    -- v20.10: Авто-триггер бонуса Эстафеты (+300 ⭐ + 3/4), если отправитель ранее мстил Пинг-Понгом и закрыл НОВОГО друга
    IF EXISTS (SELECT 1 FROM public.ping_pong_revenge_claims rc WHERE rc.revenge_uid = b.sender_uid)
       AND NOT EXISTS (SELECT 1 FROM public.ping_pong_relay_claims lc WHERE lc.sender_uid = b.sender_uid)
    THEN
      v_relay_res := public.claim_ping_pong_relay_bonus_rpc(b.sender_uid, v_bid, v_uid);
    END IF;

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
      'relay_bonus', v_relay_res,
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

GRANT EXECUTE ON FUNCTION public.claim_personal_barrel_open_rpc(text, text, text, text, text, text) TO PUBLIC, anon, authenticated;

-- 3) Отработка без Тиля: макс 2 смены/сут МСК, 0 ⭐ звёзд, +1 ❤️ до потолка 2 ❤️, кулдаун 5 мин (300 сек)
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
      'cooldown_sec', 300,
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
      'cooldown_sec', 300,
      'rare_chip_eligible', false,
      'shards_34_eligible', false
    );
  END IF;

  IF v_user.last_recovery_shift_at IS NOT NULL
     AND now() - v_user.last_recovery_shift_at < interval '5 minutes'
  THEN
    v_retry_sec := GREATEST(1, LEAST(300, CEIL(300.0 - EXTRACT(EPOCH FROM (now() - v_user.last_recovery_shift_at)))::integer));
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'recovery_cooldown',
      'retry_after_sec', v_retry_sec,
      'cooldown_sec', 300,
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
    'cooldown_sec', 300,
    'rare_chip_eligible', false,
    'shards_34_eligible', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_workshop_recovery_life_rpc(text) TO PUBLIC, anon, authenticated;
