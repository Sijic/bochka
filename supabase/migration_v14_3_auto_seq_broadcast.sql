-- ============================================================================
-- MIGRATION v14.3 (auto_seq_broadcast):
-- Чистая механика многоразовых именных бочек (team_prod -> pr_<id>, team_blog -> bl_<id>)
-- с атомарной серверной нумерацией 1..∞ без потолка (pr_misha_1, bl_timur_8500),
-- идемпотентностью при повторных визитах, наследованием вглубь цепочки (root_tracking_code)
-- и мгновенным поиском по коду в /admin/.
-- ============================================================================

ALTER TABLE public.barrels
  ADD COLUMN IF NOT EXISTS is_broadcast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broadcast_prefix text,
  ADD COLUMN IF NOT EXISTS visitor_seq integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_blogger_seed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_prefix text,
  ADD COLUMN IF NOT EXISTS seed_seq integer,
  ADD COLUMN IF NOT EXISTS seed_tracking_code text,
  ADD COLUMN IF NOT EXISTS root_tracking_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_seed_tracking_code_uniq
  ON public.users (seed_tracking_code)
  WHERE seed_tracking_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_root_tracking_code
  ON public.users (root_tracking_code)
  WHERE root_tracking_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_seed_prefix
  ON public.users (seed_prefix)
  WHERE seed_prefix IS NOT NULL;

-- 1. Регистрация члена команды (team_prod) или стартового блогера (team_blog / bi_<id>)
CREATE OR REPLACE FUNCTION public.register_team_seed_rpc(
  p_uid text,
  p_role text DEFAULT 'prod',
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
  clean_uid text := trim(COALESCE(p_uid, ''));
  clean_role text := CASE WHEN lower(trim(COALESCE(p_role, ''))) = 'blog' THEN 'blog' ELSE 'prod' END;
  v_src text := CASE WHEN clean_role = 'blog' THEN 'team_blog' ELSE 'team_prod' END;
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN
    RETURN jsonb_build_object('ok', true, 'is_seed_admin', true, 'is_blogger_seed', (clean_role = 'blog'), 'sandbox', true);
  END IF;

  PERFORM public.get_or_create_player_profile(clean_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));

  UPDATE public.users
  SET
    is_seed_admin = true,
    is_blogger_seed = (COALESCE(is_blogger_seed, false) OR clean_role = 'blog'),
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN v_src ELSE traffic_source END,
    updated_at = now()
  WHERE uid = clean_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'uid', clean_uid,
    'role', clean_role,
    'is_seed_admin', true,
    'is_blogger_seed', (clean_role = 'blog')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_team_seed_rpc(text, text, text, text, text) TO anon, authenticated;

-- 2. Обновляем create_barrel_pack_rpc (поддержка is_broadcast и broadcast_prefix)
DROP FUNCTION IF EXISTS public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer, text, text);

CREATE OR REPLACE FUNCTION public.create_barrel_pack_rpc(
  p_short_id text,
  p_mode text,
  p_message text,
  p_frame_style text,
  p_sender_uid text,
  p_sender_tg_id text,
  p_sender_username text,
  p_sender_name text,
  p_photo_url text,
  p_voice_url text,
  p_target_index integer,
  p_seed_traffic_source text DEFAULT NULL,
  p_seed_target_handle text DEFAULT NULL,
  p_is_broadcast boolean DEFAULT false,
  p_broadcast_prefix text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := NULLIF(trim(COALESCE(p_sender_uid, '')), '');
  v_photo text := NULLIF(trim(COALESCE(p_photo_url, '')), '');
  v_voice text := NULLIF(trim(COALESCE(p_voice_url, '')), '');
  v_is_broadcast boolean := COALESCE(p_is_broadcast, false);
  v_b_prefix text := NULLIF(left(regexp_replace(lower(trim(COALESCE(p_broadcast_prefix, ''))), '[^a-z0-9_]', '', 'g'), 32), '');
  v_seed_src text := NULLIF(left(regexp_replace(lower(trim(COALESCE(p_seed_traffic_source, ''))), '[^a-z0-9_]', '', 'g'), 40), '');
  v_seed_handle text := NULLIF(left(trim(COALESCE(p_seed_target_handle, '')), 40), '');
  v_prev_surge boolean := false;
  v_prev_stage smallint := 1;
  v_surge_now boolean := false;
  v_score numeric(5,2) := 72.00;
  v_ui_stage smallint := 3;
  v_packed integer := 1;
  v_has_social boolean := false;
BEGIN
  IF p_short_id IS NULL OR length(trim(p_short_id)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_short_id');
  END IF;
  IF v_uid IS NOT NULL AND public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  IF v_is_broadcast THEN
    IF v_b_prefix IS NULL OR v_b_prefix !~ '^(?:pr|bl)_[a-z0-9_]{1,28}$' THEN
      v_b_prefix := 'pr_' || left(regexp_replace(lower(trim(p_short_id)), '[^a-z0-9]', '', 'g'), 10);
    END IF;
    v_seed_src := v_b_prefix;
  ELSIF v_seed_src IS NOT NULL AND v_seed_src NOT LIKE 'src\_%' AND v_seed_src NOT LIKE 'pr\_%' AND v_seed_src NOT LIKE 'bl\_%' THEN
    v_seed_src := NULL;
  END IF;

  IF v_photo IS NOT NULL AND v_photo !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_photo := NULL;
  END IF;
  IF v_voice IS NOT NULL AND v_voice !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/barrel-media/' THEN
    v_voice := NULL;
  END IF;

  INSERT INTO public.barrels (
    short_id, mode, message, frame_style,
    sender_uid, sender_tg_id, sender_username, sender_name,
    photo_url, voice_url, target_index,
    seed_traffic_source, seed_target_handle,
    is_broadcast, broadcast_prefix, visitor_seq
  )
  VALUES (
    trim(p_short_id),
    COALESCE(p_mode, 'friend'),
    left(COALESCE(p_message, ''), 80),
    COALESCE(p_frame_style, 'flashlight'),
    v_uid,
    NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_sender_username, '')), ''),
    left(COALESCE(p_sender_name, ''), 40),
    v_photo,
    v_voice,
    GREATEST(0, LEAST(9, COALESCE(p_target_index, 0))),
    v_seed_src,
    v_seed_handle,
    v_is_broadcast,
    CASE WHEN v_is_broadcast THEN v_b_prefix ELSE NULL END,
    0
  );

  IF v_uid IS NOT NULL THEN
    SELECT temu_surge_claimed, ui_stage
    INTO v_prev_surge, v_prev_stage
    FROM public.users
    WHERE uid = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      v_prev_surge := false;
      v_prev_stage := 1;
    END IF;

    v_has_social := EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = v_uid OR sc.receiver_uid = v_uid
    );

    v_surge_now := NOT COALESCE(v_prev_surge, false);

    INSERT INTO public.users (
      uid, tg_user_id, tg_username, display_name,
      packed_count, premiere_score, temu_surge_claimed, ui_stage, lives_updated_at
    )
    VALUES (
      v_uid,
      NULLIF(trim(COALESCE(p_sender_tg_id, '')), ''),
      NULLIF(trim(COALESCE(p_sender_username, '')), ''),
      left(COALESCE(p_sender_name, ''), 48),
      1,
      72.00,
      true,
      3,
      now()
    )
    ON CONFLICT (uid) DO UPDATE SET
      packed_count = public.users.packed_count + 1,
      premiere_score = GREATEST(public.users.premiere_score, 72.00),
      temu_surge_claimed = true,
      ui_stage = GREATEST(
        public.users.ui_stage,
        CASE
          WHEN NOT public.users.temu_surge_claimed THEN 3
          WHEN v_has_social OR public.users.duels_played > 0 OR public.users.friends_brought > 0 THEN 4
          ELSE 3
        END
      ),
      updated_at = now()
    RETURNING premiere_score, ui_stage, packed_count
    INTO v_score, v_ui_stage, v_packed;
  END IF;

  PERFORM public.bump_daily_metric('barrels_created', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'short_id', trim(p_short_id),
    'surge_triggered', v_surge_now,
    'premiere_score', v_score,
    'ui_stage', v_ui_stage,
    'packed_count', v_packed,
    'temu_surge_claimed', true,
    'is_broadcast', v_is_broadcast,
    'broadcast_prefix', v_b_prefix
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer, text, text, boolean, text) TO anon, authenticated;

-- 3. Атомарная идемпотентная нумерация 1..∞ при открытии многоразовой бочки pr_<id> или bl_<id>
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

  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  IF NOT COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object('ok', true, 'is_broadcast', false, 'assigned_now', false);
  END IF;

  PERFORM public.get_or_create_player_profile(v_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  -- Сам создатель бочки не нумеруется и не крутит счётчик
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

  -- Идемпотентность: если у игрока уже есть его личный номер — возвращаем его, счётчик НЕ крутим!
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

  -- Атомарный инкремент 1..∞ без потолка
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

-- 4. Многоразовые бочки НИКОГДА не закрываются и не уводят в повторную дуэль
CREATE OR REPLACE FUNCTION public.check_barrel_entry_routing(
  p_barrel_id text,
  p_viewer_uid text,
  p_viewer_tg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
  v public.users%ROWTYPE;
  already_connected boolean := false;
  viewer_played boolean := false;
  is_self boolean := false;
  room_code text := '';
BEGIN
  SELECT * INTO b FROM public.barrels WHERE short_id = trim(COALESCE(p_barrel_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  is_self := (
    (b.sender_uid IS NOT NULL AND b.sender_uid = trim(COALESCE(p_viewer_uid, '')))
    OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND b.sender_tg_id = trim(COALESCE(p_viewer_tg_id, '')))
  );

  -- Многоразовая бочка продюсера/блогера: 10 000+ человек открывают без редиректа в дуэль!
  IF COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', true,
      'is_self', is_self,
      'already_connected', false,
      'viewer_played', false,
      'should_route_to_duel', false,
      'suggested_room_id', 'd_' || b.short_id,
      'sender_name', COALESCE(b.sender_name, ''),
      'broadcast_prefix', COALESCE(b.broadcast_prefix, ''),
      'visitor_seq', COALESCE(b.visitor_seq, 0)
    );
  END IF;

  IF p_viewer_uid IS NOT NULL AND length(trim(p_viewer_uid)) >= 2 THEN
    SELECT * INTO v FROM public.users WHERE uid = trim(p_viewer_uid);
    IF FOUND THEN
      viewer_played := v.has_played_solo;
    END IF;
  END IF;

  IF NOT is_self AND b.sender_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.social_connections sc
      WHERE (sc.sender_uid = b.sender_uid AND sc.receiver_uid = trim(COALESCE(p_viewer_uid, '')))
         OR (sc.sender_uid = trim(COALESCE(p_viewer_uid, '')) AND sc.receiver_uid = b.sender_uid)
         OR (
           b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> ''
           AND p_viewer_tg_id IS NOT NULL AND trim(p_viewer_tg_id) <> ''
           AND (
             (sc.sender_tg_id = b.sender_tg_id AND sc.receiver_tg_id = trim(p_viewer_tg_id))
             OR (sc.sender_tg_id = trim(p_viewer_tg_id) AND sc.receiver_tg_id = b.sender_tg_id)
           )
         )
    ) INTO already_connected;
  END IF;

  room_code := 'd_' || substr(md5(LEAST(COALESCE(b.sender_uid, ''), COALESCE(p_viewer_uid, '')) || ':' || GREATEST(COALESCE(b.sender_uid, ''), COALESCE(p_viewer_uid, ''))), 1, 6);

  RETURN jsonb_build_object(
    'ok', true,
    'is_broadcast', false,
    'is_self', is_self,
    'already_connected', already_connected,
    'viewer_played', viewer_played,
    'should_route_to_duel', (NOT is_self AND (already_connected OR viewer_played)),
    'suggested_room_id', room_code,
    'sender_name', COALESCE(b.sender_name, '')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_barrel_entry_routing(text, text, text) TO anon, authenticated;

-- 5. Наследование seed_prefix и root_tracking_code вглубь цепочки до любого колена (pack_ / ref_ / pr_ / bl_)
CREATE OR REPLACE FUNCTION public.record_traffic_source_rpc(
  p_uid text, p_source text, p_tg_id text DEFAULT NULL, p_tg_username text DEFAULT NULL, p_display_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_uid text := trim(COALESCE(p_uid, ''));
  raw_src text := lower(trim(COALESCE(p_source, '')));
  clean_src text;
  ref_uid text := NULL;
  parent_src text;
  parent_prefix text := NULL;
  parent_root text := NULL;
  v_bid text;
BEGIN
  IF clean_uid = '' OR public.is_sandbox_uid(clean_uid) THEN
    RETURN jsonb_build_object('ok', true, 'sandbox', true);
  END IF;
  clean_src := left(regexp_replace(raw_src, '[^a-z0-9_]', '', 'g'), 40);
  IF clean_src = '' THEN clean_src := 'organic'; END IF;

  PERFORM public.get_or_create_player_profile(clean_uid, p_tg_id, p_tg_username, COALESCE(p_display_name, ''));

  IF clean_src LIKE 'pack\_%' OR clean_src LIKE 'pr\_%' OR clean_src LIKE 'bl\_%' THEN
    v_bid := CASE
      WHEN clean_src LIKE 'pack\_%' THEN substring(clean_src FROM 6)
      ELSE substring(clean_src FROM 4)
    END;
    SELECT
      COALESCE(NULLIF(b.broadcast_prefix, ''), NULLIF(u.seed_prefix, ''), NULLIF(b.seed_traffic_source, ''), NULLIF(u.traffic_source, ''), 'organic'),
      b.sender_uid,
      COALESCE(NULLIF(b.broadcast_prefix, ''), NULLIF(u.seed_prefix, '')),
      COALESCE(NULLIF(u.root_tracking_code, ''), NULLIF(u.seed_tracking_code, ''))
    INTO parent_src, ref_uid, parent_prefix, parent_root
    FROM public.barrels b
    LEFT JOIN public.users u ON u.uid = b.sender_uid
    WHERE b.short_id = v_bid
    LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  ELSIF clean_src LIKE 'ref\_%' THEN
    ref_uid := substring(clean_src FROM 5);
    SELECT
      COALESCE(NULLIF(u.seed_prefix, ''), NULLIF(u.traffic_source, ''), 'organic'),
      NULLIF(u.seed_prefix, ''),
      COALESCE(NULLIF(u.root_tracking_code, ''), NULLIF(u.seed_tracking_code, ''))
    INTO parent_src, parent_prefix, parent_root
    FROM public.users u WHERE lower(u.uid) = lower(ref_uid) LIMIT 1;
    clean_src := COALESCE(parent_src, 'organic');
  END IF;

  UPDATE public.users SET
    traffic_source = CASE WHEN COALESCE(traffic_source, '') IN ('', 'organic') THEN clean_src ELSE traffic_source END,
    seed_prefix = COALESCE(NULLIF(seed_prefix, ''), parent_prefix),
    root_tracking_code = COALESCE(NULLIF(root_tracking_code, ''), parent_root),
    referred_by_uid = COALESCE(referred_by_uid, ref_uid),
    updated_at = now()
  WHERE uid = clean_uid AND clean_uid <> COALESCE(ref_uid, '');

  RETURN jsonb_build_object(
    'ok', true,
    'uid', clean_uid,
    'traffic_source', clean_src,
    'seed_prefix', parent_prefix,
    'root_tracking_code', parent_root
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.record_traffic_source_rpc(text, text, text, text, text) TO anon, authenticated;

-- 6. Обновляем admin_get_dashboard: добавляем сводку broadcast_summary по каждому продюсеру/блогеру (bl_timur: 1..342)
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
  bcast_arr jsonb;
  stats_obj jsonb;
  v_seed_admins int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  SELECT last_value, is_called INTO seq_strikes, seq_called FROM public.premiere_strike_seq;
  IF NOT COALESCE(seq_called, false) THEN seq_strikes := 0; END IF;
  SELECT COUNT(*)::int INTO v_seed_admins FROM public.users WHERE COALESCE(is_seed_admin, false) AND NOT public.is_sandbox_uid(uid);

  stats_obj := row_to_json(gs)::jsonb || jsonb_build_object(
    'total_strikes', GREATEST(COALESCE(gs.total_strikes, 0), COALESCE(seq_strikes, 0)),
    'tickets_won', COALESCE(gs.tickets_won, 0),
    'tickets_burned', COALESCE(gs.tickets_burned, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0),
    'seed_admins_count', v_seed_admins
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
           COALESCE(traffic_source, 'organic') AS traffic_source,
           seed_tracking_code, root_tracking_code, updated_at
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
      AND NOT COALESCE(is_seed_admin, false)
    ORDER BY (friends_brought >= 2) DESC, premiere_points DESC, duels_won DESC, premiere_score DESC, updated_at DESC
    LIMIT 50
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO tags_arr
  FROM (
    SELECT COALESCE(NULLIF(seed_prefix, ''), NULLIF(traffic_source, ''), 'organic') AS tag,
           COUNT(*)::int AS players,
           COALESCE(SUM(packed_count), 0)::int AS barrels_packed,
           COALESCE(SUM(friends_brought), 0)::int AS friends_brought,
           COALESCE(SUM(tickets_gifted), 0)::int AS tickets_gifted
    FROM public.users
    WHERE NOT public.is_sandbox_uid(uid)
      AND NOT COALESCE(is_seed_admin, false)
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  ) t;

  -- Сводка по многоразовым именным бочкам продюсеров (pr_*) и блогеров (bl_*)
  SELECT COALESCE(jsonb_agg(row_to_json(bs)), '[]'::jsonb) INTO bcast_arr
  FROM (
    SELECT
      b.broadcast_prefix AS prefix,
      MAX(b.short_id) AS barrel_id,
      MAX(COALESCE(NULLIF(b.sender_name, ''), NULLIF(b.sender_username, ''), b.broadcast_prefix)) AS creator_name,
      MAX(COALESCE(b.visitor_seq, 0))::int AS max_seq,
      (SELECT COUNT(*)::int FROM public.users u WHERE u.seed_prefix = b.broadcast_prefix AND NOT COALESCE(u.is_seed_admin, false) AND NOT public.is_sandbox_uid(u.uid)) AS chain_players,
      (SELECT COALESCE(SUM(u.packed_count), 0)::int FROM public.users u WHERE u.seed_prefix = b.broadcast_prefix AND NOT COALESCE(u.is_seed_admin, false) AND NOT public.is_sandbox_uid(u.uid)) AS barrels_further,
      (SELECT COUNT(*)::int FROM public.ticket_orders o JOIN public.users u ON u.uid = o.receiver_uid WHERE u.seed_prefix = b.broadcast_prefix) AS ticket_orders
    FROM public.barrels b
    WHERE COALESCE(b.is_broadcast, false) AND NULLIF(b.broadcast_prefix, '') IS NOT NULL
    GROUP BY b.broadcast_prefix
    ORDER BY MAX(COALESCE(b.visitor_seq, 0)) DESC, b.broadcast_prefix ASC
    LIMIT 60
  ) bs;

  SELECT jsonb_build_object(
    'friends_seed', COUNT(*) FILTER (
      WHERE COALESCE(seed_prefix, traffic_source) LIKE 'pr\_%'
         OR traffic_source LIKE 'src\_prod%'
         OR traffic_source LIKE 'src\_prd%'
         OR traffic_source LIKE 'src\_friend%'
    ),
    'test_seed', COUNT(*) FILTER (WHERE traffic_source LIKE 'src\_test%'),
    'social_ads', COUNT(*) FILTER (WHERE traffic_source IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')),
    'bloggers_til', COUNT(*) FILTER (
      WHERE COALESCE(seed_prefix, traffic_source) LIKE 'bl\_%'
         OR (
           traffic_source LIKE 'src\_%'
           AND traffic_source NOT LIKE 'src\_prod%'
           AND traffic_source NOT LIKE 'src\_prd%'
           AND traffic_source NOT LIKE 'src\_friend%'
           AND traffic_source NOT LIKE 'src\_test%'
           AND traffic_source NOT IN ('src_insta','src_whatsapp','src_vk','src_tg_ads')
         )
    ),
    'referrals_viral', COUNT(*) FILTER (
      WHERE COALESCE(seed_prefix, '') = ''
        AND COALESCE(NULLIF(traffic_source,''),'organic') NOT LIKE 'src\_%'
        AND COALESCE(NULLIF(traffic_source,''),'organic') NOT LIKE 'pr\_%'
        AND COALESCE(NULLIF(traffic_source,''),'organic') NOT LIKE 'bl\_%'
    ),
    'seed_admins_count', v_seed_admins,
    'by_tag', tags_arr,
    'broadcast_summary', bcast_arr
  ) INTO traffic_obj
  FROM public.users
  WHERE NOT public.is_sandbox_uid(uid)
    AND NOT COALESCE(is_seed_admin, false);

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

-- 7. Мгновенный поиск игрока и всей его ветки по полному коду (bl_timur_17 / pr_sergey_4) в /admin/
CREATE OR REPLACE FUNCTION public.admin_lookup_tracking_code_rpc(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := lower(trim(COALESCE(p_code, '')));
  root_u public.users%ROWTYPE;
  tree_arr jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', true, 'found', false);
  END IF;

  SELECT * INTO root_u
  FROM public.users
  WHERE lower(COALESCE(seed_tracking_code, '')) = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'code', v_code);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(ch)), '[]'::jsonb)
  INTO tree_arr
  FROM (
    SELECT
      uid, tg_user_id, tg_username, display_name, current_level, premiere_points,
      packed_count, friends_brought, tickets_gifted,
      seed_prefix, seed_tracking_code, root_tracking_code, referred_by_uid, created_at
    FROM public.users
    WHERE uid <> root_u.uid
      AND NOT public.is_sandbox_uid(uid)
      AND (lower(COALESCE(root_tracking_code, '')) = v_code OR referred_by_uid = root_u.uid)
    ORDER BY created_at ASC
    LIMIT 200
  ) ch;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'code', v_code,
    'player', jsonb_build_object(
      'uid', root_u.uid,
      'tg_user_id', root_u.tg_user_id,
      'tg_username', root_u.tg_username,
      'display_name', root_u.display_name,
      'seed_prefix', root_u.seed_prefix,
      'seed_seq', root_u.seed_seq,
      'seed_tracking_code', root_u.seed_tracking_code,
      'root_tracking_code', root_u.root_tracking_code,
      'current_level', root_u.current_level,
      'premiere_points', root_u.premiere_points,
      'packed_count', root_u.packed_count,
      'friends_brought', root_u.friends_brought,
      'tickets_gifted', root_u.tickets_gifted,
      'is_seed_admin', COALESCE(root_u.is_seed_admin, false),
      'created_at', root_u.created_at
    ),
    'tree', tree_arr,
    'tree_count', jsonb_array_length(tree_arr)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_lookup_tracking_code_rpc(text) TO authenticated;

-- 8. Возвращаем is_broadcast / broadcast_prefix / visitor_seq в get_barrel_pack_rpc
CREATE OR REPLACE FUNCTION public.get_barrel_pack_rpc(p_short_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.barrels WHERE short_id = trim(COALESCE(p_short_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', b.short_id,
    'mode', b.mode,
    'message', b.message,
    'frame_style', b.frame_style,
    'sender_uid', COALESCE(b.sender_uid, ''),
    'sender_tg_id', COALESCE(b.sender_tg_id, ''),
    'sender_username', COALESCE(b.sender_username, ''),
    'sender_name', COALESCE(b.sender_name, ''),
    'photo_url', COALESCE(b.photo_url, ''),
    'voice_url', COALESCE(b.voice_url, ''),
    'target_index', b.target_index,
    'is_broadcast', COALESCE(b.is_broadcast, false),
    'broadcast_prefix', COALESCE(b.broadcast_prefix, ''),
    'visitor_seq', COALESCE(b.visitor_seq, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_barrel_pack_rpc(text) TO anon, authenticated;
