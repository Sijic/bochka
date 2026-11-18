-- v7.4: Уровень 3 — аварийное восстановление +1 жизни за ОДНО целевое действие (Кинопоиск / подписка / лайк)
CREATE OR REPLACE FUNCTION public.claim_life_recovery_rpc(p_uid text, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u public.users%ROWTYPE;
  tok text;
  base_mask text;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sandbox_uid_blocked');
  END IF;
  IF p_kind NOT IN ('kp', 'sub', 'like') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_kind');
  END IF;

  PERFORM public.get_or_create_player_profile(trim(p_uid), NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF u.lives > 0 THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'reason', 'has_lives', 'lives', u.lives);
  END IF;

  tok := '[life_' || p_kind || ']';
  IF COALESCE(u.daily_social_date, DATE '2000-01-01') < CURRENT_DATE THEN
    -- новый день: сбрасываем суточные токены, сохраняя постоянные
    base_mask := concat_ws('',
      CASE WHEN position('[trailer_reaction]' in COALESCE(u.daily_social_mask, '')) > 0 THEN '[trailer_reaction]' END,
      CASE WHEN position('[yt_like_clicked]' in COALESCE(u.daily_social_mask, '')) > 0 THEN '[yt_like_clicked]' END,
      CASE WHEN position('[yt_sub_clicked]' in COALESCE(u.daily_social_mask, '')) > 0 THEN '[yt_sub_clicked]' END,
      CASE WHEN position('[ig_like_clicked]' in COALESCE(u.daily_social_mask, '')) > 0 THEN '[ig_like_clicked]' END);
  ELSE
    base_mask := COALESCE(u.daily_social_mask, '');
  END IF;

  IF position(tok in base_mask) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'granted', false, 'reason', 'already_today', 'lives', u.lives);
  END IF;

  UPDATE public.users
  SET lives = lives + 1,
      daily_social_mask = base_mask || tok,
      daily_social_date = CURRENT_DATE,
      updated_at = now()
  WHERE uid = u.uid;

  IF p_kind = 'kp' THEN
    PERFORM public.bump_daily_metric('kp_clicks', 1);
  END IF;

  RETURN jsonb_build_object('ok', true, 'granted', true, 'lives', u.lives + 1, 'kind', p_kind);
END; $$;
GRANT EXECUTE ON FUNCTION public.claim_life_recovery_rpc(text, text) TO anon, authenticated;
