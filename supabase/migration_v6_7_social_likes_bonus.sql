-- ============================================================================
-- БОЧКА: Упакуй друга — v6.7 Direct Trailer Likes & Vivid Social Bonus
-- 1. Безопасные однократные бонусы (+50 ⭐) за реальный переход по кнопкам
--    «Лайк на YouTube (@kinoceh_bel)» и «Лайк в Instagram (@kinoceh_bel)»,
--    плюс однократная внутренняя реакция под трейлером (+25 ⭐).
-- 2. Вечные маркеры ([yt_like_clicked], [ig_like_clicked], [trailer_reaction])
--    переносятся при смене дня, чтобы внешние лайки нельзя было фармить ежедневно.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_social_or_promo_bonus_rpc(
  p_uid text,
  p_action text,
  p_platform text DEFAULT 'generic',
  p_ref_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  ref_u public.users%ROWTYPE;
  pts_added integer := 0;
  lives_added integer := 0;
  token_key text;
  mask_now text;
  perm_mask text := '';
  clean_ref text := NULLIF(trim(COALESCE(p_ref_uid, '')), '');
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;

  -- Отключено в v6.2 (ECON-REF): награда за реферала трейлера начисляется только при реальном досмотре
  IF p_action = 'trailer_ref_visit' THEN
    RETURN jsonb_build_object('ok', true, 'points_added', 0, 'lives_added', 0, 'already_claimed', true);
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF position('[trailer_reaction]' in COALESCE(u.daily_social_mask, '')) > 0 THEN
    perm_mask := perm_mask || '[trailer_reaction]';
  END IF;
  IF position('[yt_like_clicked]' in COALESCE(u.daily_social_mask, '')) > 0 THEN
    perm_mask := perm_mask || '[yt_like_clicked]';
  END IF;
  IF position('[ig_like_clicked]' in COALESCE(u.daily_social_mask, '')) > 0 THEN
    perm_mask := perm_mask || '[ig_like_clicked]';
  END IF;

  mask_now := CASE
    WHEN COALESCE(u.daily_social_date, DATE '2000-01-01') < CURRENT_DATE THEN perm_mask
    ELSE COALESCE(u.daily_social_mask, '')
  END;

  IF COALESCE(u.daily_shares_date, DATE '2000-01-01') < CURRENT_DATE THEN
    u.daily_shares_count := 0;
  END IF;

  IF p_action = 'trailer_watched' THEN
    PERFORM public.bump_daily_metric('trailer_completions', 1);
    IF NOT u.trailer_rewarded THEN
      pts_added := 250;
      lives_added := 1;
      u.trailer_rewarded := true;
    END IF;

    IF clean_ref IS NOT NULL
       AND NOT public.is_sandbox_uid(clean_ref)
       AND clean_ref <> trim(p_uid)
       AND u.trailer_ref_by IS NULL
    THEN
      SELECT * INTO ref_u FROM public.users WHERE uid = clean_ref FOR UPDATE;
      IF FOUND AND (
        ref_u.tg_user_id IS NULL OR u.tg_user_id IS NULL OR ref_u.tg_user_id <> u.tg_user_id
      ) THEN
        u.trailer_ref_by := clean_ref;
        UPDATE public.users
        SET
          lives = lives + 1,
          lives_updated_at = CASE WHEN lives + 1 >= 3 THEN now() ELSE lives_updated_at END,
          premiere_points = premiere_points + 250,
          premiere_score = CASE
            WHEN premiere_won THEN 100.00
            WHEN friends_brought >= 3 AND (kp_verified OR tickets_gifted >= 1) THEN LEAST(99.90, premiere_score + 0.35)
            ELSE LEAST(99.40, premiere_score + 0.35)
          END,
          updated_at = now()
        WHERE uid = clean_ref;
      END IF;
    END IF;

  ELSIF p_action = 'kp_clicked' THEN
    PERFORM public.bump_daily_metric('kp_clicks', 1);
    IF NOT u.kp_click_rewarded THEN
      pts_added := 300;
      u.kp_click_rewarded := true;
    END IF;

  ELSIF p_action IN ('share_barrel', 'share_trailer') THEN
    token_key := '[' || p_action || ':' || left(regexp_replace(COALESCE(p_platform, 'link'), '[^a-z0-9_]', '', 'gi'), 12) || ']';
    IF position(token_key in mask_now) = 0 THEN
      mask_now := mask_now || token_key;
      IF u.daily_shares_count < 4 THEN
        pts_added := 150;
        lives_added := 1;
        u.daily_shares_count := u.daily_shares_count + 1;
      END IF;
    END IF;

  ELSIF p_action = 'trailer_reaction' THEN
    token_key := '[trailer_reaction]';
    IF position(token_key in COALESCE(u.daily_social_mask, '')) = 0 AND position(token_key in mask_now) = 0 THEN
      mask_now := mask_now || token_key;
      pts_added := 25;
    END IF;

  ELSIF p_action IN ('yt_like_clicked', 'ig_like_clicked') THEN
    token_key := '[' || p_action || ']';
    IF position(token_key in COALESCE(u.daily_social_mask, '')) = 0 AND position(token_key in mask_now) = 0 THEN
      mask_now := mask_now || token_key;
      pts_added := 50;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + lives_added,
    lives_updated_at = CASE WHEN lives + lives_added >= 3 THEN now() ELSE lives_updated_at END,
    premiere_points = premiere_points + pts_added,
    trailer_rewarded = u.trailer_rewarded,
    kp_click_rewarded = u.kp_click_rewarded,
    trailer_ref_by = u.trailer_ref_by,
    daily_shares_count = u.daily_shares_count,
    daily_shares_date = CURRENT_DATE,
    daily_social_date = CURRENT_DATE,
    daily_social_mask = mask_now,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'points_added', pts_added,
    'lives_added', lives_added,
    'premiere_points', u.premiere_points,
    'lives', u.lives,
    'already_claimed', (pts_added = 0 AND lives_added = 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_social_or_promo_bonus_rpc(text, text, text, text) TO anon, authenticated;
