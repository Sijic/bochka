-- v7.3: аватарки/язык, глубина цепочки, допуск к розыгрышу, цепочки приглашений (личные + по поколениям)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS tg_lang text,
  ADD COLUMN IF NOT EXISTS chain_depth int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_excluded boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by_uid);

-- 1. Метаданные профиля из Telegram WebApp (аватар, язык). Только https, без перезаписи пустыми значениями.
CREATE OR REPLACE FUNCTION public.record_player_meta_rpc(
  p_uid text, p_avatar text DEFAULT NULL, p_lang text DEFAULT NULL, p_username text DEFAULT NULL, p_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE clean_uid text := trim(COALESCE(p_uid, ''));
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN RETURN jsonb_build_object('ok', true, 'sandbox', true); END IF;
  UPDATE public.users SET
    avatar_url = CASE WHEN length(p_avatar) <= 300 AND p_avatar ~ '^https://[^ ]+$' THEN p_avatar ELSE avatar_url END,
    tg_lang = COALESCE(NULLIF(left(p_lang, 8), ''), tg_lang),
    tg_username = COALESCE(NULLIF(left(p_username, 64), ''), tg_username),
    display_name = CASE WHEN COALESCE(display_name, '') = '' THEN left(COALESCE(p_name, ''), 80) ELSE display_name END,
    updated_at = now()
  WHERE uid = clean_uid;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.record_player_meta_rpc(text, text, text, text, text) TO anon, authenticated;

-- 2. Метка + родитель + глубина цепочки (первое касание)
CREATE OR REPLACE FUNCTION public.record_traffic_source_rpc(
  p_uid text, p_source text, p_tg_id text DEFAULT NULL, p_tg_username text DEFAULT NULL, p_display_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_uid text := trim(COALESCE(p_uid, ''));
  raw_src text := lower(trim(COALESCE(p_source, '')));
  clean_src text; parent_uid text := NULL; parent_src text; parent_depth int := NULL;
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN RETURN jsonb_build_object('ok', true, 'sandbox', true); END IF;
  clean_src := left(regexp_replace(raw_src, '[^a-z0-9_]', '', 'g'), 40);
  IF clean_src = '' THEN clean_src := 'organic'; END IF;
  PERFORM public.get_or_create_player_profile(clean_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));

  IF clean_src LIKE 'pack\_%' THEN
    SELECT b.sender_uid, COALESCE(NULLIF(u.traffic_source, ''), 'organic'), COALESCE(u.chain_depth, 0)
      INTO parent_uid, parent_src, parent_depth
    FROM public.barrels b LEFT JOIN public.users u ON u.uid = b.sender_uid
    WHERE b.short_id = substring(clean_src FROM 6) LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  ELSIF clean_src LIKE 'ref\_%' THEN
    SELECT u.uid, COALESCE(NULLIF(u.traffic_source, ''), 'organic'), COALESCE(u.chain_depth, 0)
      INTO parent_uid, parent_src, parent_depth
    FROM public.users u WHERE lower(u.uid) = substring(clean_src FROM 5) LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  END IF;
  IF parent_uid = clean_uid THEN parent_uid := NULL; parent_depth := NULL; END IF;

  UPDATE public.users SET
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN clean_src ELSE traffic_source END,
    chain_depth = CASE WHEN referred_by_uid IS NULL AND parent_uid IS NOT NULL THEN parent_depth + 1 ELSE COALESCE(chain_depth, 0) END,
    referred_by_uid = COALESCE(referred_by_uid, parent_uid),
    updated_at = now()
  WHERE uid = clean_uid;
  RETURN jsonb_build_object('ok', true, 'uid', clean_uid, 'traffic_source', clean_src, 'parent', parent_uid);
END; $$;
GRANT EXECUTE ON FUNCTION public.record_traffic_source_rpc(text, text, text, text, text) TO anon, authenticated;

-- 3. Топ-100 (p_mode: 'all' | 'eligible' — только участники розыгрыша)
DROP FUNCTION IF EXISTS public.admin_get_top100();
CREATE OR REPLACE FUNCTION public.admin_get_top100(p_mode text DEFAULT 'all') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied: admin only'; END IF;
  WITH RECURSIVE tree AS (
    SELECT uid AS root_uid, uid AS node_uid, 0 AS gen FROM public.users WHERE NOT public.is_sandbox_uid(uid)
    UNION ALL
    SELECT t.root_uid, c.uid, t.gen + 1 FROM tree t JOIN public.users c ON c.referred_by_uid = t.node_uid
    WHERE t.gen < 10 AND NOT public.is_sandbox_uid(c.uid)
  ), branch AS (
    SELECT root_uid, COUNT(*) FILTER (WHERE gen = 1)::int AS direct_cnt, COUNT(*) FILTER (WHERE gen >= 1)::int AS branch_total FROM tree GROUP BY root_uid
  ), base AS (
    SELECT u.*, vc.phone, vc.first_name AS contact_first_name,
      (NOT COALESCE(u.prize_excluded, false) AND NOT (COALESCE(u.traffic_source, '') LIKE 'src\_test%' AND COALESCE(u.chain_depth, 0) = 0)) AS eligible
    FROM public.users u LEFT JOIN public.verified_contacts vc ON vc.tg_user_id = u.tg_user_id
    WHERE NOT public.is_sandbox_uid(u.uid)
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (ORDER BY (b.friends_brought >= 2) DESC, b.premiere_points DESC, b.duels_won DESC, b.premiere_score DESC, b.created_at ASC)::int AS rank
    FROM base b WHERE p_mode <> 'eligible' OR b.eligible
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.rank), '[]'::jsonb) INTO res FROM (
    SELECT r.rank, r.uid, r.tg_user_id, r.tg_username, r.display_name, r.avatar_url, r.tg_lang, r.phone, r.contact_first_name,
      COALESCE(NULLIF(r.traffic_source, ''), 'organic') AS traffic_source, COALESCE(r.chain_depth, 0) AS chain_depth, r.eligible, r.referred_by_uid,
      r.premiere_points, r.premiere_score, r.current_level, r.lives, r.friends_brought, r.packed_count, r.tickets_gifted,
      COALESCE(ps.sent, 0)::int AS passes_sent, COALESCE(ps.claimed, 0)::int AS passes_claimed,
      r.duels_played, r.duels_won, r.kp_verified, r.premiere_won, r.premiere_code, r.has_pending_ticket,
      (r.tg_chat_id IS NOT NULL) AS can_notify, r.created_at, r.updated_at,
      COALESCE(br.direct_cnt, 0) AS direct_cnt, COALESCE(br.branch_total, 0) AS branch_total,
      COALESCE(lp.items, '[]'::jsonb) AS passes
    FROM ranked r
    LEFT JOIN branch br ON br.root_uid = r.uid
    LEFT JOIN (SELECT sender_uid, COUNT(*) sent, COUNT(*) FILTER (WHERE status IN ('claimed','sent')) claimed FROM public.ticket_passes GROUP BY sender_uid) ps ON ps.sender_uid = r.uid
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('recipient_name', p.recipient_name, 'photo', p.recipient_photo_url, 'status', p.status,
        'receiver_tg_id', p.receiver_tg_id, 'receiver_username', p.receiver_username, 'at', p.created_at) ORDER BY p.created_at DESC) items
      FROM (SELECT * FROM public.ticket_passes tp WHERE tp.sender_uid = r.uid ORDER BY tp.created_at DESC LIMIT 5) p) lp ON true
    ORDER BY r.rank LIMIT 100
  ) t;
  RETURN jsonb_build_object('ok', true, 'rows', res);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_get_top100(text) TO authenticated;

-- 4. Цепочка выбранного человека: путь сверху, личные приглашённые, все по поколениям (прогрессия)
CREATE OR REPLACE FUNCTION public.admin_get_chain(p_uid text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE upline jsonb; gens jsonb; kids jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied: admin only'; END IF;
  WITH RECURSIVE up AS (
    SELECT uid, referred_by_uid, 0 AS lvl FROM public.users WHERE uid = p_uid
    UNION ALL SELECT u.uid, u.referred_by_uid, up.lvl + 1 FROM up JOIN public.users u ON u.uid = up.referred_by_uid WHERE up.lvl < 12
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', x.uid, 'name', COALESCE(NULLIF(x.display_name, ''), x.tg_username, x.uid), 'username', x.tg_username,
      'avatar', x.avatar_url, 'source', x.traffic_source, 'lvl', up.lvl) ORDER BY up.lvl DESC), '[]'::jsonb)
  INTO upline FROM up JOIN public.users x ON x.uid = up.uid;

  WITH RECURSIVE down AS (
    SELECT c.uid, c.uid AS child, 1 AS gen FROM public.users c WHERE c.referred_by_uid = p_uid
    UNION ALL SELECT x.uid, d.child, d.gen + 1 FROM down d JOIN public.users x ON x.referred_by_uid = d.uid WHERE d.gen < 10
  ), per_gen AS (
    SELECT d.gen, COUNT(*)::int AS players, COALESCE(SUM(u.premiere_points), 0)::int AS points, COALESCE(SUM(u.packed_count), 0)::int AS packed,
           COUNT(*) FILTER (WHERE u.packed_count > 0)::int AS senders
    FROM down d JOIN public.users u ON u.uid = d.uid GROUP BY d.gen
  ), per_child AS (SELECT child, COUNT(*)::int AS branch_size FROM down GROUP BY child)
  SELECT (SELECT COALESCE(jsonb_agg(jsonb_build_object('gen', gen, 'players', players, 'points', points, 'packed', packed, 'senders', senders) ORDER BY gen), '[]'::jsonb) FROM per_gen),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', u.uid, 'name', COALESCE(NULLIF(u.display_name, ''), u.tg_username, u.uid), 'username', u.tg_username,
            'avatar', u.avatar_url, 'source', u.traffic_source, 'points', u.premiere_points, 'packed', u.packed_count, 'friends', u.friends_brought,
            'branch_size', COALESCE(pc.branch_size, 1),
            'eligible', (NOT COALESCE(u.prize_excluded, false) AND NOT (COALESCE(u.traffic_source, '') LIKE 'src\_test%' AND COALESCE(u.chain_depth, 0) = 0)))
            ORDER BY COALESCE(pc.branch_size, 1) DESC, u.premiere_points DESC), '[]'::jsonb)
          FROM public.users u LEFT JOIN per_child pc ON pc.child = u.uid WHERE u.referred_by_uid = p_uid)
  INTO gens, kids;
  RETURN jsonb_build_object('ok', true, 'upline', upline, 'per_gen', gens, 'direct', kids);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_get_chain(text) TO authenticated;

-- 5. Ручное исключение/возврат игрока в розыгрыш (только админ)
CREATE OR REPLACE FUNCTION public.admin_set_prize_excluded(p_uid text, p_excluded boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied: admin only'; END IF;
  UPDATE public.users SET prize_excluded = p_excluded, updated_at = now() WHERE uid = p_uid;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_set_prize_excluded(text, boolean) TO authenticated;
