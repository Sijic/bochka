-- ============================================================================
-- МИГРАЦИЯ v7.0: СВЯЗКА TELEGRAM-БОТА @bochka_film_bot, DEEP LINKS И ИСТОЧНИКИ ТРАФИКА
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS traffic_source text DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS tg_chat_id text,
  ADD COLUMN IF NOT EXISTS referred_by_uid text;

CREATE INDEX IF NOT EXISTS idx_users_traffic_source ON public.users(traffic_source);
CREATE INDEX IF NOT EXISTS idx_users_tg_user_id ON public.users(tg_user_id);

-- 1. Фиксация источника трафика (first-touch атрибуция: src_friends, src_til, src_blogger1..5, src_insta, ref_<uid>)
CREATE OR REPLACE FUNCTION public.record_traffic_source_rpc(
  p_uid text,
  p_source text,
  p_tg_id text DEFAULT NULL,
  p_tg_username text DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_uid text := trim(COALESCE(p_uid, ''));
  clean_src text := lower(trim(COALESCE(p_source, '')));
  ref_uid text := NULL;
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN
    RETURN jsonb_build_object('ok', true, 'sandbox', true);
  END IF;

  IF clean_src = '' THEN
    clean_src := 'organic';
  END IF;

  PERFORM public.get_or_create_player_profile(
    clean_uid,
    p_tg_id,
    p_tg_username,
    COALESCE(p_display_name, '')
  );

  IF clean_src LIKE 'ref_%' THEN
    ref_uid := substring(clean_src FROM 5);
  END IF;

  UPDATE public.users
  SET
    traffic_source = CASE
      WHEN COALESCE(traffic_source, '') IN ('', 'organic') AND clean_src <> 'organic' THEN clean_src
      ELSE COALESCE(NULLIF(traffic_source, ''), clean_src)
    END,
    referred_by_uid = COALESCE(referred_by_uid, ref_uid),
    updated_at = now()
  WHERE uid = clean_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'uid', clean_uid,
    'traffic_source', clean_src
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_traffic_source_rpc(text, text, text, text, text) TO anon, authenticated;

-- 2. Обновление admin_get_dashboard() со сводкой «Откуда пришёл трафик» для /admin/
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
  traffic_tags_arr jsonb;
  stats_obj jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  SELECT last_value, is_called INTO seq_strikes, seq_called FROM public.premiere_strike_seq;
  IF NOT COALESCE(seq_called, false) THEN
    seq_strikes := 0;
  END IF;

  stats_obj := row_to_json(gs)::jsonb || jsonb_build_object(
    'total_strikes', GREATEST(COALESCE(gs.total_strikes, 0), COALESCE(seq_strikes, 0)),
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'tickets_burned', COALESCE(gs.tickets_burned, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0)
  );

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day ASC), '[]'::jsonb)
  INTO daily_arr
  FROM (
    SELECT * FROM public.daily_metrics ORDER BY day DESC LIMIT 21
  ) d;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO orders_arr
  FROM public.ticket_orders o;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      uid, tg_user_id, tg_username, display_name,
      premiere_points, premiere_score, current_level,
      lives, friends_brought, tickets_gifted, duels_won, packed_count,
      kp_verified, kp_screenshot_url,
      premiere_won, premiere_confirmed, premiere_code,
      COALESCE(traffic_source, 'organic') AS traffic_source,
      updated_at
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at DESC
    LIMIT 50
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO traffic_tags_arr
  FROM (
    SELECT
      COALESCE(NULLIF(traffic_source, ''), 'organic') AS tag,
      COUNT(*)::int AS players,
      COALESCE(SUM(packed_count), 0)::int AS barrels_packed,
      COALESCE(SUM(friends_brought), 0)::int AS friends_brought,
      COALESCE(SUM(tickets_gifted), 0)::int AS tickets_gifted
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
    GROUP BY COALESCE(NULLIF(traffic_source, ''), 'organic')
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) t;

  SELECT jsonb_build_object(
    'friends_seed', COUNT(*) FILTER (
      WHERE traffic_source IN ('src_friends', 'friends', 'seed_friends')
         OR traffic_source LIKE 'src_friend%'
    )::int,
    'bloggers_til', COUNT(*) FILTER (
      WHERE traffic_source IN ('src_til', 'til')
         OR traffic_source LIKE 'src_blogger%'
         OR traffic_source LIKE 'blogger%'
    )::int,
    'social_ads', COUNT(*) FILTER (
      WHERE traffic_source IN ('src_insta', 'src_whatsapp', 'src_vk', 'src_tg_ads', 'insta', 'whatsapp')
    )::int,
    'referrals_viral', COUNT(*) FILTER (
      WHERE traffic_source LIKE 'ref_%'
         OR traffic_source LIKE 'pack_%'
         OR COALESCE(referred_by_uid, '') <> ''
         OR COALESCE(traffic_source, 'organic') = 'organic'
    )::int,
    'by_tag', COALESCE(traffic_tags_arr, '[]'::jsonb)
  )
  INTO traffic_obj
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
