-- ============================================================================
-- MIGRATION v8.0-core-game-loop:
-- 1. Разрешение image/jpeg (< 100 KB) в бакете barrel-media для 512x512 JPEG фото
-- 2. RPC начисления очков и жизней по воронке v8.0 (L1=150, L2=150+200, L3=300, L4=350, L5=400 -> 1550)
-- 3. Жесткая защита от повторной отправки обычной бочки тому же другу (social_connections)
-- 4. Список друзей из social_connections для выдачи билета на Ур.3 в 1 тап
-- 5. Банк Закрытой Премьеры в Дуэлях (мультиплеер + соло 3x очки + шанс билета)
-- ============================================================================

UPDATE storage.buckets
SET
  file_size_limit = 102400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/webp', 'image/png', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
WHERE id = 'barrel-media';

CREATE OR REPLACE FUNCTION public.record_v8_level_reward_rpc(
  p_uid text,
  p_level integer,
  p_points_delta integer DEFAULT 0,
  p_lives_delta integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_pts integer := greatest(0, least(1500, coalesce(p_points_delta, 0)));
  v_lives_d integer := greatest(-10, least(12, coalesce(p_lives_delta, 0)));
  v_lvl integer := greatest(1, least(20, coalesce(p_level, 1)));
  v_user public.users%ROWTYPE;
  v_ref_tg text := '';
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  INSERT INTO public.users (uid, lives, current_level, premiere_points)
  VALUES (v_uid, greatest(0, 1 + v_lives_d), v_lvl, v_pts)
  ON CONFLICT (uid) DO UPDATE
  SET
    premiere_points = public.users.premiere_points + v_pts,
    lives = greatest(0, least(30, public.users.lives + v_lives_d)),
    current_level = greatest(public.users.current_level, v_lvl),
    updated_at = now()
  RETURNING * INTO v_user;

  IF v_user.referred_by_uid IS NOT NULL AND v_user.referred_by_uid <> '' THEN
    SELECT coalesce(tg_user_id, '') INTO v_ref_tg
    FROM public.users
    WHERE uid = v_user.referred_by_uid
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'current_level', v_user.current_level,
    'premiere_points', v_user.premiere_points,
    'lives', v_user.lives,
    'referrer_uid', coalesce(v_user.referred_by_uid, ''),
    'referrer_tg_id', coalesce(v_ref_tg, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_record_friend_barrel_rpc(
  p_sender_uid text,
  p_receiver_uid text,
  p_sender_tg_id text DEFAULT NULL,
  p_receiver_tg_id text DEFAULT NULL,
  p_receiver_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s text := trim(coalesce(p_sender_uid, ''));
  v_r text := trim(coalesce(p_receiver_uid, ''));
  v_exists boolean := false;
BEGIN
  IF v_s = '' OR v_r = '' OR v_s = v_r THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'self', v_s = v_r);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.social_connections
    WHERE sender_uid = v_s AND receiver_uid = v_r AND opened_barrel = true
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'reason', 'already_connected',
      'message', 'Этот друг уже в деле! Ему теперь можно отправить только выигранный билет, а скример кинь новому другу.'
    );
  END IF;

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, opened_barrel, updated_at
  )
  VALUES (
    v_s, v_r, nullif(trim(coalesce(p_sender_tg_id, '')), ''),
    nullif(trim(coalesce(p_receiver_tg_id, '')), ''),
    left(trim(coalesce(p_receiver_name, '')), 60),
    true, now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE
  SET
    opened_barrel = true,
    receiver_tg_id = coalesce(EXCLUDED.receiver_tg_id, public.social_connections.receiver_tg_id),
    receiver_name = CASE WHEN length(EXCLUDED.receiver_name) > 0 THEN EXCLUDED.receiver_name ELSE public.social_connections.receiver_name END,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_game_friends_rpc(
  p_sender_uid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s text := trim(coalesce(p_sender_uid, ''));
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_s = '' THEN
    RETURN jsonb_build_object('ok', true, 'friends', v_rows);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'receiver_uid', sc.receiver_uid,
    'receiver_tg_id', coalesce(sc.receiver_tg_id, u.tg_user_id, ''),
    'receiver_name', coalesce(nullif(sc.receiver_name, ''), nullif(u.display_name, ''), nullif(u.tg_username, ''), 'Друг из цеха'),
    'receiver_username', coalesce(sc.receiver_username, u.tg_username, ''),
    'updated_at', sc.updated_at
  ) ORDER BY sc.updated_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.social_connections sc
  LEFT JOIN public.users u ON u.uid = sc.receiver_uid
  WHERE sc.sender_uid = v_s
  LIMIT 25;

  RETURN jsonb_build_object('ok', true, 'friends', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.award_duel_premiere_bank_rpc(
  p_uid text,
  p_points_bonus integer DEFAULT 450,
  p_solo boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_pts integer := greatest(0, least(1800, coalesce(p_points_bonus, 450)));
  v_gs public.global_stats%ROWTYPE;
  v_drop_ticket boolean := false;
  v_user public.users%ROWTYPE;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO v_gs FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF FOUND AND NOT coalesce(v_gs.is_paused, false)
     AND coalesce(v_gs.daily_tickets_issued, 0) < coalesce(v_gs.max_daily_tickets, 5)
     AND random() < (CASE WHEN p_solo THEN 0.12 ELSE 0.22 END)
  THEN
    v_drop_ticket := true;
    UPDATE public.global_stats
    SET
      daily_tickets_issued = daily_tickets_issued + 1,
      tickets_won = tickets_won + 1,
      updated_at = now()
    WHERE id = 1;
  END IF;

  UPDATE public.users
  SET
    premiere_points = premiere_points + v_pts,
    duels_played = duels_played + 1,
    duels_won = duels_won + 1,
    has_pending_ticket = CASE WHEN v_drop_ticket THEN true ELSE has_pending_ticket END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'premiere_points', v_user.premiere_points,
    'lives', v_user.lives,
    'duels_won', v_user.duels_won,
    'ticket_dropped', v_drop_ticket
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_v8_level_reward_rpc(text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_friend_barrel_rpc(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_game_friends_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_duel_premiere_bank_rpc(text, integer, boolean) TO anon, authenticated;
