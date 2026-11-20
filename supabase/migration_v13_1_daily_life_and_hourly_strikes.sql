-- ============================================================================
-- MIGRATION v13.1 (moscow_resume_and_daily_life_regen):
-- Заменяет старый 4-часовой реген (до 3 ❤️) на жёсткое правило v13.1:
-- - Строго 1 ❤️ жизнь раз в сутки (по календарной дате МСК, только при lives <= 0 -> 1 ❤️).
-- - Почасовое восстановление ударов (+1 удар/час до 3) и точное запоминание раунда/уровня
--   синхронизированы с профилем пользователя.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_life_regen_date date;

CREATE OR REPLACE FUNCTION public.apply_passive_life_regen(p_uid text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  msk_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  IF public.is_sandbox_uid(p_uid) THEN
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Первичная инициализация даты МСК без лишней выдачи в день регистрации
  IF u.daily_life_regen_date IS NULL THEN
    UPDATE public.users
    SET daily_life_regen_date = msk_today, lives_updated_at = now()
    WHERE uid = u.uid;
    RETURN;
  END IF;

  -- Наступил новый день по МСК: возвращаем СТРОГО 1 ❤️ жизнь (если жизни на нуле)!
  IF u.daily_life_regen_date < msk_today THEN
    UPDATE public.users
    SET
      lives = CASE WHEN COALESCE(u.lives, 0) <= 0 THEN 1 ELSE u.lives END,
      daily_life_regen_date = msk_today,
      lives_updated_at = now(),
      updated_at = now()
    WHERE uid = u.uid;
  END IF;
END;
$$;
