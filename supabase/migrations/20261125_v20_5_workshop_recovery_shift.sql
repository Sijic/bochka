-- v20.5: Workshop Recovery Shift (without Til) when player repeatedly hits 0 lives
-- or cancels friend share without actually sending (+1 life up to ceiling 3, +75 pts, max 6 shifts/day MSK, 20s cooldown).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_recovery_shifts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_recovery_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_recovery_shift_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_workshop_recovery_life_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_user public.users%ROWTYPE;
  msk_date date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_shifts integer := 0;
  v_new_lives integer := 0;
  v_new_pts integer := 0;
  v_retry_sec integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uid_required');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE uid = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  v_shifts := CASE
    WHEN COALESCE(v_user.daily_recovery_date, DATE '2000-01-01') < msk_date THEN 0
    ELSE COALESCE(v_user.daily_recovery_shifts, 0)
  END;

  IF COALESCE(v_user.lives, 0) >= 3 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'lives_ceiling_reached',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6
    );
  END IF;

  IF v_shifts >= 6 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'daily_recovery_limit',
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6
    );
  END IF;

  IF v_user.last_recovery_shift_at IS NOT NULL
     AND now() - v_user.last_recovery_shift_at < interval '20 seconds'
  THEN
    v_retry_sec := GREATEST(1, CEIL(20.0 - EXTRACT(EPOCH FROM (now() - v_user.last_recovery_shift_at)))::integer);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'recovery_cooldown',
      'retry_after_sec', v_retry_sec,
      'lives', COALESCE(v_user.lives, 0),
      'premiere_points', COALESCE(v_user.premiere_points, 0),
      'daily_recovery_shifts', v_shifts,
      'max_daily_shifts', 6
    );
  END IF;

  v_new_lives := LEAST(3, COALESCE(v_user.lives, 0) + 1);
  v_new_pts := COALESCE(v_user.premiere_points, 0) + 75;
  v_shifts := v_shifts + 1;

  UPDATE public.users
  SET
    lives = v_new_lives,
    premiere_points = v_new_pts,
    daily_recovery_shifts = v_shifts,
    daily_recovery_date = msk_date,
    last_recovery_shift_at = now(),
    updated_at = now()
  WHERE uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'lives_added', 1,
    'points_added', 75,
    'lives', v_new_lives,
    'premiere_points', v_new_pts,
    'daily_recovery_shifts', v_shifts,
    'max_daily_shifts', 6
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_workshop_recovery_life_rpc(text) TO PUBLIC, anon, authenticated;
