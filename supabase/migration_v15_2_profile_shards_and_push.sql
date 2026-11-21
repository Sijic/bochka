-- ============================================================================
-- БОЧКА v15.2: Возврат ticket_shards + is_seed_admin + has_broadcast_barrel
-- из get_or_create_player_profile + фикс раннего открытия ui_stage=4 (Дуэлей)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(
  p_uid text,
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
  u public.users%ROWTYPE;
  inserted_count int := 0;
  v_has_social boolean := false;
  v_has_broadcast boolean := false;
  v_effective_stage smallint := 1;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, lives)
  VALUES (
    trim(p_uid),
    NULLIF(trim(COALESCE(p_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_tg_username, '')), ''),
    COALESCE(p_display_name, ''),
    3
  )
  ON CONFLICT (uid) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    PERFORM public.bump_daily_metric('players', 1);
  END IF;

  UPDATE public.users
  SET
    tg_user_id = COALESCE(NULLIF(trim(COALESCE(p_tg_id, '')), ''), tg_user_id),
    tg_username = COALESCE(NULLIF(trim(COALESCE(p_tg_username, '')), ''), tg_username),
    display_name = CASE WHEN length(trim(COALESCE(p_display_name, ''))) > 0 THEN trim(p_display_name) ELSE display_name END,
    daily_shares_count = CASE WHEN daily_shares_date < CURRENT_DATE THEN 0 ELSE daily_shares_count END,
    daily_shares_date = CURRENT_DATE,
    daily_social_mask = CASE WHEN daily_social_date < CURRENT_DATE THEN '' ELSE daily_social_mask END,
    daily_social_date = CURRENT_DATE,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  v_has_social := EXISTS (
    SELECT 1
    FROM public.social_connections sc
    WHERE sc.sender_uid = u.uid
       OR sc.receiver_uid = u.uid
       OR (
         u.tg_user_id IS NOT NULL
         AND (sc.sender_tg_id = u.tg_user_id OR sc.receiver_tg_id = u.tg_user_id)
       )
  );

  v_has_broadcast := EXISTS (
    SELECT 1
    FROM public.barrels b
    WHERE b.sender_uid = u.uid
      AND COALESCE(b.is_broadcast, false) = true
  );

  -- v15.2: Стадия 4 (Дуэли) открывается ТОЛЬКО после Ур. 5 (current_level >= 6 / 1500+ ⭐) или реального входа в дуэль!
  v_effective_stage := GREATEST(
    LEAST(COALESCE(u.ui_stage, 1), 3),
    CASE
      WHEN COALESCE(u.duels_played, 0) > 0
        OR COALESCE(u.current_level, 1) >= 6
        OR COALESCE(u.premiere_points, 0) >= 1500 THEN 4
      WHEN COALESCE(u.packed_count, 0) >= 1 OR COALESCE(u.temu_surge_claimed, false) THEN 3
      WHEN COALESCE(u.has_played_solo, false) OR COALESCE(u.current_level, 1) >= 2 THEN 2
      ELSE 1
    END
  );

  IF v_effective_stage <> COALESCE(u.ui_stage, 1) THEN
    UPDATE public.users
    SET ui_stage = v_effective_stage,
        updated_at = now()
    WHERE uid = u.uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_points', u.premiere_points,
    'current_level', u.current_level,
    'has_played_solo', u.has_played_solo,
    'tickets_gifted', u.tickets_gifted,
    'duels_won', u.duels_won,
    'duels_played', u.duels_played,
    'trailer_rewarded', u.trailer_rewarded,
    'kp_click_rewarded', u.kp_click_rewarded,
    'daily_social_mask', u.daily_social_mask,
    'premiere_won', u.premiere_won,
    'premiere_confirmed', u.premiere_confirmed,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'has_pending_ticket', u.has_pending_ticket,
    'pending_tickets_count', COALESCE(u.pending_tickets_count, CASE WHEN u.has_pending_ticket THEN 1 ELSE 0 END),
    'ticket_shards', LEAST(3, GREATEST(0, COALESCE(u.ticket_shards, 0))),
    'kp_verified', u.kp_verified,
    'kp_screenshot_url', COALESCE(u.kp_screenshot_url, ''),
    'packed_count', u.packed_count,
    'friends_brought', u.friends_brought,
    'daily_shares_count', u.daily_shares_count,
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', u.temu_surge_claimed,
    'has_social_connection', v_has_social,
    'is_seed_admin', COALESCE(u.is_seed_admin, false),
    'is_blogger_seed', COALESCE(u.is_blogger_seed, false),
    'seed_prefix', COALESCE(u.seed_prefix, ''),
    'has_broadcast_barrel', v_has_broadcast
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO anon, authenticated;
