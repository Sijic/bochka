-- v20.4: 5 000 ⭐ Superprize League, 12-level Golden Ticket shards (3 000 ⭐ x 12),
-- composite leaderboard rating (points + level + chips + referrals + duels + wins + golden shards),
-- and strict decrease-only duel lives persistence + round tracking.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS golden_ticket_shards integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS golden_levels_claimed integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS superprize_unlocked_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(
  p_uid text,
  p_tg_id text DEFAULT NULL::text,
  p_tg_username text DEFAULT NULL::text,
  p_display_name text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u public.users%ROWTYPE;
  inserted_count int := 0;
  v_has_social boolean := false;
  v_friends_count int := 0;
  v_has_broadcast boolean := false;
  v_effective_stage smallint := 1;
  v_trophies_count int := 0;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
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
    daily_shares_count = CASE WHEN daily_shares_date < msk_date THEN 0 ELSE daily_shares_count END,
    daily_shares_date = msk_date,
    daily_share_points = CASE WHEN daily_share_points_date < msk_date THEN 0 ELSE COALESCE(daily_share_points, 0) END,
    daily_share_points_date = msk_date,
    daily_social_mask = CASE WHEN daily_social_date < msk_date THEN '' ELSE daily_social_mask END,
    daily_social_date = msk_date,
    superprize_unlocked_at = CASE
      WHEN superprize_unlocked_at IS NULL AND COALESCE(premiere_points, 0) >= 5000 THEN now()
      ELSE superprize_unlocked_at
    END,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  SELECT COUNT(*)::integer
  INTO v_trophies_count
  FROM public.user_trophies ut
  WHERE ut.owner_uid = u.uid;

  SELECT COUNT(DISTINCT CASE WHEN sc.sender_uid = u.uid THEN sc.receiver_uid ELSE sc.sender_uid END)::integer
  INTO v_friends_count
  FROM public.social_connections sc
  WHERE (
      sc.sender_uid = u.uid
      OR sc.receiver_uid = u.uid
      OR (
        u.tg_user_id IS NOT NULL
        AND (sc.sender_tg_id = u.tg_user_id OR sc.receiver_tg_id = u.tg_user_id)
      )
    )
    AND sc.sender_uid <> sc.receiver_uid
    AND NOT public.is_sandbox_uid(CASE WHEN sc.sender_uid = u.uid THEN sc.receiver_uid ELSE sc.sender_uid END);

  v_friends_count := GREATEST(
    COALESCE(u.friends_brought, 0),
    COALESCE(v_friends_count, 0),
    CASE WHEN u.referred_by_uid IS NOT NULL AND u.referred_by_uid <> '' AND u.referred_by_uid <> u.uid THEN 1 ELSE 0 END
  );

  v_has_social := v_friends_count > 0;

  v_has_broadcast := EXISTS (
    SELECT 1
    FROM public.barrels b
    WHERE b.sender_uid = u.uid
      AND COALESCE(b.is_broadcast, false) = true
  );

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
    'trophies_count', COALESCE(v_trophies_count, 0),
    'golden_ticket_shards', LEAST(12, GREATEST(0, COALESCE(u.golden_ticket_shards, 0))),
    'golden_levels_claimed', COALESCE(to_jsonb(u.golden_levels_claimed), '[]'::jsonb),
    'superprize_unlocked_at', u.superprize_unlocked_at,
    'trailer_rewarded', u.trailer_rewarded,
    'trailer_watched_full', COALESCE(u.trailer_watched_full, false),
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
    'friends_count', v_friends_count,
    'daily_shares_count', u.daily_shares_count,
    'daily_share_points', COALESCE(u.daily_share_points, 0),
    'avatar_url', COALESCE(u.avatar_url, ''),
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won,
    'last_special_knock_at', u.last_special_knock_at,
    'ui_stage', v_effective_stage,
    'temu_surge_claimed', u.temu_surge_claimed,
    'has_social_connection', v_has_social,
    'is_seed_admin', COALESCE(u.is_seed_admin, false),
    'is_blogger_seed', COALESCE(u.is_blogger_seed, false),
    'seed_prefix', COALESCE(u.seed_prefix, ''),
    'has_broadcast_barrel', v_has_broadcast,
    'tg_write_access', COALESCE(u.tg_write_access, false) OR (u.tg_chat_id IS NOT NULL)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_golden_ticket_shard_rpc(
  p_uid text,
  p_super_level integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_lvl integer := coalesce(p_super_level, 1);
  v_user public.users%ROWTYPE;
  v_max_lvl integer := 0;
  v_claimed integer[];
  v_shards integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;
  IF v_lvl < 1 OR v_lvl > 12 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_super_level');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE uid = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF COALESCE(v_user.premiere_points, 0) < 5000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'superprize_locked');
  END IF;

  v_max_lvl := LEAST(12, FLOOR((COALESCE(v_user.premiere_points, 0) - 5000) / 3000.0)::integer + 1);
  IF v_lvl > v_max_lvl THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'level_locked', 'max_level', v_max_lvl);
  END IF;

  v_claimed := COALESCE(v_user.golden_levels_claimed, '{}'::integer[]);
  IF v_lvl = ANY(v_claimed) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'already_claimed', true,
      'level', v_lvl,
      'golden_ticket_shards', LEAST(12, GREATEST(0, COALESCE(v_user.golden_ticket_shards, cardinality(v_claimed)))),
      'golden_levels_claimed', to_jsonb(v_claimed),
      'completed_golden_ticket', (LEAST(12, cardinality(v_claimed)) >= 12)
    );
  END IF;

  v_claimed := array_append(v_claimed, v_lvl);
  v_shards := LEAST(12, cardinality(v_claimed));

  UPDATE public.users
  SET
    golden_levels_claimed = v_claimed,
    golden_ticket_shards = v_shards,
    superprize_unlocked_at = COALESCE(superprize_unlocked_at, now()),
    current_level = GREATEST(COALESCE(current_level, 1), v_lvl + 1),
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'already_claimed', false,
    'level', v_lvl,
    'golden_ticket_shards', v_shards,
    'golden_levels_claimed', to_jsonb(v_claimed),
    'completed_golden_ticket', (v_shards >= 12)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_duel_lives_rpc(
  p_uid text,
  p_lives integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_target integer := GREATEST(0, LEAST(30, coalesce(p_lives, 0)));
  v_new_lives integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  UPDATE public.users
  SET
    lives = LEAST(COALESCE(lives, 3), v_target),
    updated_at = now()
  WHERE uid = v_uid
  RETURNING lives INTO v_new_lives;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'lives', v_new_lives);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_duel_round_rpc(
  p_uid text,
  p_won boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_won boolean := coalesce(p_won, false);
  v_played integer := 0;
  v_wins integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  UPDATE public.users
  SET
    duels_played = COALESCE(duels_played, 0) + 1,
    duels_won = COALESCE(duels_won, 0) + (CASE WHEN v_won THEN 1 ELSE 0 END),
    updated_at = now()
  WHERE uid = v_uid
  RETURNING duels_played, duels_won INTO v_played, v_wins;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'duels_played', v_played, 'duels_won', v_wins);
END;
$function$;

DROP FUNCTION IF EXISTS public.award_duel_premiere_bank_rpc(text, integer, boolean);

CREATE OR REPLACE FUNCTION public.award_duel_premiere_bank_rpc(
  p_uid text,
  p_points_bonus integer DEFAULT 450,
  p_solo boolean DEFAULT false,
  p_count_win boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_pts integer := greatest(0, least(1800, coalesce(p_points_bonus, 450)));
  v_gs public.global_stats%ROWTYPE;
  v_drop_ticket boolean := false;
  v_user public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO v_gs FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF FOUND THEN
    IF v_gs.daily_reset_date < msk_date THEN
      v_gs.daily_tickets_issued := 0;
      v_gs.daily_reset_date := msk_date;
    END IF;

    IF NOT coalesce(v_gs.is_paused, false)
       AND now() < timestamptz '2026-12-16 00:00:00+05'
       AND coalesce(v_gs.tickets_won, 0) < coalesce(v_gs.max_total_tickets, 150)
       AND coalesce(v_gs.daily_tickets_issued, 0) < coalesce(v_gs.max_daily_tickets, 5)
       AND random() < (CASE WHEN p_solo THEN 0.12 ELSE 0.22 END)
    THEN
      v_drop_ticket := true;
      UPDATE public.global_stats
      SET
        daily_tickets_issued = v_gs.daily_tickets_issued + 1,
        daily_reset_date = v_gs.daily_reset_date,
        tickets_won = coalesce(v_gs.tickets_won, 0) + 1,
        updated_at = now()
      WHERE id = 1;
    END IF;
  END IF;

  UPDATE public.users
  SET
    premiere_points = premiere_points + v_pts,
    duels_played = duels_played + (CASE WHEN coalesce(p_count_win, false) THEN 1 ELSE 0 END),
    duels_won = duels_won + (CASE WHEN coalesce(p_count_win, false) THEN 1 ELSE 0 END),
    superprize_unlocked_at = COALESCE(
      superprize_unlocked_at,
      CASE WHEN premiere_points + v_pts >= 5000 THEN now() ELSE NULL END
    ),
    current_level = GREATEST(
      COALESCE(current_level, 1),
      CASE
        WHEN premiere_points + v_pts >= 5000
          THEN 2 + LEAST(11, FLOOR(((premiere_points + v_pts) - 5000) / 3000.0)::integer)
        ELSE COALESCE(current_level, 1)
      END
    ),
    pending_tickets_count = coalesce(pending_tickets_count, 0) + (CASE WHEN v_drop_ticket THEN 1 ELSE 0 END),
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
    'current_level', v_user.current_level,
    'lives', v_user.lives,
    'duels_won', v_user.duels_won,
    'duels_played', v_user.duels_played,
    'pending_tickets_count', coalesce(v_user.pending_tickets_count, 0),
    'ticket_dropped', v_drop_ticket
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_premiere_leaderboard_rpc(p_uid text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  leaders_arr jsonb;
  me_row public.users%ROWTYPE;
  my_chips integer := 0;
  my_rank bigint := 0;
  tenth_pts integer := 0;
  my_effective integer := 0;
  my_bonus_pct integer := 0;
  my_qualified boolean := false;
  my_tier integer := 0;
  my_eff_level integer := 1;
  my_sp_level integer := 0;
BEGIN
  WITH trophy_counts AS (
    SELECT owner_uid, COUNT(*)::integer AS chips_count
    FROM public.user_trophies
    GROUP BY owner_uid
  ),
  scored AS (
    SELECT
      u.uid,
      CASE
        WHEN length(trim(COALESCE(u.display_name, ''))) > 0 THEN left(trim(u.display_name), 26)
        WHEN u.tg_username IS NOT NULL AND length(u.tg_username) > 0 THEN '@' || left(u.tg_username, 22)
        ELSE 'Игрок #' || upper(right(u.uid, 4))
      END AS name,
      u.premiere_points,
      CASE
        WHEN COALESCE(u.premiere_points, 0) >= 5000
          THEN LEAST(12, FLOOR((u.premiere_points - 5000) / 3000.0)::integer + 1)
        ELSE 0
      END AS superprize_level,
      GREATEST(
        COALESCE(u.current_level, 1),
        CASE
          WHEN COALESCE(u.premiere_points, 0) >= 5000
            THEN 2 + LEAST(11, FLOOR((u.premiere_points - 5000) / 3000.0)::integer)
          ELSE 1
        END
      ) AS effective_level,
      COALESCE(tc.chips_count, 0) AS chips_count,
      LEAST(12, GREATEST(0, COALESCE(u.golden_ticket_shards, 0))) AS golden_ticket_shards,
      COALESCE(u.duels_played, 0) AS duels_played,
      (
        (CASE WHEN COALESCE(u.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(COALESCE(u.premiere_points, 0) * (1.0 + LEAST(5, COALESCE(u.friends_brought, 0)) * 0.10))::integer
        + (GREATEST(
            COALESCE(u.current_level, 1),
            CASE
              WHEN COALESCE(u.premiere_points, 0) >= 5000
                THEN 2 + LEAST(11, FLOOR((u.premiere_points - 5000) / 3000.0)::integer)
              ELSE 1
            END
          ) * 250)
        + (COALESCE(tc.chips_count, 0) * 200)
        + (LEAST(12, GREATEST(0, COALESCE(u.golden_ticket_shards, 0))) * 500)
        + (COALESCE(u.friends_brought, 0) * 600)
        + (COALESCE(u.duels_played, 0) * 100)
        + (COALESCE(u.duels_won, 0) * 200)
      ) AS effective_points,
      (LEAST(5, COALESCE(u.friends_brought, 0)) * 10) AS friend_bonus_pct,
      CASE
        WHEN COALESCE(u.friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(u.friends_brought, 0) = 1 THEN 1
        ELSE 0
      END AS referral_tier,
      u.premiere_score,
      GREATEST(
        COALESCE(u.current_level, 1),
        CASE
          WHEN COALESCE(u.premiere_points, 0) >= 5000
            THEN 2 + LEAST(11, FLOOR((u.premiere_points - 5000) / 3000.0)::integer)
          ELSE 1
        END
      ) AS current_level,
      u.friends_brought,
      u.tickets_gifted,
      u.duels_won,
      u.premiere_confirmed,
      u.updated_at,
      (COALESCE(u.friends_brought, 0) >= 2 AND COALESCE(u.premiere_points, 0) > 0) AS qualified_top10
    FROM public.users u
    LEFT JOIN trophy_counts tc ON tc.owner_uid = u.uid
    WHERE NOT COALESCE(u.is_seed_admin, false)
      AND NOT public.is_sandbox_uid(u.uid)
      AND (u.premiere_points > 0 OR u.premiere_score > 0 OR u.friends_brought > 0 OR u.duels_played > 0)
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
      ) AS rank,
      uid, name, premiere_points, effective_points, effective_points AS rating_score,
      friend_bonus_pct, referral_tier, premiere_score, current_level, effective_level,
      superprize_level, chips_count, golden_ticket_shards, friends_brought, tickets_gifted,
      duels_played, duels_won, premiere_confirmed, qualified_top10
    FROM scored
    ORDER BY qualified_top10 DESC, effective_points DESC, duels_won DESC, premiere_score DESC, updated_at ASC
    LIMIT 25
  )
  SELECT COALESCE(jsonb_agg(row_to_json(ranked)), '[]'::jsonb)
  INTO leaders_arr
  FROM ranked;

  WITH trophy_counts AS (
    SELECT owner_uid, COUNT(*)::integer AS chips_count
    FROM public.user_trophies
    GROUP BY owner_uid
  ),
  scored10 AS (
    SELECT
      (COALESCE(u.friends_brought, 0) >= 2 AND COALESCE(u.premiere_points, 0) > 0) AS qual,
      u.duels_won,
      u.premiere_score,
      (
        (CASE WHEN COALESCE(u.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(COALESCE(u.premiere_points, 0) * (1.0 + LEAST(5, COALESCE(u.friends_brought, 0)) * 0.10))::integer
        + (GREATEST(
            COALESCE(u.current_level, 1),
            CASE
              WHEN COALESCE(u.premiere_points, 0) >= 5000
                THEN 2 + LEAST(11, FLOOR((u.premiere_points - 5000) / 3000.0)::integer)
              ELSE 1
            END
          ) * 250)
        + (COALESCE(tc.chips_count, 0) * 200)
        + (LEAST(12, GREATEST(0, COALESCE(u.golden_ticket_shards, 0))) * 500)
        + (COALESCE(u.friends_brought, 0) * 600)
        + (COALESCE(u.duels_played, 0) * 100)
        + (COALESCE(u.duels_won, 0) * 200)
      ) AS eff_pts
    FROM public.users u
    LEFT JOIN trophy_counts tc ON tc.owner_uid = u.uid
    WHERE NOT COALESCE(u.is_seed_admin, false)
      AND NOT public.is_sandbox_uid(u.uid)
      AND COALESCE(u.premiere_points, 0) > 0
    ORDER BY qual DESC, eff_pts DESC, u.duels_won DESC, u.premiere_score DESC
    LIMIT 10
  )
  SELECT COALESCE(MIN(eff_pts), 0) INTO tenth_pts FROM scored10;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      SELECT COUNT(*)::integer INTO my_chips FROM public.user_trophies WHERE owner_uid = me_row.uid;
      my_bonus_pct := LEAST(5, COALESCE(me_row.friends_brought, 0)) * 10;
      my_sp_level := CASE
        WHEN COALESCE(me_row.premiere_points, 0) >= 5000
          THEN LEAST(12, FLOOR((me_row.premiere_points - 5000) / 3000.0)::integer + 1)
        ELSE 0
      END;
      my_eff_level := GREATEST(
        COALESCE(me_row.current_level, 1),
        CASE WHEN my_sp_level > 0 THEN 1 + my_sp_level ELSE 1 END
      );
      my_effective :=
        (CASE WHEN COALESCE(me_row.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
        + ROUND(COALESCE(me_row.premiere_points, 0) * (1.0 + my_bonus_pct / 100.0))::integer
        + (my_eff_level * 250)
        + (COALESCE(my_chips, 0) * 200)
        + (LEAST(12, GREATEST(0, COALESCE(me_row.golden_ticket_shards, 0))) * 500)
        + (COALESCE(me_row.friends_brought, 0) * 600)
        + (COALESCE(me_row.duels_played, 0) * 100)
        + (COALESCE(me_row.duels_won, 0) * 200);
      my_qualified := (NOT COALESCE(me_row.is_seed_admin, false))
        AND (COALESCE(me_row.friends_brought, 0) >= 2 AND COALESCE(me_row.premiere_points, 0) > 0);
      my_tier := CASE
        WHEN COALESCE(me_row.friends_brought, 0) >= 2 THEN 2
        WHEN COALESCE(me_row.friends_brought, 0) = 1 THEN 1
        ELSE 0
      END;

      IF NOT COALESCE(me_row.is_seed_admin, false) THEN
        WITH trophy_counts AS (
          SELECT owner_uid, COUNT(*)::integer AS chips_count
          FROM public.user_trophies
          GROUP BY owner_uid
        )
        SELECT COUNT(*) + 1
        INTO my_rank
        FROM public.users other
        LEFT JOIN trophy_counts tc ON tc.owner_uid = other.uid
        WHERE NOT COALESCE(other.is_seed_admin, false)
          AND NOT public.is_sandbox_uid(other.uid)
          AND (other.premiere_points > 0 OR other.premiere_score > 0 OR other.friends_brought > 0 OR other.duels_played > 0)
          AND (
            ((COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) AND NOT my_qualified)
            OR (
              (COALESCE(other.friends_brought, 0) >= 2 AND other.premiere_points > 0) = my_qualified
              AND (
                (
                  (CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                  + ROUND(COALESCE(other.premiere_points, 0) * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer
                  + (GREATEST(
                      COALESCE(other.current_level, 1),
                      CASE
                        WHEN COALESCE(other.premiere_points, 0) >= 5000
                          THEN 2 + LEAST(11, FLOOR((other.premiere_points - 5000) / 3000.0)::integer)
                        ELSE 1
                      END
                    ) * 250)
                  + (COALESCE(tc.chips_count, 0) * 200)
                  + (LEAST(12, GREATEST(0, COALESCE(other.golden_ticket_shards, 0))) * 500)
                  + (COALESCE(other.friends_brought, 0) * 600)
                  + (COALESCE(other.duels_played, 0) * 100)
                  + (COALESCE(other.duels_won, 0) * 200)
                ) > my_effective
                OR (
                  (
                    (CASE WHEN COALESCE(other.friends_brought, 0) >= 1 THEN 150 ELSE 0 END)
                    + ROUND(COALESCE(other.premiere_points, 0) * (1.0 + LEAST(5, COALESCE(other.friends_brought, 0)) * 0.10))::integer
                    + (GREATEST(
                        COALESCE(other.current_level, 1),
                        CASE
                          WHEN COALESCE(other.premiere_points, 0) >= 5000
                            THEN 2 + LEAST(11, FLOOR((other.premiere_points - 5000) / 3000.0)::integer)
                          ELSE 1
                        END
                      ) * 250)
                    + (COALESCE(tc.chips_count, 0) * 200)
                    + (LEAST(12, GREATEST(0, COALESCE(other.golden_ticket_shards, 0))) * 500)
                    + (COALESCE(other.friends_brought, 0) * 600)
                    + (COALESCE(other.duels_played, 0) * 100)
                    + (COALESCE(other.duels_won, 0) * 200)
                  ) = my_effective
                  AND (
                    other.duels_won > me_row.duels_won
                    OR (other.duels_won = me_row.duels_won AND other.premiere_score > me_row.premiere_score)
                  )
                )
              )
            )
          );
      ELSE
        my_rank := 0;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leaders', leaders_arr,
    'tenth_points', tenth_pts,
    'me', CASE WHEN me_row.uid IS NOT NULL THEN jsonb_build_object(
      'uid', me_row.uid,
      'is_seed_admin', COALESCE(me_row.is_seed_admin, false),
      'rank', my_rank,
      'qualified_top10', my_qualified,
      'referral_tier', my_tier,
      'in_top10', (my_rank >= 1 AND my_rank <= 10 AND my_qualified),
      'premiere_points', me_row.premiere_points,
      'effective_points', my_effective,
      'rating_score', my_effective,
      'friend_bonus_pct', my_bonus_pct,
      'premiere_score', me_row.premiere_score,
      'current_level', my_eff_level,
      'effective_level', my_eff_level,
      'superprize_level', my_sp_level,
      'chips_count', COALESCE(my_chips, 0),
      'golden_ticket_shards', LEAST(12, GREATEST(0, COALESCE(me_row.golden_ticket_shards, 0))),
      'friends_brought', me_row.friends_brought,
      'tickets_gifted', me_row.tickets_gifted,
      'duels_played', me_row.duels_played,
      'duels_won', me_row.duels_won,
      'points_to_top10', GREATEST(0, tenth_pts - my_effective + CASE WHEN my_rank > 10 THEN 10 ELSE 0 END)
    ) ELSE NULL END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_golden_ticket_shard_rpc(text, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_duel_lives_rpc(text, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_duel_round_rpc(text, boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_duel_premiere_bank_rpc(text, integer, boolean, boolean) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_premiere_leaderboard_rpc(text) TO PUBLIC, anon, authenticated;
