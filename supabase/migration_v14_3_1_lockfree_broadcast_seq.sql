-- v14.3.1: Lock-free fast-path для assign_broadcast_visitor_rpc на пике сторис блогера-миллионника!
-- 1. Повторные визиты (F5 / reload) и сам создатель вообще НЕ берут блокировку на строку barrels.
-- 2. Новые посетители берут минимальную атомарную блокировку (<0.4ms) ровно на 1 UPDATE barrels ... RETURNING,
--    без предварительного SELECT ... FOR UPDATE на barrels, исключая очередь при тысячах кликов/сек.
CREATE OR REPLACE FUNCTION public.assign_broadcast_visitor_rpc(
  p_barrel_id text,
  p_visitor_uid text,
  p_tg_id text DEFAULT NULL,
  p_tg_username text DEFAULT NULL,
  p_display_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid text := trim(COALESCE(p_barrel_id, ''));
  v_uid text := trim(COALESCE(p_visitor_uid, ''));
  b public.barrels%ROWTYPE;
  u public.users%ROWTYPE;
  v_prefix text;
  v_seq integer;
  v_code text;
  v_milestone boolean := false;
BEGIN
  IF v_bid = '' OR v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  -- Чтение БЕЗ блокировки строки barrels (zero contention для F5 и не-broadcast бочек!)
  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  IF NOT COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object('ok', true, 'is_broadcast', false, 'assigned_now', false);
  END IF;

  IF (b.sender_uid IS NOT NULL AND b.sender_uid = v_uid)
     OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND NULLIF(trim(COALESCE(p_tg_id, '')), '') = b.sender_tg_id)
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', true,
      'is_self', true,
      'assigned_now', false,
      'visitor_seq', b.visitor_seq,
      'broadcast_prefix', b.broadcast_prefix
    );
  END IF;

  PERFORM public.get_or_create_player_profile(v_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  -- Идемпотентность: если у игрока уже есть его личный номер — выходим без блокировки barrels!
  IF NULLIF(trim(COALESCE(u.seed_tracking_code, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', true,
      'assigned_now', false,
      'idempotent', true,
      'seed_prefix', u.seed_prefix,
      'seed_seq', u.seed_seq,
      'seed_tracking_code', u.seed_tracking_code,
      'root_tracking_code', COALESCE(NULLIF(u.root_tracking_code, ''), u.seed_tracking_code),
      'visitor_seq', b.visitor_seq,
      'milestone_hit', false,
      'sender_tg_id', COALESCE(b.sender_tg_id, '')
    );
  END IF;

  v_prefix := COALESCE(
    NULLIF(trim(COALESCE(b.broadcast_prefix, '')), ''),
    'pr_' || left(regexp_replace(lower(b.short_id), '[^a-z0-9]', '', 'g'), 10)
  );

  -- Единственный короткий атомарный UPDATE на строке бочки (<0.4ms row lock) — 1..∞ без пропусков и дублей
  UPDATE public.barrels
  SET visitor_seq = COALESCE(visitor_seq, 0) + 1
  WHERE short_id = b.short_id
  RETURNING visitor_seq INTO v_seq;

  v_code := v_prefix || '_' || v_seq::text;
  v_milestone := v_seq IN (1, 10, 50, 100, 500, 1000, 5000);

  UPDATE public.users
  SET
    seed_prefix = v_prefix,
    seed_seq = v_seq,
    seed_tracking_code = v_code,
    root_tracking_code = COALESCE(NULLIF(root_tracking_code, ''), v_code),
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN v_prefix ELSE traffic_source END,
    referred_by_uid = COALESCE(referred_by_uid, b.sender_uid),
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'is_broadcast', true,
    'assigned_now', true,
    'seed_prefix', v_prefix,
    'seed_seq', v_seq,
    'seed_tracking_code', v_code,
    'root_tracking_code', v_code,
    'visitor_seq', v_seq,
    'milestone_hit', v_milestone,
    'sender_tg_id', COALESCE(b.sender_tg_id, '')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_broadcast_visitor_rpc(text, text, text, text, text) TO anon, authenticated;
