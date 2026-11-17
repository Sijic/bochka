-- v7.2: админ-выгрузка Топ-100 (рейтинг, контакты, источник, подарки) — только для админа
CREATE OR REPLACE FUNCTION public.admin_get_top100() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied: admin only'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.rank), '[]'::jsonb) INTO res FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY (u.friends_brought >= 2) DESC, u.premiere_points DESC, u.duels_won DESC, u.premiere_score DESC, u.created_at ASC)::int AS rank,
      u.uid, u.tg_user_id, u.tg_username, u.display_name,
      vc.phone, vc.first_name AS contact_first_name,
      COALESCE(NULLIF(u.traffic_source, ''), 'organic') AS traffic_source,
      u.referred_by_uid,
      u.premiere_points, u.premiere_score, u.current_level, u.lives,
      u.friends_brought, u.packed_count, u.tickets_gifted,
      COALESCE(ps.sent, 0)::int AS passes_sent, COALESCE(ps.claimed, 0)::int AS passes_claimed,
      u.duels_played, u.duels_won, u.kp_verified, u.premiere_won, u.premiere_code, u.has_pending_ticket,
      (u.tg_chat_id IS NOT NULL) AS can_notify,
      u.created_at, u.updated_at,
      COALESCE(lp.items, '[]'::jsonb) AS passes
    FROM public.users u
    LEFT JOIN public.verified_contacts vc ON vc.tg_user_id = u.tg_user_id
    LEFT JOIN (SELECT sender_uid, COUNT(*) sent, COUNT(*) FILTER (WHERE status IN ('claimed','sent')) claimed
               FROM public.ticket_passes GROUP BY sender_uid) ps ON ps.sender_uid = u.uid
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('recipient_name', p.recipient_name, 'photo', p.recipient_photo_url,
                         'status', p.status, 'receiver_tg_id', p.receiver_tg_id, 'receiver_username', p.receiver_username, 'at', p.created_at)
                         ORDER BY p.created_at DESC) items
               FROM (SELECT * FROM public.ticket_passes tp WHERE tp.sender_uid = u.uid ORDER BY tp.created_at DESC LIMIT 5) p) lp ON true
    WHERE NOT public.is_sandbox_uid(u.uid)
    ORDER BY 1 LIMIT 100
  ) t;
  RETURN jsonb_build_object('ok', true, 'rows', res);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_get_top100() TO authenticated;
