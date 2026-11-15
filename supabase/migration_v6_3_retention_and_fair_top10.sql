-- ============================================================================
-- БОЧКА: Упакуй друга — v6.3 Retention, Fair TOP-10 & Public Raffle Transparency
-- Внедрено по итогам 60-дневной OASIS-симуляции (300 агентов) и 12-воркерного QA
-- ============================================================================

-- 1. Ускорение Блица (кулдаун 18с -> 12с, суточный лимит 1500 -> 2000) + Мини-ивент дня
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
DECLARE
  u public.users%ROWTYPE;
  clean_lvl integer := GREATEST(1, LEAST(99, COALESCE(p_level, 1)));
  earned_pts integer := 0;
  next_lvl integer;
  blitz_today integer := 0;
  is_blitz boolean := (clean_lvl >= 8);
  cd_blocked boolean := false;
  dow integer := EXTRACT(DOW FROM CURRENT_DATE)::integer;
  event_code text := 'STEADY';
  time_bonus integer := 0;
  event_bonus integer := 0;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  blitz_today := CASE WHEN u.daily_blitz_date < CURRENT_DATE THEN 0 ELSE COALESCE(u.daily_blitz_points, 0) END;

  IF dow IN (0, 3) THEN
    event_code := 'DOUBLE_BLITZ';
  ELSIF dow IN (1, 4) THEN
    event_code := 'SPEED_SHIFT';
  ELSE
    event_code := 'IRON_STREAK';
  END IF;

  IF is_blitz AND u.last_blitz_at IS NOT NULL AND (now() - u.last_blitz_at) < interval '12 seconds' THEN
    cd_blocked := true;
    earned_pts := 0;
  ELSE
    time_bonus := ROUND(GREATEST(0, LEAST(20, COALESCE(p_time_left_sec, 0))) * CASE WHEN event_code = 'SPEED_SHIFT' THEN 2.5 ELSE 2.0 END)::integer;
    earned_pts := 50 + (LEAST(10, clean_lvl) * 10) + time_bonus + GREATEST(0, LEAST(60, COALESCE(p_bonus_points, 0)));

    IF event_code = 'DOUBLE_BLITZ' AND is_blitz THEN
      event_bonus := ROUND(earned_pts * 0.30)::integer;
    ELSIF event_code = 'IRON_STREAK' THEN
      event_bonus := 35;
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

-- 2. Справедливый ТОП-10: убран жёсткий гейт >=2 друзей, введён мягкий бонус +10% за каждого друга (до +50%)
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
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      row_number() OVER (
        ORDER BY
          ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer DESC,
          duels_won DESC,
          premiere_score DESC,
          updated_at ASC
      ) AS rank,
      uid,
      CASE
        WHEN length(trim(COALESCE(display_name, ''))) > 0 THEN left(trim(display_name), 26)
        WHEN tg_username IS NOT NULL AND length(tg_username) > 0 THEN '@' || left(tg_username, 22)
        ELSE 'Игрок #' || upper(right(uid, 4))
      END AS name,
      premiere_points,
      ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS effective_points,
      (LEAST(5, COALESCE(friends_brought, 0)) * 10) AS friend_bonus_pct,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed,
      (premiere_points > 0) AS qualified_top10
    FROM public.users
    WHERE premiere_points > 0 OR premiere_score > 0 OR friends_brought > 0
    ORDER BY
      ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer DESC,
      duels_won DESC,
      premiere_score DESC,
      updated_at ASC
    LIMIT 25
  ) t;

  SELECT COALESCE(MIN(sub.eff_pts), 0)
  INTO tenth_pts
  FROM (
    SELECT ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer AS eff_pts
    FROM public.users
    WHERE premiere_points > 0
    ORDER BY
      ROUND(premiere_points * (1.0 + LEAST(5, COALESCE(friends_brought, 0)) * 0.10))::integer DESC,
      duels_won DESC,
      premiere_score DESC
    LIMIT 10
  ) sub;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      my_bonus_pct := LEAST(5, COALESCE(me_row.friends_brought, 0)) * 10;
      my_effective := ROUND(me_row.premiere_points * (1.0 + my_bonus_pct / 100.0))::integer;
      SELECT COUNT(*) + 1
      INTO my_rank
      FROM public.users other
      WHERE ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer > my_effective
         OR (
           ROUND(other.premiere_points * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer = my_effective
           AND (
             other.duels_won > me_row.duels_won
             OR (other.duels_won = me_row.duels_won AND other.premiere_score > me_row.premiere_score)
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
      'qualified_top10', (me_row.premiere_points > 0),
      'in_top10', (my_rank >= 1 AND my_rank <= 10 AND me_row.premiere_points > 0),
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

-- 3. Прозрачный фонд призов (публичный read-only статус розыгрыша)
CREATE OR REPLACE FUNCTION public.get_public_raffle_transparency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
BEGIN
  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'total_players', COALESCE(gs.total_players, 0),
    'total_strikes', COALESCE(gs.total_strikes, 0),
    'daily_tickets_issued', COALESCE(gs.daily_tickets_issued, 0),
    'max_daily_tickets', COALESCE(gs.max_daily_tickets, 0),
    'premiere_winners_count', COALESCE(gs.premiere_winners_count, 0),
    'max_premiere_winners', COALESCE(gs.max_premiere_winners, 0),
    'is_paused', COALESCE(gs.is_paused, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_raffle_transparency() TO anon, authenticated;
