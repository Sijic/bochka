-- ============================================================================
-- MIGRATION v15.1 (lock_and_antifraud):
-- 1. Одноразовый замок на личные бочки pack_* (is_broadcast = false):
--    - barrels.opened_by_uid, barrels.opened_at
--    - RPC claim_personal_barrel_open_rpc:
--      * is_broadcast = true (pr_* / bl_*) -> бесконечные, 1..N без замка
--      * opener == sender ("Избранное") -> 0 жирных наград (self_open_no_reward)
--      * opened_by_uid IS NOT NULL AND <> viewer -> ЗАМОК (locked = true),
--        0 повторных наград автору, но seed_prefix и root_tracking_code наследуются!
--      * первый реальный чужой opener -> атомарно ставит замок, наследует метки,
--        начисляет автору +20% (+500 ⭐), +3 ❤️ и бонусный обрывок билета (friend_opened)!
-- 2. Антифрод гонки кликов в award_ticket_shard_rpc:
--    - users.shard_sources_claimed text[], users.last_shard_at timestamptz
--    - 5 параллельных запросов с одним p_source в 1мс -> 1 засчитан, 4 заблокированы!
--    - При склейке 4/4 массив shard_sources_claimed сбрасывается для следующего цикла.
-- ============================================================================

ALTER TABLE public.barrels
  ADD COLUMN IF NOT EXISTS opened_by_uid text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz DEFAULT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS shard_sources_claimed text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_shard_at timestamptz DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 1. Усиленный award_ticket_shard_rpc с защитой от гонки кликов / дюпа 1 уровня
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_ticket_shard_rpc(
  p_uid text,
  p_source text DEFAULT 'level'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- АНТИФРОД ГОНКИ КЛИКОВ: один и тот же источник НЕЛЬЗЯ надюпать 2+ раза в текущем цикле 0..3!
  IF v_src <> 'duel' AND v_src = ANY(v_claimed) THEN
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

  -- Для дуэлей защитный кулдаун 15 секунд против спама параллельными запросами
  IF v_src = 'duel' AND u.last_shard_at IS NOT NULL AND (now() - u.last_shard_at) < interval '15 seconds' THEN
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
$$;

-- ----------------------------------------------------------------------------
-- 2. Одноразовый замок личной бочки pack_* + серверная выдача наград автору
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_personal_barrel_open_rpc(
  p_barrel_id text,
  p_viewer_uid text,
  p_viewer_tg_id text DEFAULT '',
  p_viewer_username text DEFAULT '',
  p_viewer_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid text := trim(coalesce(p_barrel_id, ''));
  v_uid text := trim(coalesce(p_viewer_uid, ''));
  v_tg text := trim(coalesce(p_viewer_tg_id, ''));
  b public.barrels%ROWTYPE;
  s_user public.users%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_root_code text := NULL;
  v_seed_prefix text := NULL;
  v_is_self boolean := false;
  v_shard_res jsonb := '{}'::jsonb;
BEGIN
  IF v_bid = '' OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'params_required');
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Многоразовые ссылки продюсеров (pr_*) и блогеров (bl_*) всегда бесконечны!
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

  -- Самооткрытие автором ("Избранное"): 0 жирных наград, 0 обрывков, замок НЕ закрываем
  IF v_is_self THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', true,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'reason', 'self_open_no_reward'
    );
  END IF;

  -- Извлекаем корневые метки посева от автора бочки
  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' THEN
    SELECT * INTO s_user FROM public.users WHERE uid = b.sender_uid;
    IF FOUND THEN
      v_root_code := COALESCE(NULLIF(s_user.root_tracking_code, ''), NULLIF(s_user.seed_tracking_code, ''));
      v_seed_prefix := COALESCE(NULLIF(s_user.seed_prefix, ''), NULLIF(b.broadcast_prefix, ''));
    END IF;
  END IF;

  -- Гарантируем запись открывшего и ВСЕГДА наследуем корневые метки посева для /admin/
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
    traffic_source = CASE
      WHEN COALESCE(traffic_source, '') IN ('', 'organic') AND v_seed_prefix IS NOT NULL THEN v_seed_prefix
      ELSE traffic_source
    END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO v_user;

  -- ОДНОРАЗОВЫЙ ЗАМОК: личную бочку уже вскрыл другой человек!
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

  -- Идемпотентность: тот же первый друг обновил страницу F5 -> 0 повторных наград
  IF b.opened_by_uid = v_uid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  -- ПЕРВЫЙ РЕАЛЬНЫЙ ЧУЖОЙ ДРУГ (opener_uid != sender_uid):
  -- 1) Запираем личную бочку на него
  UPDATE public.barrels
  SET
    opened_by_uid = v_uid,
    opened_at = now(),
    opens_count = COALESCE(opens_count, 0) + 1
  WHERE short_id = v_bid;

  -- 2) Фиксируем в barrel_opens_ledger для идемпотентности со старым кодом
  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (v_bid, v_uid)
  ON CONFLICT DO NOTHING;

  -- 3) Начисляем автору СТРОГО 1 РАЗ жирные награды (+20% шкалы / +500 ⭐ / +3 ❤️ / обрывок 3/4)
  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND NOT public.is_sandbox_uid(v_uid) THEN
    UPDATE public.users
    SET
      friends_brought = COALESCE(friends_brought, 0) + 1,
      premiere_points = COALESCE(premiere_points, 0) + 500,
      premiere_score = LEAST(99.5, COALESCE(premiere_score, 0) + 20.0),
      lives = LEAST(12, COALESCE(lives, 0) + 3),
      lives_updated_at = now(),
      updated_at = now()
    WHERE uid = b.sender_uid;

    v_shard_res := public.award_ticket_shard_rpc(b.sender_uid, 'friend_opened');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_broadcast', false,
    'is_self', false,
    'locked', false,
    'first_open', true,
    'sender_rewarded', true,
    'sender_shard_res', v_shard_res,
    'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
    'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_ticket_shard_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_personal_barrel_open_rpc(text, text, text, text, text) TO anon, authenticated;
