-- ============================================================================
-- БОЧКА: Упакуй друга — v6.5 Pre-Release Polish
-- 1. Единая RPC complete_workshop_level_rpc (3-дневная ротация 5 мини-ивентов,
--    кулдаун Блица 12с с cd_rem, кап 280 ⭐/раунд и 2000 ⭐/день) + обёртка record_solo_level_win
-- 2. Двухступенчатая реферальная награда в get_premiere_leaderboard_rpc
--    (1 друг -> +150 ⭐ +10%; 2+ друзей -> допуск в финал ТОП-10 Премьеры)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_workshop_level_rpc(
  p_uid text,
  p_level integer,
  p_time_left_sec numeric DEFAULT 0,
  p_bonus_points integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  clean_lvl integer := GREATEST(1, LEAST(99, COALESCE(p_level, 1)));
  earned_pts integer := 0;
  next_lvl integer;
  blitz_today integer := 0;
  is_blitz boolean := (clean_lvl >= 8);
  cd_blocked boolean := false;
  cd_rem integer := 0;
  rot_idx integer := MOD((FLOOR(EXTRACT(EPOCH FROM CURRENT_DATE) / 86400)::integer / 3), 5);
  event_code text := 'DOUBLE_BLITZ';
  time_bonus integer := 0;
  event_bonus integer := 0;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  blitz_today := CASE WHEN u.daily_blitz_date < CURRENT_DATE THEN 0 ELSE COALESCE(u.daily_blitz_points, 0) END;

  IF rot_idx = 0 THEN
    event_code := 'DOUBLE_BLITZ';
  ELSIF rot_idx = 1 THEN
    event_code := 'SPEED_SHIFT';
  ELSIF rot_idx = 2 THEN
    event_code := 'IRON_STREAK';
  ELSIF rot_idx = 3 THEN
    event_code := 'SECRET_1997';
  ELSE
    event_code := 'PREMIERE_SURGE';
  END IF;

  IF is_blitz AND u.last_blitz_at IS NOT NULL AND (now() - u.last_blitz_at) < interval '12 seconds' THEN
    cd_blocked := true;
    cd_rem := GREATEST(1, LEAST(12, CEIL(12.0 - EXTRACT(EPOCH FROM (now() - u.last_blitz_at)))::integer));
    earned_pts := 0;
  ELSE
    time_bonus := ROUND(GREATEST(0, LEAST(20, COALESCE(p_time_left_sec, 0))) * CASE WHEN event_code = 'SPEED_SHIFT' THEN 2.5 ELSE 2.0 END)::integer;
    earned_pts := 50 + (LEAST(10, clean_lvl) * 10) + time_bonus + GREATEST(0, LEAST(60, COALESCE(p_bonus_points, 0)));

    IF event_code = 'DOUBLE_BLITZ' AND is_blitz THEN
      event_bonus := ROUND(earned_pts * 0.30)::integer;
    ELSIF event_code = 'IRON_STREAK' THEN
      event_bonus := 35;
    ELSIF event_code = 'SECRET_1997' AND clean_lvl >= 5 THEN
      event_bonus := 40;
    ELSIF event_code = 'PREMIERE_SURGE' THEN
      event_bonus := ROUND(earned_pts * 0.25)::integer;
    END IF;

    earned_pts := LEAST(280, earned_pts + event_bonus);

    IF is_blitz THEN
      earned_pts := GREATEST(0, LEAST(earned_pts, 2000 - blitz_today));
      blitz_today := blitz_today + earned_pts;
    END IF;
  END IF;

  next_lvl := GREATEST(u.current_level, clean_lvl + 1);

  UPDATE public.users
  SET
    has_played_solo = true,
    current_level = next_lvl,
    premiere_points = premiere_points + earned_pts,
    daily_blitz_points = blitz_today,
    daily_blitz_date = CURRENT_DATE,
    last_blitz_at = CASE WHEN is_blitz AND NOT cd_blocked THEN now() ELSE last_blitz_at END,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'earned_points', earned_pts,
    'cooldown_blocked', cd_blocked,
    'cooldown_remaining_sec', cd_rem,
    'cooldown_seconds', 12,
    'daily_blitz_cap', 2000,
    'daily_event_code', event_code,
    'event_bonus', event_bonus,
    'daily_blitz_points', blitz_today,
    'current_level', u.current_level,
    'premiere_points', u.premiere_points,
    'lives', u.lives
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_solo_level_win(
  p_uid text,
  p_level integer,
  p_time_left_sec numeric DEFAULT 0,
  p_bonus_points integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.complete_workshop_level_rpc(p_uid, p_level, p_time_left_sec, p_bonus_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_premiere_leaderboard_rpc(p_uid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leaders_arr jsonb;
  me_row public.users%ROWTYPE;
  my_rank bigint := 0;
  tenth_pts integer := 0;
  my_effective integer := 0;
  my_bonus_pct integer := 0;
  my_qualified boolean := false;
  my_tier integer := 0;
BEGIN
  WITH scored AS (
    SELECT
      uid,
      CASE
        WHEN length(trim(COALESCE(display_name, ''))) > 0 THEN left(trim(display_name), 26)
        WHEN tg_username IS NOT NULL AND length(tg_username) > 0 THEN '@' || left(tg_username, 22)
        ELSE 'Игрок #' || upper(right(uid, 4))
      END AS name,
      premiere_points,
      (CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS effective_points,
      (LEAST(5, COALESCE(friends_brought, 0)) * 10) AS friend_bonus_pct,
      CASE
        WHEN COALESCE(friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(friends_brought, 0) = 1 THEN 1
        ELSE 0
      END AS referral_tier,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed,
      updated_at,
      (COALESCE(friends_brought, 0) >= 2 AND premiere_points > 0) AS qualified_top10
    FROM public.users
    WHERE premiere_points > 0 OR premiere_score > 0 OR friends_brought > 0
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
      ) AS rank,
      uid,
      name,
      premiere_points,
      effective_points,
      friend_bonus_pct,
      referral_tier,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed,
      qualified_top10
    FROM scored
    ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
    LIMIT 25
  )
  SELECT COALESCE(jsonb_agg(row_to_json(ranked)), '[]'::jsonb)
  INTO leaders_arr
  FROM ranked;

  SELECT COALESCE(MIN(sub.eff_pts), 0)
  INTO tenth_pts
  FROM (
    SELECT
      (CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS eff_pts
    FROM public.users
    WHERE premiere_points > 0
    ORDER BY
      (COALESCE(friends_brought, 0) >= 2 AND premiere_points > 0) DESC,
      ((CASE WHEN COALESCE(friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer) DESC,
      duels_won DESC,
      premiere_score DESC
    LIMIT 10
  ) sub;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      my_bonus_pct := LEAST(5, COALESCE(me_row.friends_brought, 0)) * 10;
      my_effective := (CASE WHEN COALESCE(me_row.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(COALESCE(me_row.premiere_points, 0) * (1.0 + my_bonus_pct / 100.0))::integer;
      my_qualified := (COALESCE(me_row.friends_brought, 0) >= 2 AND COALESCE(me_row.premiere_points, 0) > 0);
      my_tier := CASE
        WHEN COALESCE(me_row.friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(me_row.friends_brought, 0) = 1 THEN 1
        ELSE 0
      END;

      SELECT COUNT(*) + 1
      INTO my_rank
      FROM public.users other
      WHERE
        (other.premiere_points > 0 OR other.premiere_score > 0 OR other.friends_brought > 0)
        AND (
          ((COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) AND NOT my_qualified)
          OR (
            (COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) = my_qualified
            AND (
              ((CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                + ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer) > my_effective
              OR (
                ((CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                  + ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer) = my_effective
                AND (
                  other.duels_won > me_row.duels_won
                  OR (other.duels_won = me_row.duels_won AND other.premiere_score > me_row.premiere_score)
                )
              )
            )
          )
        );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leaders', leaders_arr,
    'tenth_points', tenth_pts,
    'me', CASE WHEN me_row.uid IS NOT NULL THEN jsonb_build_object(
      'uid', me_row.uid,
      'rank', my_rank,
      'qualified_top10', my_qualified,
      'referral_tier', my_tier,
      'in_top10', (my_rank >= 1 AND my_rank <= 10 AND my_qualified),
      'premiere_points', me_row.premiere_points,
      'effective_points', my_effective,
      'friend_bonus_pct', my_bonus_pct,
      'premiere_score', me_row.premiere_score,
      'current_level', me_row.current_level,
      'friends_brought', me_row.friends_brought,
      'tickets_gifted', me_row.tickets_gifted,
      'duels_won', me_row.duels_won,
      'points_to_top10', GREATEST(0, tenth_pts - my_effective + CASE WHEN my_rank > 10 THEN 10 ELSE 0 END)
    ) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_workshop_level_rpc(text, integer, numeric, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_solo_level_win(text, integer, numeric, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_premiere_leaderboard_rpc(text) TO anon, authenticated;
