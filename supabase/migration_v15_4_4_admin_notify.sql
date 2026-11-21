-- ============================================================================
-- БОЧКА v15.4.4 — ПРОСТЫЕ АДМИН-ПУШИ О НОВЫХ ЗАЯВКАХ (admin_notify_chat_ids)
-- Привязка лички или рабочего чата продюсеров командой /bind_notify <код>
-- и настройка в /admin/ (Вкладка 4 «Управление лимитами»).
-- ============================================================================

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS admin_notify_chat_ids TEXT NOT NULL DEFAULT '';

-- Обновляем admin_update_config: добавляем p_admin_notify_chat_ids (обратная совместимость DEFAULT NULL)
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean, integer, boolean);
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.admin_update_config(
  p_win_every_n_hits integer,
  p_max_daily_tickets integer,
  p_max_premiere_winners integer,
  p_is_paused boolean,
  p_max_total_tickets integer DEFAULT NULL,
  p_require_pair_receipt boolean DEFAULT NULL,
  p_admin_notify_chat_ids text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  v_clean_chats text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_admin_notify_chat_ids IS NOT NULL THEN
    v_clean_chats := left(btrim(regexp_replace(p_admin_notify_chat_ids, '[^0-9,\-\s]', '', 'g')), 500);
  ELSE
    v_clean_chats := NULL;
  END IF;

  UPDATE public.global_stats
  SET
    win_every_n_hits = GREATEST(1, COALESCE(p_win_every_n_hits, win_every_n_hits)),
    max_daily_tickets = GREATEST(0, COALESCE(p_max_daily_tickets, max_daily_tickets)),
    max_premiere_winners = GREATEST(0, COALESCE(p_max_premiere_winners, max_premiere_winners)),
    max_total_tickets = GREATEST(0, COALESCE(p_max_total_tickets, max_total_tickets)),
    is_paused = COALESCE(p_is_paused, is_paused),
    require_pair_receipt = COALESCE(p_require_pair_receipt, require_pair_receipt),
    admin_notify_chat_ids = COALESCE(v_clean_chats, admin_notify_chat_ids),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object('ok', true, 'stats', row_to_json(gs));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_config(integer, integer, integer, boolean, integer, boolean, text) TO authenticated;
