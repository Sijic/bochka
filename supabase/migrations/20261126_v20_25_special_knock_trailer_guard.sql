-- v20.25-rf: Enforce trailer_watched_full = true for workshop_1997 in claim_special_knock_rpc
-- Returns controlled JSONB refusal ('trailer_full_required', HTTP 200) instead of 500 or free bypass.
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
  v_trailer_full BOOLEAN := false;
  v_next_lives INTEGER := 3;
  v_retry_after INTEGER := 0;
BEGIN
  IF length(v_uid) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'granted', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, lives)
  VALUES (v_uid, 3)
  ON CONFLICT (uid) DO NOTHING;

  SELECT
    COALESCE(lives, 3),
    last_special_knock_at,
    COALESCE(trailer_watched_full, false)
  INTO v_lives, v_last_knock, v_trailer_full
  FROM public.users
  WHERE uid = v_uid
  FOR UPDATE;

  IF v_source = 'workshop_1997' AND NOT v_trailer_full THEN
    RETURN jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'trailer_full_required',
      'source', v_source,
      'lives', GREATEST(0, COALESCE(v_lives, 0)),
      'lives_added', 0,
      'last_special_knock_at', v_last_knock
    );
  END IF;

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
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'reason', 'granted',
    'source', v_source,
    'lives', v_next_lives,
    'lives_added', 3,
    'last_special_knock_at', now(),
    'retry_after_sec', 86400
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_special_knock_rpc(text, text) TO PUBLIC, anon, authenticated;
