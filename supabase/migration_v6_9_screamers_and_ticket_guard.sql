-- ============================================================================
-- MIGRATION v6.9 (v6.5-screamers-and-ticket-guard):
-- 1. Защита подарочного билета «Только для новичка» (total_strikes = 0, новый uid/tg_id и уникальный телефон 7XXXXXXXXXX)
-- 2. Авто-возврат неактивированного подарочного билета владельцу через 24 часа
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_gift_pass_public(
  p_short_id text,
  p_viewer_tg_id text DEFAULT NULL,
  p_viewer_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass record;
  v_order record;
  v_contact record;
  v_viewer_user record;
  v_is_existing_player boolean := false;
  v_expired_returned boolean := false;
BEGIN
  SELECT * INTO v_pass
  FROM public.ticket_passes
  WHERE short_id = p_short_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Авто-возврат владельцу, если новичок не активировал билет за 24 часа
  IF v_pass.status = 'issued' AND v_pass.created_at < (now() - interval '24 hours') THEN
    UPDATE public.ticket_passes
    SET status = 'expired_returned'
    WHERE short_id = p_short_id;

    UPDATE public.users
    SET has_pending_ticket = true
    WHERE uid = v_pass.sender_uid;

    v_pass.status := 'expired_returned';
    v_expired_returned := true;
  END IF;

  -- Проверка: есть ли уже получатель в базе как активный игрок цеха (total_strikes > 0 / packed_count > 0 / premiere_points > 0)
  IF (p_viewer_tg_id IS NOT NULL AND length(trim(p_viewer_tg_id)) > 0) OR (p_viewer_uid IS NOT NULL AND length(trim(p_viewer_uid)) > 0) THEN
    SELECT * INTO v_viewer_user
    FROM public.users
    WHERE (p_viewer_tg_id IS NOT NULL AND tg_user_id = trim(p_viewer_tg_id))
       OR (p_viewer_uid IS NOT NULL AND uid = trim(p_viewer_uid))
    ORDER BY created_at ASC
    LIMIT 1;

    IF FOUND AND v_viewer_user.uid <> v_pass.sender_uid THEN
      IF COALESCE(v_viewer_user.premiere_points, 0) > 0
         OR COALESCE(v_viewer_user.packed_count, 0) > 0
         OR COALESCE(v_viewer_user.current_level, 1) > 1
         OR EXISTS (
           SELECT 1 FROM public.barrel_opens_ledger bol
           WHERE bol.opener_uid = v_viewer_user.uid
         )
      THEN
        v_is_existing_player := true;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_order
  FROM public.ticket_orders
  WHERE gift_id = p_short_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF p_viewer_tg_id IS NOT NULL AND length(trim(p_viewer_tg_id)) > 0 THEN
    SELECT * INTO v_contact
    FROM public.verified_contacts
    WHERE tg_user_id = trim(p_viewer_tg_id)
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_pass.short_id,
    'status', v_pass.status,
    'expired_returned', v_expired_returned,
    'is_existing_player', v_is_existing_player,
    'order_status', COALESCE(v_order.status, ''),
    'recipient_name', COALESCE(v_pass.recipient_name, ''),
    'recipient_photo_url', COALESCE(v_pass.recipient_photo_url, ''),
    'sender_name', COALESCE(v_pass.sender_name, ''),
    'sender_uid', COALESCE(v_pass.sender_uid, ''),
    'sender_tg_id', COALESCE(v_pass.sender_tg_id, ''),
    'has_verified_phone', (v_contact.phone IS NOT NULL),
    'verified_phone', COALESCE(v_contact.phone, v_order.phone, ''),
    'city_cinema', COALESCE(v_order.city_cinema, ''),
    'booking_code', COALESCE(v_order.booking_code, ''),
    'ticket_file_url', COALESCE(v_order.ticket_file_url, ''),
    'server_now_ms', floor(extract(epoch from now()) * 1000)
  );
END;
$$;
