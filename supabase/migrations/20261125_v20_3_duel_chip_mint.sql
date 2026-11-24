-- Migration v20.3: Duel barrel & trophy chip guaranteed minting + unique template priority + total_count sync
CREATE OR REPLACE FUNCTION public.mint_rare_movie_card_rpc(p_uid text, p_source text DEFAULT 'level3'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'level3')));
  u public.users%ROWTYPE;
  gs public.global_stats%ROWTYPE;
  prog jsonb;
  v_base_chance integer := 15;
  v_guaranteed boolean := false;
  v_cooldown interval := interval '15 seconds';
  v_level_bonus integer := 0;
  v_autopilot_bonus integer := 0;
  v_final_chance integer := 15;
  v_roll numeric := 0;
  v_want_rarity text := 'rare';
  v_total_count integer := 0;
  tpl public.rare_card_templates%ROWTYPE;
  t public.user_trophies%ROWTYPE;
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'dropped', false, 'reason', 'invalid_uid', 'total_count', 0);
  END IF;

  IF v_src IN ('level3', 'l3') THEN
    v_base_chance := 15;
  ELSIF v_src IN ('level5', 'l5') THEN
    v_base_chance := 35;
  ELSIF v_src IN ('til', 'ocean', 'ocean_til') THEN
    v_base_chance := 50;
  ELSIF v_src IN ('duel_barrel', 'duel_trophy') THEN
    v_base_chance := 100;
    v_guaranteed := true;
    v_cooldown := interval '2 seconds';
  ELSE
    RETURN jsonb_build_object('ok', false, 'dropped', false, 'reason', 'invalid_source', 'total_count', 0);
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  SELECT count(*)::integer INTO v_total_count
  FROM public.user_trophies
  WHERE owner_uid = v_uid;

  IF u.last_card_mint_at IS NOT NULL AND (now() - u.last_card_mint_at) < v_cooldown THEN
    RETURN jsonb_build_object('ok', true, 'dropped', false, 'reason', 'cooldown', 'total_count', v_total_count);
  END IF;

  UPDATE public.users SET last_card_mint_at = now(), updated_at = now() WHERE uid = v_uid;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  v_autopilot_bonus := GREATEST(0, COALESCE(gs.rare_drop_bonus_pct, 0));

  prog := public.compute_collector_progress(v_uid);
  v_level_bonus := COALESCE((prog->>'rare_drop_bonus_pct')::integer, 0);
  v_final_chance := CASE WHEN v_guaranteed THEN 100 ELSE LEAST(95, v_base_chance + v_level_bonus + v_autopilot_bonus) END;

  IF NOT v_guaranteed THEN
    v_roll := random() * 100.0;
    IF v_roll >= v_final_chance THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dropped', false,
        'reason', 'no_drop',
        'chance_pct', v_final_chance,
        'autopilot_bonus_pct', v_autopilot_bonus,
        'level_info', prog,
        'total_count', v_total_count
      );
    END IF;
  END IF;

  v_roll := random() * 100.0;
  IF v_roll < 12.0 THEN
    v_want_rarity := 'legendary';
  ELSIF v_roll < 42.0 THEN
    v_want_rarity := 'epic';
  ELSE
    v_want_rarity := 'rare';
  END IF;

  SELECT * INTO tpl
  FROM public.rare_card_templates rct
  WHERE rct.minted_count < rct.max_supply
    AND rct.rarity = v_want_rarity
  ORDER BY (
    EXISTS (
      SELECT 1 FROM public.user_trophies ut
      WHERE ut.owner_uid = v_uid AND ut.template_id = rct.id
    )
  ) ASC, random()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO tpl
    FROM public.rare_card_templates rct
    WHERE rct.minted_count < rct.max_supply
    ORDER BY (
      EXISTS (
        SELECT 1 FROM public.user_trophies ut
        WHERE ut.owner_uid = v_uid AND ut.template_id = rct.id
      )
    ) ASC, random()
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dropped', false,
      'reason', 'supply_exhausted',
      'chance_pct', v_final_chance,
      'autopilot_bonus_pct', v_autopilot_bonus,
      'level_info', prog,
      'total_count', v_total_count
    );
  END IF;

  UPDATE public.rare_card_templates
  SET minted_count = minted_count + 1
  WHERE id = tpl.id
  RETURNING * INTO tpl;

  INSERT INTO public.user_trophies (
    owner_uid, trophy_type, template_id, serial_number, image_url, label, rarity
  )
  VALUES (
    v_uid, 'movie_card', tpl.id, tpl.minted_count, tpl.image_url, tpl.title, tpl.rarity
  )
  RETURNING * INTO t;

  v_total_count := v_total_count + 1;

  RETURN jsonb_build_object(
    'ok', true,
    'dropped', true,
    'chance_pct', v_final_chance,
    'autopilot_bonus_pct', v_autopilot_bonus,
    'level_info', prog,
    'total_count', v_total_count,
    'trophy', jsonb_build_object(
      'id', t.id,
      'trophy_type', t.trophy_type,
      'template_id', t.template_id,
      'serial_number', t.serial_number,
      'max_supply', tpl.max_supply,
      'image_url', t.image_url,
      'label', t.label,
      'rarity', t.rarity,
      'won_from_name', t.won_from_name,
      'created_at', t.created_at
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mint_rare_movie_card_rpc(text, text) TO PUBLIC, anon, authenticated;
