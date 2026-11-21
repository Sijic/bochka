-- ============================================================================
-- БОЧКА v15.5: «Умный автопилот пула и темпа» (global_stats + evaluate_campaign_autopilot_rpc)
-- - Тихий режим ('quiet'): после 18:00 МСК, <= 1 билета и < 250 игроков -> +10% редкие карты,
--   кулдаун дуэлей 8с, суточный лимит 4-6 шт.
-- - Вирусный режим ('viral'): до 15:00 МСК, суточный лимит разобран и >= 1000 игроков ->
--   суточный лимит 8 шт., +10 билетов к пулу, СТРОГО НЕ ВЫШЕ auto_pool_hard_cap (150)!
-- - Нормальный режим ('normal'): 6/сут, база 100, бонус 0%, кулдаун 15с.
-- ============================================================================

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS auto_pilot_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_pool_hard_cap integer NOT NULL DEFAULT 150 CHECK (auto_pool_hard_cap >= 100 AND auto_pool_hard_cap <= 500),
  ADD COLUMN IF NOT EXISTS current_pacing_mode text NOT NULL DEFAULT 'normal' CHECK (current_pacing_mode IN ('quiet', 'normal', 'viral')),
  ADD COLUMN IF NOT EXISTS rare_drop_bonus_pct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duel_cooldown_sec integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS viral_players_threshold integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS last_autopilot_eval_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_viral_boost_date date NULL;

-- 1. Серверная функция оценки и переключения автопилота
CREATE OR REPLACE FUNCTION public.evaluate_campaign_autopilot_rpc(
  p_now_msk timestamptz DEFAULT NULL,
  p_today_players_override integer DEFAULT NULL,
  p_viral_threshold integer DEFAULT NULL,
  p_force_recheck boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_privileged boolean := (v_jwt_role NOT IN ('anon', 'authenticated') OR public.is_admin());
  v_eff_ts timestamp;
  v_msk_date date;
  v_msk_hour integer;
  v_today_players integer := 0;
  v_threshold integer := 1000;
  v_hard_cap integer := 150;
  v_prev_mode text := 'normal';
  v_prev_total integer := 100;
  v_new_mode text := 'normal';
  v_new_daily integer := 6;
  v_new_total integer := 100;
  v_new_bonus integer := 0;
  v_new_cd integer := 15;
  v_viral_boosted boolean := false;
  v_pool_added integer := 0;
  v_hard_cap_reached boolean := false;
BEGIN
  SELECT * INTO gs FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'global_stats_missing');
  END IF;

  v_prev_mode := COALESCE(gs.current_pacing_mode, 'normal');
  v_prev_total := COALESCE(gs.max_total_tickets, 100);
  v_hard_cap := GREATEST(100, COALESCE(gs.auto_pool_hard_cap, 150));
  v_threshold := GREATEST(
    100,
    CASE
      WHEN v_privileged AND p_viral_threshold IS NOT NULL THEN p_viral_threshold
      ELSE COALESCE(gs.viral_players_threshold, 1000)
    END
  );

  IF v_privileged AND p_now_msk IS NOT NULL THEN
    v_eff_ts := p_now_msk AT TIME ZONE 'Europe/Moscow';
  ELSE
    v_eff_ts := now() AT TIME ZONE 'Europe/Moscow';
  END IF;
  v_msk_date := v_eff_ts::date;
  v_msk_hour := EXTRACT(HOUR FROM v_eff_ts)::integer;

  -- Автопилот выключен вручную в /admin/
  IF NOT COALESCE(gs.auto_pilot_enabled, true) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'autopilot_disabled',
      'auto_pilot_enabled', false,
      'current_pacing_mode', v_prev_mode,
      'max_daily_tickets', gs.max_daily_tickets,
      'max_total_tickets', gs.max_total_tickets,
      'auto_pool_hard_cap', v_hard_cap,
      'rare_drop_bonus_pct', gs.rare_drop_bonus_pct,
      'duel_cooldown_sec', gs.duel_cooldown_sec,
      'viral_boosted', false,
      'pool_added', 0,
      'notify_admin', false
    );
  END IF;

  -- Строгий временной порог: автопилот работает только до 14 декабря 2026
  IF v_msk_date >= DATE '2026-12-14' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'after_cutoff_dec14',
      'auto_pilot_enabled', true,
      'current_pacing_mode', v_prev_mode,
      'max_daily_tickets', gs.max_daily_tickets,
      'max_total_tickets', gs.max_total_tickets,
      'auto_pool_hard_cap', v_hard_cap,
      'rare_drop_bonus_pct', gs.rare_drop_bonus_pct,
      'duel_cooldown_sec', gs.duel_cooldown_sec,
      'viral_boosted', false,
      'pool_added', 0,
      'notify_admin', false
    );
  END IF;

  -- Приток уникальных игроков за сегодня (МСК)
  IF v_privileged AND p_today_players_override IS NOT NULL THEN
    v_today_players := GREATEST(0, p_today_players_override);
  ELSE
    SELECT COALESCE(dm.players, 0)
    INTO v_today_players
    FROM public.daily_metrics dm
    WHERE dm.metric_date = v_msk_date;

    IF v_today_players = 0 THEN
      SELECT COUNT(*)::integer
      INTO v_today_players
      FROM public.users u
      WHERE (u.created_at AT TIME ZONE 'Europe/Moscow')::date = v_msk_date
        AND NOT public.is_sandbox_uid(u.uid);
    END IF;
  END IF;

  -- Ветка 1: ВИРУСНЫЙ РЕЖИМ ('viral')
  -- Дневной лимит разобран до 15:00 МСК И приток >= threshold
  IF v_msk_hour < 15
     AND COALESCE(gs.daily_tickets_issued, 0) >= GREATEST(1, COALESCE(gs.max_daily_tickets, 6))
     AND v_today_players >= v_threshold THEN

    v_new_mode := 'viral';
    v_new_daily := GREATEST(COALESCE(gs.max_daily_tickets, 6), 8);
    v_new_bonus := 0;
    v_new_cd := 15;

    IF v_prev_total < v_hard_cap THEN
      -- В одном дне не дублируем расширение без p_force_recheck (админ/тест)
      IF gs.last_viral_boost_date IS DISTINCT FROM v_msk_date OR (v_privileged AND p_force_recheck) THEN
        v_new_total := LEAST(v_hard_cap, v_prev_total + 10);
        v_pool_added := GREATEST(0, v_new_total - v_prev_total);
        v_viral_boosted := (v_pool_added > 0);
      ELSE
        v_new_total := v_prev_total;
      END IF;
    ELSE
      v_new_total := v_hard_cap;
      v_hard_cap_reached := true;
    END IF;

    UPDATE public.global_stats
    SET
      current_pacing_mode = v_new_mode,
      max_daily_tickets = v_new_daily,
      max_total_tickets = LEAST(v_hard_cap, v_new_total),
      rare_drop_bonus_pct = v_new_bonus,
      duel_cooldown_sec = v_new_cd,
      last_autopilot_eval_at = now(),
      last_viral_boost_date = CASE WHEN v_viral_boosted THEN v_msk_date ELSE last_viral_boost_date END,
      updated_at = now()
    WHERE id = 1
    RETURNING * INTO gs;

    RETURN jsonb_build_object(
      'ok', true,
      'reason', CASE WHEN v_hard_cap_reached THEN 'viral_hard_cap_reached' ELSE 'viral_boost' END,
      'auto_pilot_enabled', gs.auto_pilot_enabled,
      'current_pacing_mode', gs.current_pacing_mode,
      'max_daily_tickets', gs.max_daily_tickets,
      'max_total_tickets', gs.max_total_tickets,
      'auto_pool_hard_cap', v_hard_cap,
      'rare_drop_bonus_pct', gs.rare_drop_bonus_pct,
      'duel_cooldown_sec', gs.duel_cooldown_sec,
      'today_players', v_today_players,
      'viral_boosted', v_viral_boosted,
      'pool_added', v_pool_added,
      'hard_cap_reached', (gs.max_total_tickets >= v_hard_cap),
      'notify_admin', v_viral_boosted
    );
  END IF;

  -- Ветка 2: ТИХИЙ РЕЖИМ ('quiet')
  -- После 18:00 МСК выдано <= 1 билета И приток < 250 игроков
  IF v_msk_hour >= 18
     AND COALESCE(gs.daily_tickets_issued, 0) <= 1
     AND v_today_players < 250 THEN

    v_new_mode := 'quiet';
    v_new_daily := LEAST(6, GREATEST(4, COALESCE(gs.max_daily_tickets, 6)));
    v_new_total := LEAST(v_hard_cap, v_prev_total);
    v_new_bonus := 10;
    v_new_cd := 8;

    UPDATE public.global_stats
    SET
      current_pacing_mode = v_new_mode,
      max_daily_tickets = v_new_daily,
      max_total_tickets = v_new_total,
      rare_drop_bonus_pct = v_new_bonus,
      duel_cooldown_sec = v_new_cd,
      last_autopilot_eval_at = now(),
      updated_at = now()
    WHERE id = 1
    RETURNING * INTO gs;

    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'quiet_retention_boost',
      'auto_pilot_enabled', gs.auto_pilot_enabled,
      'current_pacing_mode', gs.current_pacing_mode,
      'max_daily_tickets', gs.max_daily_tickets,
      'max_total_tickets', gs.max_total_tickets,
      'auto_pool_hard_cap', v_hard_cap,
      'rare_drop_bonus_pct', gs.rare_drop_bonus_pct,
      'duel_cooldown_sec', gs.duel_cooldown_sec,
      'today_players', v_today_players,
      'viral_boosted', false,
      'pool_added', 0,
      'hard_cap_reached', (gs.max_total_tickets >= v_hard_cap),
      'notify_admin', false
    );
  END IF;

  -- Ветка 3: НОРМАЛЬНЫЙ РЕЖИМ ('normal')
  v_new_mode := 'normal';
  v_new_daily := CASE WHEN gs.last_viral_boost_date = v_msk_date THEN GREATEST(6, gs.max_daily_tickets) ELSE 6 END;
  v_new_total := LEAST(v_hard_cap, v_prev_total);
  v_new_bonus := 0;
  v_new_cd := 15;

  UPDATE public.global_stats
  SET
    current_pacing_mode = v_new_mode,
    max_daily_tickets = v_new_daily,
    max_total_tickets = v_new_total,
    rare_drop_bonus_pct = v_new_bonus,
    duel_cooldown_sec = v_new_cd,
    last_autopilot_eval_at = now(),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'normal_pacing',
    'auto_pilot_enabled', gs.auto_pilot_enabled,
    'current_pacing_mode', gs.current_pacing_mode,
    'max_daily_tickets', gs.max_daily_tickets,
    'max_total_tickets', gs.max_total_tickets,
    'auto_pool_hard_cap', v_hard_cap,
    'rare_drop_bonus_pct', gs.rare_drop_bonus_pct,
    'duel_cooldown_sec', gs.duel_cooldown_sec,
    'today_players', v_today_players,
    'viral_boosted', false,
    'pool_added', 0,
    'hard_cap_reached', (gs.max_total_tickets >= v_hard_cap),
    'notify_admin', false
  );
END;
$$;

-- 2. Подключаем динамический бонус rare_drop_bonus_pct из global_stats в mint_rare_movie_card_rpc
CREATE OR REPLACE FUNCTION public.mint_rare_movie_card_rpc(
  p_uid text,
  p_source text DEFAULT 'level3'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_src text := lower(trim(coalesce(p_source, 'level3')));
  u public.users%ROWTYPE;
  gs public.global_stats%ROWTYPE;
  prog jsonb;
  v_base_chance integer := 15;
  v_level_bonus integer := 0;
  v_autopilot_bonus integer := 0;
  v_final_chance integer := 15;
  v_roll numeric := 0;
  v_want_rarity text := 'rare';
  tpl public.rare_card_templates%ROWTYPE;
  t public.user_trophies%ROWTYPE;
BEGIN
  IF v_uid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'dropped', false, 'reason', 'invalid_uid');
  END IF;

  IF v_src IN ('level3', 'l3') THEN
    v_base_chance := 15;
  ELSIF v_src IN ('level5', 'l5') THEN
    v_base_chance := 35;
  ELSIF v_src IN ('til', 'ocean', 'ocean_til') THEN
    v_base_chance := 50;
  ELSE
    RETURN jsonb_build_object('ok', false, 'dropped', false, 'reason', 'invalid_source');
  END IF;

  INSERT INTO public.users (uid) VALUES (v_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  IF u.last_card_mint_at IS NOT NULL AND (now() - u.last_card_mint_at) < interval '15 seconds' THEN
    RETURN jsonb_build_object('ok', true, 'dropped', false, 'reason', 'cooldown');
  END IF;

  UPDATE public.users SET last_card_mint_at = now(), updated_at = now() WHERE uid = v_uid;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;
  v_autopilot_bonus := GREATEST(0, COALESCE(gs.rare_drop_bonus_pct, 0));

  prog := public.compute_collector_progress(v_uid);
  v_level_bonus := COALESCE((prog->>'rare_drop_bonus_pct')::integer, 0);
  v_final_chance := LEAST(95, v_base_chance + v_level_bonus + v_autopilot_bonus);

  v_roll := random() * 100.0;
  IF v_roll >= v_final_chance THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dropped', false,
      'reason', 'no_drop',
      'chance_pct', v_final_chance,
      'autopilot_bonus_pct', v_autopilot_bonus,
      'level_info', prog
    );
  END IF;

  v_roll := random() * 100.0;
  IF v_roll < 10.0 THEN
    v_want_rarity := 'legendary';
  ELSIF v_roll < 40.0 THEN
    v_want_rarity := 'epic';
  ELSE
    v_want_rarity := 'rare';
  END IF;

  SELECT * INTO tpl
  FROM public.rare_card_templates
  WHERE minted_count < max_supply
    AND rarity = v_want_rarity
  ORDER BY random()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO tpl
    FROM public.rare_card_templates
    WHERE minted_count < max_supply
    ORDER BY random()
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
      'level_info', prog
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

  RETURN jsonb_build_object(
    'ok', true,
    'dropped', true,
    'chance_pct', v_final_chance,
    'autopilot_bonus_pct', v_autopilot_bonus,
    'level_info', prog,
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
$$;

-- 3. Обновляем admin_update_config: добавляем p_auto_pilot_enabled и p_auto_pool_hard_cap
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean, integer, boolean, text);
DROP FUNCTION IF EXISTS public.admin_update_config(integer, integer, integer, boolean, integer, boolean, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.admin_update_config(
  p_win_every_n_hits integer,
  p_max_daily_tickets integer,
  p_max_premiere_winners integer,
  p_is_paused boolean,
  p_max_total_tickets integer DEFAULT NULL,
  p_require_pair_receipt boolean DEFAULT NULL,
  p_admin_notify_chat_ids text DEFAULT NULL,
  p_auto_pilot_enabled boolean DEFAULT NULL,
  p_auto_pool_hard_cap integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  v_clean_chats text;
  v_clean_cap integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_admin_notify_chat_ids IS NOT NULL THEN
    v_clean_chats := left(btrim(regexp_replace(p_admin_notify_chat_ids, '[^0-9,\-\s]', '', 'g')), 500);
  ELSE
    v_clean_chats := NULL;
  END IF;

  IF p_auto_pool_hard_cap IS NOT NULL THEN
    v_clean_cap := LEAST(500, GREATEST(100, p_auto_pool_hard_cap));
  ELSE
    v_clean_cap := NULL;
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
    auto_pilot_enabled = COALESCE(p_auto_pilot_enabled, auto_pilot_enabled),
    auto_pool_hard_cap = COALESCE(v_clean_cap, auto_pool_hard_cap),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO gs;

  RETURN jsonb_build_object('ok', true, 'stats', row_to_json(gs));
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_campaign_autopilot_rpc(timestamptz, integer, integer, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_rare_movie_card_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_config(integer, integer, integer, boolean, integer, boolean, text, boolean, integer) TO authenticated;
