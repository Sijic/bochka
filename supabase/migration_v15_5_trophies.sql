-- ============================================================================
-- БОЧКА v15.5: Личный «Зал славы (Коллекционер)», уровни за приглашения
-- и разблокируемый режим «Дуэль на фишки» (порог CHIP_DUEL_UNLOCK_INVITES = 3).
-- Не ломает экономику 4 обрывков билета, пул 100/6, замок pack_* и 152-ФЗ.
-- ============================================================================

-- 1. Официальные номерные карточки фильма (6 готовых WebP 30-50 КБ в public/cards/)
CREATE TABLE IF NOT EXISTS public.rare_card_templates (
  id text PRIMARY KEY,
  title text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('rare', 'epic', 'legendary')),
  image_url text NOT NULL,
  max_supply integer NOT NULL CHECK (max_supply > 0),
  minted_count integer NOT NULL DEFAULT 0 CHECK (minted_count >= 0)
);

ALTER TABLE public.rare_card_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_rare_card_templates" ON public.rare_card_templates;
CREATE POLICY "public_read_rare_card_templates"
  ON public.rare_card_templates
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_write_rare_card_templates" ON public.rare_card_templates;
CREATE POLICY "admin_write_rare_card_templates"
  ON public.rare_card_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.rare_card_templates (id, title, rarity, image_url, max_supply)
VALUES
  ('card_workshop_hall', 'Цех «Корпус Б» · Смена №1', 'rare', './public/cards/card_workshop_hall.webp', 100),
  ('card_boy_escape', 'Побег из 200-литровой бочки', 'rare', './public/cards/card_boy_escape.webp', 100),
  ('card_father_shadow', 'Отец у стальной колонны', 'rare', './public/cards/card_father_shadow.webp', 100),
  ('card_pastor_vigil', 'Пастор · Последнее слово', 'epic', './public/cards/card_pastor_vigil.webp', 50),
  ('card_barrel_eye', 'Взгляд сквозь крышку', 'epic', './public/cards/card_barrel_eye.webp', 50),
  ('card_til_north_sea', 'Тиль Швайгер · Северное море', 'legendary', './public/cards/card_til_north_sea.webp', 20)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  rarity = EXCLUDED.rarity,
  image_url = EXCLUDED.image_url,
  max_supply = EXCLUDED.max_supply;

-- 2. Личный Зал славы игрока (без публичной витрины — 152-ФЗ и без модерации)
CREATE TABLE IF NOT EXISTS public.user_trophies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid text NOT NULL,
  trophy_type text NOT NULL CHECK (trophy_type IN ('friend_barrel', 'movie_card')),
  barrel_id text NULL,
  template_id text NULL REFERENCES public.rare_card_templates(id) ON DELETE SET NULL,
  serial_number integer NULL,
  image_url text NOT NULL,
  label text NOT NULL,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'blogger', 'rare', 'epic', 'legendary')),
  won_from_name text NULL,
  locked_in_duel_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_trophies_owner_barrel
  ON public.user_trophies (owner_uid, barrel_id)
  WHERE barrel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_trophies_owner_created
  ON public.user_trophies (owner_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_trophies_locked_duel
  ON public.user_trophies (locked_in_duel_id)
  WHERE locked_in_duel_id IS NOT NULL;

ALTER TABLE public.user_trophies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_user_trophies" ON public.user_trophies;
CREATE POLICY "admin_all_user_trophies"
  ON public.user_trophies
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Защита от спама дропами редких карт
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_card_mint_at timestamptz NULL;

-- 3. Разделение режимов дуэлей ('classic' | 'chips') в duel_antes / duel_settlements
ALTER TABLE public.duel_antes
  ADD COLUMN IF NOT EXISTS duel_mode text NOT NULL DEFAULT 'classic' CHECK (duel_mode IN ('classic', 'chips')),
  ADD COLUMN IF NOT EXISTS ante_trophy_id uuid NULL REFERENCES public.user_trophies(id) ON DELETE SET NULL;

ALTER TABLE public.duel_settlements
  ADD COLUMN IF NOT EXISTS duel_mode text NOT NULL DEFAULT 'classic' CHECK (duel_mode IN ('classic', 'chips')),
  ADD COLUMN IF NOT EXISTS won_trophy_ids uuid[] NOT NULL DEFAULT '{}';

-- 4. Внутренний расчёт уровня коллекционера по реальным приглашённым друзьям
--    Константа порога: CHIP_DUEL_UNLOCK_INVITES = 3 (Уровень 3)
CREATE OR REPLACE FUNCTION public.compute_collector_progress(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_unlock_invites CONSTANT integer := 3;
  v_user_invites integer := 0;
  v_sc_invites integer := 0;
  v_ref_invites integer := 0;
  v_invites integer := 0;
  v_level integer := 1;
  v_title text := 'Коллекционер';
  v_drop_bonus integer := 0;
  v_unlocked boolean := false;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object(
      'invited_friends', 0,
      'level', 1,
      'level_title', 'Коллекционер',
      'chip_duel_unlock_invites', v_unlock_invites,
      'invites_remaining', v_unlock_invites,
      'chip_duel_unlocked', false,
      'rare_drop_bonus_pct', 0
    );
  END IF;

  SELECT COALESCE(u.friends_brought, 0)
  INTO v_user_invites
  FROM public.users u
  WHERE u.uid = v_uid;

  SELECT COUNT(DISTINCT sc.receiver_uid)::integer
  INTO v_sc_invites
  FROM public.social_connections sc
  WHERE sc.sender_uid = v_uid
    AND sc.receiver_uid <> v_uid
    AND NOT public.is_sandbox_uid(sc.receiver_uid);

  SELECT COUNT(DISTINCT u2.uid)::integer
  INTO v_ref_invites
  FROM public.users u2
  WHERE u2.referred_by_uid = v_uid
    AND u2.uid <> v_uid
    AND NOT public.is_sandbox_uid(u2.uid);

  v_invites := GREATEST(COALESCE(v_user_invites, 0), COALESCE(v_sc_invites, 0), COALESCE(v_ref_invites, 0));

  IF v_invites >= 5 THEN
    v_level := 4;
    v_title := 'Хранитель Зала';
    v_unlocked := true;
    v_drop_bonus := 10;
  ELSIF v_invites >= v_unlock_invites THEN
    v_level := 3;
    v_title := 'Игрок на фишки';
    v_unlocked := true;
    v_drop_bonus := 0;
  ELSIF v_invites >= 1 THEN
    v_level := 2;
    v_title := 'Охотник';
    v_unlocked := false;
    v_drop_bonus := 0;
  ELSE
    v_level := 1;
    v_title := 'Коллекционер';
    v_unlocked := false;
    v_drop_bonus := 0;
  END IF;

  RETURN jsonb_build_object(
    'invited_friends', v_invites,
    'level', v_level,
    'level_title', v_title,
    'chip_duel_unlock_invites', v_unlock_invites,
    'invites_remaining', GREATEST(0, v_unlock_invites - v_invites),
    'chip_duel_unlocked', v_unlocked,
    'rare_drop_bonus_pct', v_drop_bonus
  );
END;
$$;

-- 5. RPC: Собрать фото-фишку при первом вскрытии чужой бочки (bl_* -> 'blogger')
CREATE OR REPLACE FUNCTION public.collect_barrel_trophy_rpc(
  p_uid text,
  p_barrel_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_bid text := trim(coalesce(p_barrel_id, ''));
  b public.barrels%ROWTYPE;
  t public.user_trophies%ROWTYPE;
  v_rarity text := 'common';
  v_img text := './public/sprites/hero_boy_live.webp';
  v_label text := 'Друг из Цеха';
  v_is_blogger boolean := false;
  v_inserted boolean := false;
BEGIN
  IF v_uid = '' OR v_bid = '' OR public.is_sandbox_uid(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = v_bid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  -- Собственную бочку нельзя положить к себе в Зал славы
  IF b.sender_uid IS NOT NULL AND b.sender_uid <> '' AND b.sender_uid = v_uid THEN
    RETURN jsonb_build_object('ok', true, 'collected', false, 'reason', 'self_barrel_skipped');
  END IF;

  -- Проверяем, является ли бочка блогерской (bl_* / is_blogger_seed / mode='blogger')
  IF lower(COALESCE(b.broadcast_prefix, '')) LIKE 'bl%'
     OR lower(COALESCE(b.mode, '')) = 'blogger'
     OR lower(v_bid) LIKE 'bl_%' THEN
    v_is_blogger := true;
  ELSIF b.sender_uid IS NOT NULL AND b.sender_uid <> '' THEN
    SELECT COALESCE(u.is_blogger_seed, false)
    INTO v_is_blogger
    FROM public.users u
    WHERE u.uid = b.sender_uid;
  END IF;

  v_rarity := CASE WHEN COALESCE(v_is_blogger, false) THEN 'blogger' ELSE 'common' END;
  v_img := COALESCE(NULLIF(trim(COALESCE(b.photo_url, '')), ''), './public/sprites/hero_boy_live.webp');
  v_label := left(COALESCE(NULLIF(trim(COALESCE(b.sender_name, '')), ''), 'Друг из Цеха'), 48);

  INSERT INTO public.user_trophies (
    owner_uid, trophy_type, barrel_id, image_url, label, rarity
  )
  VALUES (
    v_uid, 'friend_barrel', v_bid, v_img, v_label, v_rarity
  )
  ON CONFLICT (owner_uid, barrel_id) WHERE barrel_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO t;

  IF t.id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT * INTO t
    FROM public.user_trophies
    WHERE owner_uid = v_uid AND barrel_id = v_bid
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'collected', v_inserted,
    'already_collected', NOT v_inserted,
    'trophy', jsonb_build_object(
      'id', t.id,
      'trophy_type', t.trophy_type,
      'barrel_id', t.barrel_id,
      'image_url', t.image_url,
      'label', t.label,
      'rarity', t.rarity,
      'won_from_name', t.won_from_name,
      'created_at', t.created_at
    )
  );
END;
$$;

-- 6. RPC: Шанс дропа официальной номерной карты фильма (Ур. 3 = 15%, Ур. 5 = 35%, Тиль = 50%; Ур. 4 Зала +10%)
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
  prog jsonb;
  v_base_chance integer := 15;
  v_bonus integer := 0;
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

  -- Защита от спама (не чаще 1 броска за 15 секунд)
  IF u.last_card_mint_at IS NOT NULL AND (now() - u.last_card_mint_at) < interval '15 seconds' THEN
    RETURN jsonb_build_object('ok', true, 'dropped', false, 'reason', 'cooldown');
  END IF;

  UPDATE public.users SET last_card_mint_at = now(), updated_at = now() WHERE uid = v_uid;

  prog := public.compute_collector_progress(v_uid);
  v_bonus := COALESCE((prog->>'rare_drop_bonus_pct')::integer, 0);
  v_final_chance := LEAST(95, v_base_chance + v_bonus);

  v_roll := random() * 100.0;
  IF v_roll >= v_final_chance THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dropped', false,
      'reason', 'no_drop',
      'chance_pct', v_final_chance,
      'level_info', prog
    );
  END IF;

  -- Взвешенный выбор редкости: 60% rare, 30% epic, 10% legendary
  v_roll := random() * 100.0;
  IF v_roll < 10.0 THEN
    v_want_rarity := 'legendary';
  ELSIF v_roll < 40.0 THEN
    v_want_rarity := 'epic';
  ELSE
    v_want_rarity := 'rare';
  END IF;

  -- Атомарная блокировка шаблона с остатком тиража (SELECT FOR UPDATE)
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

-- 7. RPC: Получить личный Зал славы игрока + уровень + прогресс до Дуэли на фишки
CREATE OR REPLACE FUNCTION public.get_hall_of_fame_rpc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  prog jsonb;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  -- Авторазблокировка зависших ставок старше 5 минут (если дуэль оборвалась по таймауту)
  UPDATE public.user_trophies ut
  SET locked_in_duel_id = NULL
  WHERE ut.owner_uid = v_uid
    AND ut.locked_in_duel_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.duel_antes da
      WHERE da.round_key = ut.locked_in_duel_id
        AND da.created_at > now() - interval '5 minutes'
    );

  prog := public.compute_collector_progress(v_uid);

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ut.id,
          'trophy_type', ut.trophy_type,
          'barrel_id', ut.barrel_id,
          'template_id', ut.template_id,
          'serial_number', ut.serial_number,
          'max_supply', rc.max_supply,
          'image_url', ut.image_url,
          'label', ut.label,
          'rarity', ut.rarity,
          'won_from_name', ut.won_from_name,
          'locked_in_duel_id', ut.locked_in_duel_id,
          'created_at', ut.created_at
        )
        ORDER BY ut.created_at DESC
      ),
      '[]'::jsonb
    ),
    COUNT(*)::integer
  INTO v_items, v_count
  FROM public.user_trophies ut
  LEFT JOIN public.rare_card_templates rc ON rc.id = ut.template_id
  WHERE ut.owner_uid = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'owner_uid', v_uid,
    'total_count', v_count,
    'invited_friends', COALESCE((prog->>'invited_friends')::integer, 0),
    'level', COALESCE((prog->>'level')::integer, 1),
    'level_title', COALESCE(prog->>'level_title', 'Коллекционер'),
    'chip_duel_unlock_invites', COALESCE((prog->>'chip_duel_unlock_invites')::integer, 3),
    'invites_remaining', COALESCE((prog->>'invites_remaining')::integer, 3),
    'chip_duel_unlocked', COALESCE((prog->>'chip_duel_unlocked')::boolean, false),
    'rare_drop_bonus_pct', COALESCE((prog->>'rare_drop_bonus_pct')::integer, 0),
    'trophies', v_items
  );
END;
$$;

-- 8. Обновление start_duel_ante_rpc: разделение 'classic' (любой уровень) и 'chips' (жёсткий порог Ур. 3 + свободная фишка)
DROP FUNCTION IF EXISTS public.start_duel_ante_rpc(text, text, text);
DROP FUNCTION IF EXISTS public.start_duel_ante_rpc(text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.start_duel_ante_rpc(
  p_uid text,
  p_room_id text,
  p_round_key text,
  p_duel_mode text DEFAULT 'classic',
  p_ante_trophy_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_rk text := trim(coalesce(p_round_key, ''));
  v_mode text := lower(trim(coalesce(p_duel_mode, 'classic')));
  u public.users%ROWTYPE;
  tr public.user_trophies%ROWTYPE;
  prog jsonb;
  ins_count integer := 0;
BEGIN
  IF public.is_sandbox_uid(v_uid) OR v_rk = '' OR length(v_rk) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  IF v_mode NOT IN ('classic', 'chips') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_mode');
  END IF;

  -- ЖЁСТКАЯ СЕРВЕРНАЯ ПРОВЕРКА ДЛЯ РЕЖИМА 'chips'
  IF v_mode = 'chips' THEN
    prog := public.compute_collector_progress(v_uid);
    IF NOT COALESCE((prog->>'chip_duel_unlocked')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'level_required',
        'required_level', 3,
        'required_invites', COALESCE((prog->>'chip_duel_unlock_invites')::integer, 3),
        'invited_friends', COALESCE((prog->>'invited_friends')::integer, 0),
        'invites_remaining', COALESCE((prog->>'invites_remaining')::integer, 3)
      );
    END IF;

    IF p_ante_trophy_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'trophy_required');
    END IF;

    -- Разблокируем протухшие (>5 мин) ставки этого игрока перед проверкой
    UPDATE public.user_trophies ut
    SET locked_in_duel_id = NULL
    WHERE ut.owner_uid = v_uid
      AND ut.locked_in_duel_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.duel_antes da
        WHERE da.round_key = ut.locked_in_duel_id
          AND da.created_at > now() - interval '5 minutes'
      );

    SELECT * INTO tr
    FROM public.user_trophies
    WHERE id = p_ante_trophy_id
      AND owner_uid = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'trophy_not_found');
    END IF;

    IF tr.locked_in_duel_id IS NOT NULL AND tr.locked_in_duel_id <> v_rk THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'trophy_locked');
    END IF;
  END IF;

  PERFORM public.get_or_create_player_profile(v_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = v_uid FOR UPDATE;

  INSERT INTO public.duel_antes (round_key, uid, room_id, duel_mode, ante_trophy_id)
  VALUES (
    v_rk,
    v_uid,
    left(COALESCE(p_room_id, ''), 32),
    v_mode,
    CASE WHEN v_mode = 'chips' THEN p_ante_trophy_id ELSE NULL END
  )
  ON CONFLICT (round_key, uid) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_staked', true,
      'duel_mode', v_mode,
      'lives', u.lives,
      'premiere_points', u.premiere_points
    );
  END IF;

  IF u.lives <= 0 THEN
    DELETE FROM public.duel_antes WHERE round_key = v_rk AND uid = v_uid;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_lives', 'lives', 0);
  END IF;

  IF v_mode = 'chips' THEN
    UPDATE public.user_trophies
    SET locked_in_duel_id = v_rk
    WHERE id = p_ante_trophy_id AND owner_uid = v_uid;
  END IF;

  UPDATE public.users
  SET
    lives = lives - 1,
    lives_updated_at = CASE WHEN lives = 3 THEN now() ELSE lives_updated_at END,
    has_played_solo = true,
    premiere_points = premiere_points + 40,
    updated_at = now()
  WHERE uid = v_uid
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'duel_mode', v_mode,
    'ante_trophy_id', CASE WHEN v_mode = 'chips' THEN p_ante_trophy_id ELSE NULL END,
    'lives', u.lives,
    'premiere_points', u.premiere_points
  );
END;
$$;

-- 9. RPC: Разблокировка фишек при отмене или таймауте дуэли
CREATE OR REPLACE FUNCTION public.cancel_duel_chips_rpc(
  p_uid text,
  p_round_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := trim(coalesce(p_uid, ''));
  v_rk text := trim(coalesce(p_round_key, ''));
  v_is_participant boolean := false;
  v_unlocked_cnt integer := 0;
BEGIN
  IF v_uid = '' OR v_rk = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  -- Уже рассчитанный раунд нельзя откатывать
  IF EXISTS (SELECT 1 FROM public.duel_settlements WHERE round_key = v_rk) THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true, 'unlocked', 0);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.duel_antes WHERE round_key = v_rk AND uid = v_uid
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    -- Разблокируем хотя бы собственные зависшие фишки этого игрока в этом round_key
    UPDATE public.user_trophies
    SET locked_in_duel_id = NULL
    WHERE locked_in_duel_id = v_rk AND owner_uid = v_uid;
    GET DIAGNOSTICS v_unlocked_cnt = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'unlocked', v_unlocked_cnt);
  END IF;

  -- Участник отменяет/таймаутит незавершённую дуэль: разблокируем фишки всех сторон
  UPDATE public.user_trophies
  SET locked_in_duel_id = NULL
  WHERE locked_in_duel_id = v_rk;
  GET DIAGNOSTICS v_unlocked_cnt = ROW_COUNT;

  DELETE FROM public.duel_antes WHERE round_key = v_rk;

  RETURN jsonb_build_object('ok', true, 'unlocked', v_unlocked_cnt);
END;
$$;

-- 10. Обновление settle_duel_round: атомарная передача фишки проигравшего победителю + won_from_name
CREATE OR REPLACE FUNCTION public.settle_duel_round(
  p_room_id text,
  p_round_key text,
  p_winner_uid text,
  p_player_uids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rk text := trim(coalesce(p_round_key, ''));
  v_winner text := trim(coalesce(p_winner_uid, ''));
  ins_count integer := 0;
  v_valid_uids text[];
  n_players integer := 0;
  pot_lives integer := 0;
  score_bonus numeric(6,2) := 0.00;
  pts_bonus integer := 120;
  golden_drop boolean := false;
  v_is_chips boolean := false;
  v_won_ids uuid[] := '{}';
  v_transferred jsonb := '[]'::jsonb;
  rec record;
  v_loser_name text;
  v_prog jsonb;
  v_tr public.user_trophies%ROWTYPE;
  v_max_sup integer;
  w public.users%ROWTYPE;
BEGIN
  IF v_rk = '' OR public.is_sandbox_uid(v_winner) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT da.uid), ARRAY[]::text[])
  INTO v_valid_uids
  FROM public.duel_antes da
  WHERE da.round_key = v_rk
    AND (p_player_uids IS NULL OR da.uid = ANY(p_player_uids));

  n_players := COALESCE(array_length(v_valid_uids, 1), 0);
  IF n_players < 2 OR NOT (v_winner = ANY(v_valid_uids)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_unpaid_participants');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.duel_antes da
    WHERE da.round_key = v_rk AND da.duel_mode = 'chips'
  ) INTO v_is_chips;

  -- Жёсткая повторная проверка для 'chips': у всех сторон Ур. 3+ и реальные фишки
  IF v_is_chips THEN
    FOR rec IN
      SELECT da.uid, da.ante_trophy_id, da.duel_mode
      FROM public.duel_antes da
      WHERE da.round_key = v_rk AND da.uid = ANY(v_valid_uids)
    LOOP
      v_prog := public.compute_collector_progress(rec.uid);
      IF NOT COALESCE((v_prog->>'chip_duel_unlocked')::boolean, false)
         OR rec.duel_mode <> 'chips'
         OR rec.ante_trophy_id IS NULL THEN
        UPDATE public.user_trophies SET locked_in_duel_id = NULL WHERE locked_in_duel_id = v_rk;
        RETURN jsonb_build_object('ok', false, 'reason', 'level_required');
      END IF;
    END LOOP;
  END IF;

  n_players := LEAST(3, n_players);
  pot_lives := n_players;

  INSERT INTO public.duel_settlements (round_key, room_id, winner_uid, players_count, pot_lives, duel_mode)
  VALUES (v_rk, left(COALESCE(p_room_id, ''), 32), v_winner, n_players, pot_lives, CASE WHEN v_is_chips THEN 'chips' ELSE 'classic' END)
  ON CONFLICT (round_key) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    SELECT * INTO w FROM public.users WHERE uid = v_winner;
    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'duel_mode', CASE WHEN v_is_chips THEN 'chips' ELSE 'classic' END,
      'pot_lives', pot_lives,
      'winner_lives', COALESCE(w.lives, 0),
      'winner_score', COALESCE(w.premiere_score, 0),
      'winner_points', COALESCE(w.premiere_points, 0),
      'has_pending_ticket', COALESCE(w.has_pending_ticket, false),
      'transferred_trophies', '[]'::jsonb
    );
  END IF;

  -- Передача фишек в режиме 'chips'
  IF v_is_chips THEN
    FOR rec IN
      SELECT da.uid, da.ante_trophy_id
      FROM public.duel_antes da
      WHERE da.round_key = v_rk
        AND da.uid = ANY(v_valid_uids)
        AND da.ante_trophy_id IS NOT NULL
    LOOP
      IF rec.uid = v_winner THEN
        -- Своя фишка победителя просто разблокируется
        UPDATE public.user_trophies
        SET locked_in_duel_id = NULL
        WHERE id = rec.ante_trophy_id AND owner_uid = v_winner;
      ELSE
        SELECT COALESCE(NULLIF(trim(u2.display_name), ''), NULLIF(trim(u2.tg_username), ''), 'Соперник')
        INTO v_loser_name
        FROM public.users u2
        WHERE u2.uid = rec.uid;

        -- Если у победителя уже есть такая же barrel_id фишка, сбрасываем barrel_id на NULL чтобы не конфликтовать с unique index
        UPDATE public.user_trophies ut
        SET
          owner_uid = v_winner,
          barrel_id = CASE
            WHEN ut.barrel_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.user_trophies ex
              WHERE ex.owner_uid = v_winner AND ex.barrel_id = ut.barrel_id AND ex.id <> ut.id
            ) THEN NULL
            ELSE ut.barrel_id
          END,
          won_from_name = left(COALESCE(v_loser_name, 'Соперник'), 48),
          locked_in_duel_id = NULL
        WHERE ut.id = rec.ante_trophy_id
          AND ut.owner_uid = rec.uid
        RETURNING * INTO v_tr;

        IF v_tr.id IS NOT NULL THEN
          v_won_ids := array_append(v_won_ids, v_tr.id);
          SELECT rc.max_supply INTO v_max_sup FROM public.rare_card_templates rc WHERE rc.id = v_tr.template_id;
          v_transferred := v_transferred || jsonb_build_array(
            jsonb_build_object(
              'id', v_tr.id,
              'trophy_type', v_tr.trophy_type,
              'template_id', v_tr.template_id,
              'serial_number', v_tr.serial_number,
              'max_supply', v_max_sup,
              'image_url', v_tr.image_url,
              'label', v_tr.label,
              'rarity', v_tr.rarity,
              'won_from_name', v_tr.won_from_name
            )
          );
        END IF;
      END IF;
    END LOOP;

    -- Подчищаем любые оставшиеся блокировки этого round_key
    UPDATE public.user_trophies SET locked_in_duel_id = NULL WHERE locked_in_duel_id = v_rk;
    UPDATE public.duel_settlements SET won_trophy_ids = v_won_ids WHERE round_key = v_rk;
  END IF;

  UPDATE public.users
  SET duels_played = duels_played + 1, updated_at = now()
  WHERE uid = ANY(v_valid_uids);

  IF n_players >= 3 THEN
    score_bonus := 0.25;
    pts_bonus := 450;
    IF random() < 0.08 AND public.try_reserve_ticket_slot(false) THEN
      golden_drop := true;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + pot_lives,
    lives_updated_at = CASE WHEN lives + pot_lives >= 3 THEN now() ELSE lives_updated_at END,
    duels_won = duels_won + 1,
    premiere_points = premiere_points + pts_bonus,
    premiere_score = CASE
      WHEN premiere_won THEN 100.00
      WHEN friends_brought >= 3 AND (kp_verified OR tickets_gifted >= 1) THEN LEAST(99.90, premiere_score + score_bonus)
      ELSE LEAST(99.40, premiere_score + score_bonus)
    END,
    has_pending_ticket = (has_pending_ticket OR golden_drop),
    updated_at = now()
  WHERE uid = v_winner
  RETURNING * INTO w;

  RETURN jsonb_build_object(
    'ok', true,
    'duel_mode', CASE WHEN v_is_chips THEN 'chips' ELSE 'classic' END,
    'pot_lives', pot_lives,
    'score_bonus', score_bonus,
    'points_bonus', pts_bonus,
    'golden_ticket_dropped', golden_drop,
    'winner_lives', w.lives,
    'winner_score', w.premiere_score,
    'winner_points', w.premiere_points,
    'has_pending_ticket', w.has_pending_ticket,
    'transferred_trophies', v_transferred
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_collector_progress(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_barrel_trophy_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_rare_movie_card_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hall_of_fame_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_duel_ante_rpc(text, text, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_duel_chips_rpc(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_duel_round(text, text, text, text[]) TO anon, authenticated;
