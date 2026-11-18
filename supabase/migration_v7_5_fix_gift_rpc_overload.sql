-- v7.5: починка PGRST203 (удаление 2-арг перегрузки) и ошибок RECORD (v_order.verified_phone, неинициализированный v_contact) в get_gift_pass_public
ALTER TABLE public.ticket_passes DROP CONSTRAINT IF EXISTS ticket_passes_status_check;
ALTER TABLE public.ticket_passes
  ADD CONSTRAINT ticket_passes_status_check
  CHECK (status IN ('issued', 'claimed', 'sent', 'rejected', 'expired_returned'));

DROP FUNCTION IF EXISTS public.get_gift_pass_public(text, text);

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
  v_pass public.ticket_passes%ROWTYPE;
  v_viewer_user public.users%ROWTYPE;
  v_order_status text := '';
  v_order_phone text := '';
  v_city_cinema text := '';
  v_booking_code text := '';
  v_ticket_file_url text := '';
  v_contact_phone text := '';
  v_has_verified_phone boolean := false;
  v_is_existing_player boolean := false;
  v_expired_returned boolean := false;
  v_clean_id text := trim(coalesce(p_short_id, ''));
  v_clean_tg text := nullif(trim(coalesce(p_viewer_tg_id, '')), '');
  v_clean_uid text := coalesce(nullif(trim(coalesce(p_viewer_uid, '')), ''), CASE WHEN nullif(trim(coalesce(p_viewer_tg_id, '')), '') IS NOT NULL THEN 'tg_' || trim(p_viewer_tg_id) ELSE NULL END);
BEGIN
  SELECT * INTO v_pass
  FROM public.ticket_passes
  WHERE short_id = v_clean_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Авто-возврат владельцу, если новичок не активировал билет за 24 часа
  IF v_pass.status = 'issued' AND v_pass.created_at < (now() - interval '24 hours') THEN
    UPDATE public.ticket_passes
    SET status = 'expired_returned'
    WHERE short_id = v_clean_id;

    UPDATE public.users
    SET has_pending_ticket = true
    WHERE uid = v_pass.sender_uid;

    v_pass.status := 'expired_returned';
    v_expired_returned := true;
  END IF;

  -- Проверка: есть ли уже получатель в базе как активный игрок цеха
  IF v_clean_tg IS NOT NULL OR v_clean_uid IS NOT NULL THEN
    SELECT * INTO v_viewer_user
    FROM public.users
    WHERE (v_clean_tg IS NOT NULL AND tg_user_id = v_clean_tg)
       OR (v_clean_uid IS NOT NULL AND uid = v_clean_uid)
    ORDER BY created_at ASC
    LIMIT 1;

    IF FOUND AND v_viewer_user.uid <> v_pass.sender_uid THEN
      IF coalesce(v_viewer_user.premiere_points, 0) > 0
         OR coalesce(v_viewer_user.packed_count, 0) > 0
         OR coalesce(v_viewer_user.current_level, 1) > 1
         OR EXISTS (
           SELECT 1 FROM public.barrel_opens_ledger bol
           WHERE bol.opener_uid = v_viewer_user.uid
         )
      THEN
        v_is_existing_player := true;
      END IF;
    END IF;
  END IF;

  SELECT
    coalesce(o.status, ''),
    coalesce(o.verified_phone, ''),
    coalesce(o.city_cinema, ''),
    CASE WHEN o.status = 'sent' THEN coalesce(o.booking_code, '') ELSE '' END,
    CASE WHEN o.status = 'sent' THEN coalesce(o.ticket_file_url, '') ELSE '' END
  INTO v_order_status, v_order_phone, v_city_cinema, v_booking_code, v_ticket_file_url
  FROM public.ticket_orders o
  WHERE o.gift_id = v_clean_id
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_clean_tg IS NOT NULL THEN
    SELECT coalesce(c.phone, '')
    INTO v_contact_phone
    FROM public.verified_contacts c
    WHERE c.tg_user_id = v_clean_tg
    LIMIT 1;
    IF FOUND AND v_contact_phone <> '' THEN
      v_has_verified_phone := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_pass.short_id,
    'status', v_pass.status,
    'expired_returned', v_expired_returned,
    'is_existing_player', v_is_existing_player,
    'order_status', coalesce(v_order_status, ''),
    'recipient_name', coalesce(v_pass.recipient_name, ''),
    'recipient_photo_url', coalesce(v_pass.recipient_photo_url, ''),
    'sender_name', coalesce(v_pass.sender_name, ''),
    'sender_uid', coalesce(v_pass.sender_uid, ''),
    'sender_tg_id', coalesce(v_pass.sender_tg_id, ''),
    'has_verified_phone', v_has_verified_phone,
    'verified_phone', coalesce(nullif(v_contact_phone, ''), v_order_phone, ''),
    'city_cinema', coalesce(v_city_cinema, ''),
    'booking_code', coalesce(v_booking_code, ''),
    'ticket_file_url', coalesce(v_ticket_file_url, ''),
    'server_now_ms', floor(extract(epoch FROM now()) * 1000)::bigint
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gift_pass_public(text, text, text) TO anon, authenticated;
