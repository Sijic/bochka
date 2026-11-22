-- ============================================================================
-- БОЧКА v17.1: Дуэль строго 1 на 1 (2 друга) — выбор соперника:
--   1) sent   — кому ты отправил бочку / кто пригласил тебя (прямые связи)
--   2) branch — игроки из твоей общей вирусной ветки (до 4 колен)
-- Безопасная SECURITY DEFINER функция (SET search_path = public), 0 изменений данных.
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

  -- 1. Кому ты отправил бочку (и кто прислал тебе)
  WITH direct_links AS (
    SELECT
      sc.receiver_uid AS friend_uid,
      COALESCE(NULLIF(sc.receiver_tg_id, ''), NULLIF(u.tg_user_id, ''), '') AS friend_tg_id,
      COALESCE(NULLIF(sc.receiver_name, ''), NULLIF(u.display_name, ''), NULLIF(u.tg_username, ''), 'Друг из Цеха') AS friend_name,
      COALESCE(NULLIF(sc.receiver_username, ''), NULLIF(u.tg_username, ''), '') AS friend_username,
      'sent'::text AS relation,
      sc.opened_barrel,
      COALESCE(sc.duels_together, 0) AS duels_together,
      sc.updated_at
    FROM public.social_connections sc
    LEFT JOIN public.users u ON u.uid = sc.receiver_uid
    WHERE sc.sender_uid = v_uid AND sc.receiver_uid <> v_uid

    UNION ALL

    SELECT
      sc.sender_uid AS friend_uid,
      COALESCE(NULLIF(sc.sender_tg_id, ''), NULLIF(u.tg_user_id, ''), '') AS friend_tg_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.tg_username, ''), 'Друг из Цеха') AS friend_name,
      COALESCE(NULLIF(u.tg_username, ''), '') AS friend_username,
      'invited_by'::text AS relation,
      sc.opened_barrel,
      COALESCE(sc.duels_together, 0) AS duels_together,
      sc.updated_at
    FROM public.social_connections sc
    LEFT JOIN public.users u ON u.uid = sc.sender_uid
    WHERE sc.receiver_uid = v_uid AND sc.sender_uid <> v_uid
  ),
  dedup_sent AS (
    SELECT DISTINCT ON (friend_uid)
      friend_uid, friend_tg_id, friend_name, friend_username, relation, opened_barrel, duels_together, updated_at
    FROM direct_links
    ORDER BY friend_uid, (CASE WHEN relation = 'sent' THEN 0 ELSE 1 END), updated_at DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'uid', d.friend_uid,
        'tg_id', d.friend_tg_id,
        'name', d.friend_name,
        'username', d.friend_username,
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
  FROM (SELECT * FROM dedup_sent ORDER BY updated_at DESC LIMIT 25) d;

  -- 2. Игроки из общей вирусной ветки (обход графа social_connections до 4 колен)
  WITH RECURSIVE branch_walk(node_uid, hop, visited) AS (
    SELECT v_uid, 0, ARRAY[v_uid]::text[]
    UNION ALL
    SELECT
      CASE WHEN sc.sender_uid = bw.node_uid THEN sc.receiver_uid ELSE sc.sender_uid END AS next_uid,
      bw.hop + 1,
      bw.visited || (CASE WHEN sc.sender_uid = bw.node_uid THEN sc.receiver_uid ELSE sc.sender_uid END)
    FROM branch_walk bw
    JOIN public.social_connections sc
      ON sc.sender_uid = bw.node_uid OR sc.receiver_uid = bw.node_uid
    WHERE bw.hop < 4
      AND NOT ((CASE WHEN sc.sender_uid = bw.node_uid THEN sc.receiver_uid ELSE sc.sender_uid END) = ANY(bw.visited))
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
        'tg_id', COALESCE(NULLIF(u.tg_user_id, ''), ''),
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
