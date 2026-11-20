-- v14.1: Классификация стартовых меток посева src_prod* / src_prd* (продюсеры) и src_blogger_<имя> (блогеры) в /admin/
CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  seq_strikes bigint := 0;
  seq_called boolean := false;
  daily_arr jsonb;
  orders_arr jsonb;
  leaders_arr jsonb;
  traffic_obj jsonb;
  tags_arr jsonb;
  stats_obj jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  SELECT last_value, is_called INTO seq_strikes, seq_called FROM public.premiere_strike_seq;
  IF NOT COALESCE(seq_called, false) THEN seq_strikes := 0; END IF;

  stats_obj := row_to_json(gs)::jsonb || jsonb_build_object(
    'total_strikes', GREATEST(COALESCE(gs.total_strikes, 0), COALESCE(seq_strikes, 0)),
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'tickets_burned', COALESCE(gs.tickets_burned, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0)
  );

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day ASC), '[]'::jsonb) INTO daily_arr
  FROM (SELECT * FROM public.daily_metrics ORDER BY day DESC LIMIT 21) d;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb) INTO orders_arr
  FROM public.ticket_orders o;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) INTO leaders_arr
  FROM (
    SELECT uid, tg_user_id, tg_username, display_name, premiere_points, premiere_score,
           current_level, lives, friends_brought, tickets_gifted, duels_won, packed_count,
           kp_verified, kp_screenshot_url, premiere_won, premiere_confirmed, premiere_code,
           COALESCE(traffic_source, 'organic') AS traffic_source, updated_at
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at DESC
    LIMIT 50
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO tags_arr
  FROM (
    SELECT COALESCE(NULLIF(traffic_source, ''), 'organic') AS tag,
           COUNT(*)::int AS players,
           COALESCE(SUM(packed_count), 0)::int AS barrels_packed,
           COALESCE(SUM(friends_brought), 0)::int AS friends_brought,
           COALESCE(SUM(tickets_gifted), 0)::int AS tickets_gifted
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  ) t;

  SELECT jsonb_build_object(
    'friends_seed', COUNT(*) FILTER (
      WHERE traffic_source LIKE 'src\_prod%'
         OR traffic_source LIKE 'src\_prd%'
         OR traffic_source LIKE 'src\_friend%'
    ),
    'test_seed', COUNT(*) FILTER (WHERE traffic_source LIKE 'src\_test%'),
    'social_ads', COUNT(*) FILTER (WHERE traffic_source IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')),
    'bloggers_til', COUNT(*) FILTER (
      WHERE traffic_source LIKE 'src\_%'
        AND traffic_source NOT LIKE 'src\_prod%'
        AND traffic_source NOT LIKE 'src\_prd%'
        AND traffic_source NOT LIKE 'src\_friend%'
        AND traffic_source NOT LIKE 'src\_test%'
        AND traffic_source NOT IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')
    ),
    'referrals_viral', COUNT(*) FILTER (WHERE COALESCE(NULLIF(traffic_source,''),'organic') NOT LIKE 'src\_%'),
    'by_tag', tags_arr
  ) INTO traffic_obj
  FROM public.users
  WHERE NOT public.is_sandbox_uid(uid);

  RETURN jsonb_build_object(
    'ok', true,
    'stats', stats_obj,
    'daily', daily_arr,
    'orders', orders_arr,
    'leaders', leaders_arr,
    'traffic', traffic_obj
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard() TO authenticated;
