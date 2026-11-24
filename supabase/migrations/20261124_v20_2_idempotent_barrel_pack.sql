-- BAREL v20.2: Idempotent create_barrel_pack_rpc on short_id retries (eliminates HTTP 409 under weak mobile / 12s resilientFetch retries)

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
  p_seed_traffic_source text DEFAULT NULL::text,
  p_seed_target_handle text DEFAULT NULL::text,
  p_is_broadcast boolean DEFAULT false,
  p_broadcast_prefix text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_existing_sender text := NULL;
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
  )
  ON CONFLICT (short_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT sender_uid INTO v_existing_sender
    FROM public.barrels
    WHERE short_id = trim(p_short_id);

    IF v_uid IS NOT NULL AND v_existing_sender = v_uid THEN
      SELECT premiere_score, ui_stage, packed_count
      INTO v_score, v_ui_stage, v_packed
      FROM public.users
      WHERE uid = v_uid;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent_retry', true,
        'short_id', trim(p_short_id),
        'surge_triggered', false,
        'premiere_score', COALESCE(v_score, 72.00),
        'ui_stage', COALESCE(v_ui_stage, 3),
        'packed_count', COALESCE(v_packed, 1),
        'temu_surge_claimed', true,
        'is_broadcast', v_is_broadcast,
        'broadcast_prefix', v_b_prefix
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'short_id_taken');
  END IF;

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
$function$;

GRANT EXECUTE ON FUNCTION public.create_barrel_pack_rpc(text, text, text, text, text, text, text, text, text, text, integer, text, text, boolean, text) TO PUBLIC, anon, authenticated;
