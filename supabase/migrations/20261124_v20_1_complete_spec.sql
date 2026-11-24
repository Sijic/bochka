-- ============================================================================
-- БОЧКА v20.0-studio COMPLETE SPEC:
-- 1) Отдельный серверный спец-стук (+3 ❤️, 1 раз / 24 часа): claim_special_knock_rpc
-- 2) Точный friends_count и last_special_knock_at в get_or_create_player_profile
-- 3) Именная «Фишка друга» (friend_joined) с портретом бойца 1..6 и без метки «отнял у»
-- 4) Разблокировка режима «На фишки» с 1-го подключённого друга (compute_collector_progress)
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_special_knock_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_special_knock_rpc(
  p_uid TEXT,
  p_source TEXT DEFAULT 'ocean_rhythm'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid TEXT := trim(COALESCE(p_uid, ''));
  v_source TEXT := COALESCE(NULLIF(trim(COALESCE(p_source, '')), ''), 'ocean_rhythm');
  v_lives INTEGER := 3;
  v_last_knock TIMESTAMPTZ := NULL;
  v_next_lives INTEGER := 3;
  v_retry_after INTEGER := 0;
BEGIN
  IF length(v_uid) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, lives)
  VALUES (v_uid, 3)
  ON CONFLICT (uid) DO NOTHING;

  SELECT COALESCE(lives, 3), last_special_knock_at
  INTO v_lives, v_last_knock
  FROM public.users
  WHERE uid = v_uid
  FOR UPDATE;

  IF v_last_knock IS NOT NULL AND (now() - v_last_knock) < interval '24 hours' THEN
    v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM ((v_last_knock + interval '24 hours') - now()))::integer);
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'special_knock_cooldown',
      'source', v_source,
      'lives', GREATEST(0, COALESCE(v_lives, 0)),
      'lives_added', 0,
      'last_special_knock_at', v_last_knock,
      'retry_after_sec', v_retry_after
    );
  END IF;

  v_next_lives := LEAST(30, GREATEST(0, COALESCE(v_lives, 0)) + 3);

  UPDATE public.users
  SET
    lives = v_next_lives,
    last_special_knock_at = now(),
    lives_updated_at = now(),
    updated_at = now()
  WHERE uid = v_uid
  RETURNING last_special_knock_at INTO v_last_knock;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'reason', 'granted',
    'source', v_source,
    'lives', v_next_lives,
    'lives_added', 3,
    'last_special_knock_at', v_last_knock,
    'retry_after_sec', 86400
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_collector_progress(p_uid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_unlock_invites CONSTANT integer := 1;
  v_user_invites integer := 0;
  v_sc_invites integer := 0;
  v_ref_invites integer := 0;
  v_invites integer := 0;
  v_level integer := 1;
  v_title text := 'Коллекционер';
  v_drop_bonus integer := 0;
  v_unlocked boolean := false;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object(
      'invited_friends', 0,
      'level', 1,
      'level_title', 'Коллекционер',
      'chip_duel_unlock_invites', v_unlock_invites,
      'invites_remaining', v_unlock_invites,
      'chip_duel_unlocked', false,
      'rare_drop_bonus_pct', 0
    );
  END IF;

  SELECT COALESCE(u.friends_brought, 0)
  INTO v_user_invites
  FROM public.users u
  WHERE u.uid = v_uid;

  SELECT COUNT(DISTINCT CASE WHEN sc.sender_uid = v_uid THEN sc.receiver_uid ELSE sc.sender_uid END)::integer
  INTO v_sc_invites
  FROM public.social_connections sc
  WHERE (sc.sender_uid = v_uid OR sc.receiver_uid = v_uid)
    AND sc.sender_uid <> sc.receiver_uid
    AND NOT public.is_sandbox_uid(CASE WHEN sc.sender_uid = v_uid THEN sc.receiver_uid ELSE sc.sender_uid END);

  SELECT COUNT(DISTINCT u2.uid)::integer
  INTO v_ref_invites
  FROM public.users u2
  WHERE u2.referred_by_uid = v_uid
    AND u2.uid <> v_uid
    AND NOT public.is_sandbox_uid(u2.uid);

  v_invites := GREATEST(COALESCE(v_user_invites, 0), COALESCE(v_sc_invites, 0), COALESCE(v_ref_invites, 0));

  IF v_invites >= 5 THEN
    v_level := 4;
    v_title := 'Хранитель Зала';
    v_unlocked := true;
    v_drop_bonus := 10;
  ELSIF v_invites >= 3 THEN
    v_level := 3;
    v_title := 'Игрок на фишки';
    v_unlocked := true;
    v_drop_bonus := 0;
  ELSIF v_invites >= v_unlock_invites THEN
    v_level := 2;
    v_title := 'Охотник';
    v_unlocked := true;
    v_drop_bonus := 0;
  ELSE
    v_level := 1;
    v_title := 'Коллекционер';
    v_unlocked := false;
    v_drop_bonus := 0;
  END IF;

  RETURN jsonb_build_object(
    'invited_friends', v_invites,
    'level', v_level,
    'level_title', v_title,
    'chip_duel_unlock_invites', v_unlock_invites,
    'invites_remaining', GREATEST(0, v_unlock_invites - v_invites),
    'chip_duel_unlocked', v_unlocked,
    'rare_drop_bonus_pct', v_drop_bonus
  );
END;
$function$;

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
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

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

CREATE OR REPLACE FUNCTION public.claim_personal_barrel_open_rpc(
  p_barrel_id text,
  p_viewer_uid text,
  p_viewer_tg_id text DEFAULT ''::text,
  p_viewer_username text DEFAULT ''::text,
  p_viewer_name text DEFAULT ''::text,
  p_viewer_avatar text DEFAULT ''::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bid text := trim(coalesce(p_barrel_id, ''));
  v_uid text := trim(coalesce(p_viewer_uid, ''));
  v_tg text := trim(coalesce(p_viewer_tg_id, ''));
  v_avatar text := left(trim(coalesce(p_viewer_avatar, '')), 300);
  v_name text := left(COALESCE(NULLIF(trim(coalesce(p_viewer_name, '')), ''), 'Друг'), 48);
  b public.barrels%ROWTYPE;
  s_user public.users%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_root_code text := NULL;
  v_seed_prefix text := NULL;
  v_is_self boolean := false;
  v_already_connected boolean := false;
  v_shard_res jsonb := '{}'::jsonb;
  v_chip_img text := './public/sprites/fighter_1.webp';
  v_chip_bid text := '';
BEGIN
  IF v_bid = '' OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'params_required');
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF COALESCE(b.is_broadcast, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', true,
      'locked', false,
      'is_self', (b.sender_uid = v_uid OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND b.sender_tg_id = v_tg)),
      'sender_rewarded', false
    );
  END IF;

  v_is_self := (
    (b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND b.sender_uid = v_uid)
    OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND v_tg <> '' AND b.sender_tg_id = v_tg)
  );

  IF v_is_self THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', true,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'duplicate_friend_blocked', false,
      'reason', 'self_open_no_reward'
    );
  END IF;

  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' THEN
    SELECT * INTO s_user FROM public.users WHERE uid = b.sender_uid;
    IF FOUND THEN
      v_root_code := COALESCE(NULLIF(s_user.root_tracking_code, ''), NULLIF(s_user.seed_tracking_code, ''));
      v_seed_prefix := COALESCE(NULLIF(s_user.seed_prefix, ''), NULLIF(b.broadcast_prefix, ''));
    END IF;
  END IF;

  PERFORM public.get_or_create_player_profile(
    v_uid,
    NULLIF(v_tg, ''),
    NULLIF(trim(coalesce(p_viewer_username, '')), ''),
    COALESCE(NULLIF(trim(coalesce(p_viewer_name, '')), ''), 'Игрок')
  );

  UPDATE public.users
  SET
    seed_prefix = COALESCE(NULLIF(seed_prefix, ''), v_seed_prefix),
    root_tracking_code = COALESCE(NULLIF(root_tracking_code, ''), v_root_code),
    referred_by_uid = COALESCE(referred_by_uid, b.sender_uid),
    avatar_url = CASE WHEN v_avatar ~ '^https://[^ ]+$' THEN v_avatar ELSE avatar_url END,
    traffic_source = CASE
      WHEN COALESCE(traffic_source, '') IN ('', 'organic') AND v_seed_prefix IS NOT NULL THEN v_seed_prefix
      ELSE traffic_source
    END,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO v_user;

  IF b.opened_by_uid IS NOT NULL AND b.opened_by_uid <> '' AND b.opened_by_uid <> v_uid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', true,
      'first_open', false,
      'sender_rewarded', false,
      'opened_by_uid', b.opened_by_uid,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  IF b.opened_by_uid = v_uid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', false,
      'first_open', false,
      'sender_rewarded', false,
      'friend_chip_minted', false,
      'duplicate_friend_blocked', true,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  -- Запираем личную бочку на открывшего друга и фиксируем в barrel_opens_ledger
  UPDATE public.barrels
  SET
    opened_by_uid = v_uid,
    opened_at = now(),
    opens_count = COALESCE(opens_count, 0) + 1
  WHERE short_id = v_bid;

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (v_bid, v_uid)
  ON CONFLICT DO NOTHING;

  -- Проверяем, подключался ли уже ЭТОТ друг ранее в social_connections (в любом направлении для отправителя)
  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND NOT public.is_sandbox_uid(v_uid) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.social_connections sc
      WHERE sc.sender_uid = b.sender_uid
        AND COALESCE(sc.opened_barrel, false) = true
        AND (
          sc.receiver_uid = v_uid
          OR (v_tg <> '' AND sc.receiver_tg_id = v_tg)
        )
    ) INTO v_already_connected;

    UPDATE public.social_connections
    SET
      opened_barrel = true,
      receiver_name = CASE WHEN v_name <> '' THEN v_name ELSE receiver_name END,
      receiver_username = COALESCE(NULLIF(trim(coalesce(p_viewer_username, '')), ''), receiver_username),
      receiver_tg_id = COALESCE(NULLIF(v_tg, ''), receiver_tg_id),
      updated_at = now()
    WHERE sender_uid = b.sender_uid AND receiver_uid = v_uid;

    IF NOT FOUND THEN
      INSERT INTO public.social_connections (
        sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel
      )
      VALUES (
        b.sender_uid, v_uid, NULLIF(b.sender_tg_id, ''), NULLIF(v_tg, ''), v_name, NULLIF(trim(coalesce(p_viewer_username, '')), ''), true
      );
    END IF;

    IF v_already_connected THEN
      RETURN jsonb_build_object(
        'ok', true,
        'is_broadcast', false,
        'is_self', false,
        'locked', false,
        'first_open', true,
        'sender_rewarded', false,
        'friend_chip_minted', false,
        'duplicate_friend_blocked', true,
        'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
        'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
      );
    END IF;

    -- УНИКАЛЬНЫЙ НОВЫЙ ДРУГ -> ДЖЕКПОТ: +500 очков (вне дневного лимита 750!), +6 жизней, именная «Фишка друга» с портретом, анлок 1x1 и 3/4-4/4!
    UPDATE public.users
    SET
      friends_brought = COALESCE(friends_brought, 0) + 1,
      premiere_points = COALESCE(premiere_points, 0) + 500,
      premiere_score = LEAST(99.5, COALESCE(premiere_score, 0) + 20.0),
      lives = LEAST(30, COALESCE(lives, 0) + 6),
      ui_stage = GREATEST(COALESCE(ui_stage, 1), 4),
      lives_updated_at = now(),
      updated_at = now()
    WHERE uid = b.sender_uid;

    v_chip_img := COALESCE(
      NULLIF(v_avatar, ''),
      NULLIF(trim(COALESCE(v_user.avatar_url, '')), ''),
      './public/sprites/fighter_' || ((abs(hashtext(v_uid)) % 6) + 1)::text || '.webp'
    );
    v_chip_bid := 'fj_' || left(b.sender_uid, 40) || '_' || left(v_uid, 40);

    INSERT INTO public.user_trophies (
      owner_uid, trophy_type, barrel_id, image_url, label, rarity, won_from_name
    )
    VALUES (
      b.sender_uid, 'friend_joined', v_chip_bid, v_chip_img, v_name, 'common', NULL
    )
    ON CONFLICT (owner_uid, barrel_id) WHERE barrel_id IS NOT NULL DO NOTHING;

    v_shard_res := public.award_ticket_shard_rpc(b.sender_uid, 'friend_opened');

    RETURN jsonb_build_object(
      'ok', true,
      'is_broadcast', false,
      'is_self', false,
      'locked', false,
      'first_open', true,
      'sender_rewarded', true,
      'duplicate_friend_blocked', false,
      'jackpot_points', 500,
      'jackpot_lives', 6,
      'friend_chip_minted', true,
      'friend_chip', jsonb_build_object(
        'barrel_id', v_chip_bid,
        'label', v_name,
        'image_url', v_chip_img,
        'trophy_type', 'friend_joined'
      ),
      'sender_shard_res', v_shard_res,
      'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
      'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_broadcast', false,
    'is_self', false,
    'locked', false,
    'first_open', true,
    'sender_rewarded', false,
    'friend_chip_minted', false,
    'duplicate_friend_blocked', false,
    'inherited_seed_prefix', COALESCE(v_user.seed_prefix, ''),
    'inherited_root_code', COALESCE(v_user.root_tracking_code, '')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_special_knock_rpc(text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_collector_progress(text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_player_profile(text, text, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_personal_barrel_open_rpc(text, text, text, text, text, text) TO PUBLIC, anon, authenticated;
