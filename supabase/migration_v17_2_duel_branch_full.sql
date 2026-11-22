-- ============================================================================
-- БОЧКА v17.2: Усиленная RPC get_my_branch_duel_candidates_rpc
-- Собирает граф связей из ВСЕХ источников (social_connections + barrels.opened_by_uid + users.referred_by_uid),
-- чтобы 4-коленная ветка и «Кому отправил» работали МГНОВЕННО сразу после вскрытия бочки другом (0 дублей).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_branch_duel_candidates_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_sent jsonb := '[]'::jsonb;
  v_branch jsonb := '[]'::jsonb;
BEGIN
  IF v_uid = '' OR length(v_uid) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'sent', '[]'::jsonb, 'branch', '[]'::jsonb);
  END IF;

  -- 1. Кому ты отправил бочку (и кто прислал тебе) из social_connections + barrels + users.referred_by_uid
  WITH raw_edges AS (
    SELECT sender_uid AS a_uid, receiver_uid AS b_uid, opened_barrel, COALESCE(duels_together, 0) AS duels_together, updated_at
    FROM public.social_connections
    WHERE sender_uid IS NOT NULL AND receiver_uid IS NOT NULL AND sender_uid <> receiver_uid

    UNION ALL

    SELECT b.sender_uid AS a_uid, b.opened_by_uid AS b_uid, true AS opened_barrel, 0 AS duels_together, COALESCE(b.opened_at, b.created_at) AS updated_at
    FROM public.barrels b
    WHERE b.sender_uid IS NOT NULL AND b.opened_by_uid IS NOT NULL
      AND b.sender_uid <> '' AND b.opened_by_uid <> '' AND b.sender_uid <> b.opened_by_uid

    UNION ALL

    SELECT u.referred_by_uid AS a_uid, u.uid AS b_uid, true AS opened_barrel, 0 AS duels_together, u.updated_at
    FROM public.users u
    WHERE u.referred_by_uid IS NOT NULL AND u.referred_by_uid <> '' AND u.referred_by_uid <> u.uid
  ),
  direct_links AS (
    SELECT
      e.b_uid AS friend_uid,
      'sent'::text AS relation,
      bool_or(e.opened_barrel) AS opened_barrel,
      MAX(e.duels_together) AS duels_together,
      MAX(e.updated_at) AS updated_at
    FROM raw_edges e
    WHERE e.a_uid = v_uid AND e.b_uid <> v_uid
    GROUP BY e.b_uid

    UNION ALL

    SELECT
      e.a_uid AS friend_uid,
      'invited_by'::text AS relation,
      bool_or(e.opened_barrel) AS opened_barrel,
      MAX(e.duels_together) AS duels_together,
      MAX(e.updated_at) AS updated_at
    FROM raw_edges e
    WHERE e.b_uid = v_uid AND e.a_uid <> v_uid
    GROUP BY e.a_uid
  ),
  dedup_sent AS (
    SELECT DISTINCT ON (friend_uid)
      friend_uid, relation, opened_barrel, duels_together, updated_at
    FROM direct_links
    ORDER BY friend_uid, (CASE WHEN relation = 'sent' THEN 0 ELSE 1 END), updated_at DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'uid', d.friend_uid,
        'tg_id', COALESCE(NULLIF(u.tg_user_id, ''), CASE WHEN d.friend_uid LIKE 'tg_%' THEN substr(d.friend_uid, 4) ELSE '' END),
        'name', COALESCE(
          NULLIF(u.display_name, ''),
          NULLIF(u.tg_username, ''),
          (SELECT NULLIF(sc2.receiver_name, '') FROM public.social_connections sc2 WHERE sc2.receiver_uid = d.friend_uid ORDER BY sc2.updated_at DESC LIMIT 1),
          'Друг из Цеха'
        ),
        'username', COALESCE(NULLIF(u.tg_username, ''), ''),
        'relation', d.relation,
        'opened_barrel', d.opened_barrel,
        'duels_together', d.duels_together,
        'avatar_url', COALESCE(
          (SELECT b.photo_url FROM public.barrels b WHERE b.sender_uid = d.friend_uid AND b.photo_url IS NOT NULL AND b.photo_url <> '' ORDER BY b.created_at DESC LIMIT 1),
          ''
        )
      )
      ORDER BY d.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_sent
  FROM (SELECT * FROM dedup_sent ORDER BY updated_at DESC LIMIT 25) d
  LEFT JOIN public.users u ON u.uid = d.friend_uid;

  -- 2. Игроки из общей вирусной ветки (обход объединённого графа до 4 колен)
  WITH RECURSIVE unified_edges AS (
    SELECT DISTINCT a_uid, b_uid FROM (
      SELECT sender_uid AS a_uid, receiver_uid AS b_uid FROM public.social_connections
      WHERE sender_uid IS NOT NULL AND receiver_uid IS NOT NULL AND sender_uid <> receiver_uid
      UNION
      SELECT sender_uid AS a_uid, opened_by_uid AS b_uid FROM public.barrels
      WHERE sender_uid IS NOT NULL AND opened_by_uid IS NOT NULL AND sender_uid <> '' AND opened_by_uid <> '' AND sender_uid <> opened_by_uid
      UNION
      SELECT referred_by_uid AS a_uid, uid AS b_uid FROM public.users
      WHERE referred_by_uid IS NOT NULL AND referred_by_uid <> '' AND referred_by_uid <> uid
    ) s
  ),
  branch_walk(node_uid, hop, visited) AS (
    SELECT v_uid, 0, ARRAY[v_uid]::text[]
    UNION ALL
    SELECT
      CASE WHEN ue.a_uid = bw.node_uid THEN ue.b_uid ELSE ue.a_uid END AS next_uid,
      bw.hop + 1,
      bw.visited || (CASE WHEN ue.a_uid = bw.node_uid THEN ue.b_uid ELSE ue.a_uid END)
    FROM branch_walk bw
    JOIN unified_edges ue
      ON ue.a_uid = bw.node_uid OR ue.b_uid = bw.node_uid
    WHERE bw.hop < 4
      AND NOT ((CASE WHEN ue.a_uid = bw.node_uid THEN ue.b_uid ELSE ue.a_uid END) = ANY(bw.visited))
  ),
  branch_nodes AS (
    SELECT node_uid, MIN(hop) AS min_hop
    FROM branch_walk
    WHERE node_uid <> v_uid
    GROUP BY node_uid
    ORDER BY MIN(hop) ASC, node_uid ASC
    LIMIT 35
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'uid', bn.node_uid,
        'tg_id', COALESCE(NULLIF(u.tg_user_id, ''), CASE WHEN bn.node_uid LIKE 'tg_%' THEN substr(bn.node_uid, 4) ELSE '' END),
        'name', COALESCE(
          NULLIF(u.display_name, ''),
          NULLIF(u.tg_username, ''),
          (SELECT NULLIF(sc2.receiver_name, '') FROM public.social_connections sc2 WHERE sc2.receiver_uid = bn.node_uid ORDER BY sc2.updated_at DESC LIMIT 1),
          'Участник ветки'
        ),
        'username', COALESCE(NULLIF(u.tg_username, ''), ''),
        'relation', CASE WHEN bn.min_hop = 1 THEN 'direct' ELSE 'branch' END,
        'hop', bn.min_hop,
        'avatar_url', COALESCE(
          (SELECT b.photo_url FROM public.barrels b WHERE b.sender_uid = bn.node_uid AND b.photo_url IS NOT NULL AND b.photo_url <> '' ORDER BY b.created_at DESC LIMIT 1),
          ''
        )
      )
      ORDER BY bn.min_hop ASC, COALESCE(u.updated_at, now()) DESC
    ),
    '[]'::jsonb
  )
  INTO v_branch
  FROM branch_nodes bn
  LEFT JOIN public.users u ON u.uid = bn.node_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'sent', v_sent,
    'branch', v_branch
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_branch_duel_candidates_rpc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_branch_duel_candidates_rpc(text) TO anon, authenticated;
