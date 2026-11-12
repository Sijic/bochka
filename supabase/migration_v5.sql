-- ============================================================================
-- БОЧКА v5.0 MIGRATION:
-- 1. Социальный граф (social_connections), дедупликация друзей и анти-фарм +2 ❤️
-- 2. Авто-роутинг повторных ссылок в синхронную дуэль «НА СЧЁТ ТРИ!» (2–3 игрока)
-- 3. Атомарный расчёт банка дуэлей (1 RPC на старт + 1 RPC на финал, 0 спама в БД)
-- 4. Уровни 1..8 (от 3 до 10 бочек) + Режим 9+ «Блиц на время и очки»
-- 5. Асимптота последнего процента (Near-Miss 99.5%) + Лига ТОП-10 по очкам на Премьеру
-- 6. Бонусы очков и жизней за Трейлер, Кинопоиск, Билеты друзьям и все соцсети (TG/WA/VK/IG)
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS has_played_solo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS premiere_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tickets_gifted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duels_won integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duels_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trailer_rewarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kp_click_rewarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_social_mask text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS daily_social_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS trailer_ref_by text;

CREATE INDEX IF NOT EXISTS idx_users_leaderboard
  ON public.users (premiere_points DESC, premiere_score DESC, friends_brought DESC);

-- Таблица связей между друзьями («Твои люди в цеху» + защита от повторных соло-открыток)
CREATE TABLE IF NOT EXISTS public.social_connections (
  sender_uid text NOT NULL,
  receiver_uid text NOT NULL,
  sender_tg_id text,
  receiver_tg_id text,
  receiver_name text NOT NULL DEFAULT '',
  receiver_username text,
  opened_barrel boolean NOT NULL DEFAULT false,
  duels_together integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sender_uid, receiver_uid)
);

CREATE INDEX IF NOT EXISTS idx_social_conn_sender ON public.social_connections (sender_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conn_pair_tg ON public.social_connections (sender_tg_id, receiver_tg_id);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_social_connections" ON public.social_connections;
CREATE POLICY "admin_all_social_connections" ON public.social_connections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Идемпотентные таблицы ставок и расчёта раундов «НА СЧЁТ ТРИ!»
CREATE TABLE IF NOT EXISTS public.duel_antes (
  round_key text NOT NULL,
  uid text NOT NULL,
  room_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_key, uid)
);

CREATE TABLE IF NOT EXISTS public.duel_settlements (
  round_key text PRIMARY KEY,
  room_id text NOT NULL,
  winner_uid text NOT NULL,
  players_count smallint NOT NULL DEFAULT 2,
  pot_lives integer NOT NULL DEFAULT 2,
  settled_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.duel_antes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_duel_antes" ON public.duel_antes;
CREATE POLICY "admin_all_duel_antes" ON public.duel_antes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_duel_settlements" ON public.duel_settlements;
CREATE POLICY "admin_all_duel_settlements" ON public.duel_settlements
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- ОБНОВЛЁННЫЙ ПРОФИЛЬ ИГРОКА (возвращает уровень, очки Премьеры, дуэли и флаги)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_or_create_player_profile(
  p_uid text,
  p_tg_id text DEFAULT NULL,
  p_tg_username text DEFAULT NULL,
  p_display_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  inserted_count int := 0;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_uid');
  END IF;

  INSERT INTO public.users (uid, tg_user_id, tg_username, display_name, lives)
  VALUES (
    trim(p_uid),
    NULLIF(trim(COALESCE(p_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_tg_username, '')), ''),
    COALESCE(p_display_name, ''),
    3
  )
  ON CONFLICT (uid) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    PERFORM public.bump_daily_metric('players', 1);
  END IF;

  UPDATE public.users
  SET
    tg_user_id = COALESCE(NULLIF(trim(COALESCE(p_tg_id, '')), ''), tg_user_id),
    tg_username = COALESCE(NULLIF(trim(COALESCE(p_tg_username, '')), ''), tg_username),
    display_name = CASE WHEN length(trim(COALESCE(p_display_name, ''))) > 0 THEN trim(p_display_name) ELSE display_name END,
    daily_shares_count = CASE WHEN daily_shares_date < CURRENT_DATE THEN 0 ELSE daily_shares_count END,
    daily_shares_date = CURRENT_DATE,
    daily_social_mask = CASE WHEN daily_social_date < CURRENT_DATE THEN '' ELSE daily_social_mask END,
    daily_social_date = CURRENT_DATE,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'lives', u.lives,
    'premiere_score', u.premiere_score,
    'premiere_points', u.premiere_points,
    'current_level', u.current_level,
    'has_played_solo', u.has_played_solo,
    'tickets_gifted', u.tickets_gifted,
    'duels_won', u.duels_won,
    'duels_played', u.duels_played,
    'trailer_rewarded', u.trailer_rewarded,
    'kp_click_rewarded', u.kp_click_rewarded,
    'daily_social_mask', u.daily_social_mask,
    'premiere_won', u.premiere_won,
    'premiere_confirmed', u.premiere_confirmed,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'has_pending_ticket', u.has_pending_ticket,
    'kp_verified', u.kp_verified,
    'kp_screenshot_url', COALESCE(u.kp_screenshot_url, ''),
    'packed_count', u.packed_count,
    'friends_brought', u.friends_brought,
    'daily_shares_count', u.daily_shares_count,
    'easter_egg_claimed', u.easter_egg_claimed,
    'easter_egg_best_taps', u.easter_egg_best_taps,
    'easter_egg_gift_won', u.easter_egg_gift_won
  );
END;
$$;

-- ============================================================================
-- ШАГ 8.1: ПРОВЕРКА ВХОДЯЩЕЙ ССЫЛКИ БОЧКИ НА ПОВТОРНУЮ СВЯЗЬ -> АВТО-ДУЭЛЬ
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_barrel_entry_routing(
  p_barrel_id text,
  p_viewer_uid text,
  p_viewer_tg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
  v public.users%ROWTYPE;
  already_connected boolean := false;
  viewer_played boolean := false;
  is_self boolean := false;
  room_code text := '';
BEGIN
  SELECT * INTO b FROM public.barrels WHERE short_id = trim(COALESCE(p_barrel_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_viewer_uid IS NOT NULL AND length(trim(p_viewer_uid)) >= 2 THEN
    SELECT * INTO v FROM public.users WHERE uid = trim(p_viewer_uid);
    IF FOUND THEN
      viewer_played := v.has_played_solo;
    END IF;
  END IF;

  is_self := (
    (b.sender_uid IS NOT NULL AND b.sender_uid = trim(COALESCE(p_viewer_uid, '')))
    OR (b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> '' AND b.sender_tg_id = trim(COALESCE(p_viewer_tg_id, '')))
  );

  IF NOT is_self AND b.sender_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.social_connections sc
      WHERE (sc.sender_uid = b.sender_uid AND sc.receiver_uid = trim(COALESCE(p_viewer_uid, '')))
         OR (sc.sender_uid = trim(COALESCE(p_viewer_uid, '')) AND sc.receiver_uid = b.sender_uid)
         OR (
           b.sender_tg_id IS NOT NULL AND b.sender_tg_id <> ''
           AND p_viewer_tg_id IS NOT NULL AND trim(p_viewer_tg_id) <> ''
           AND (
             (sc.sender_tg_id = b.sender_tg_id AND sc.receiver_tg_id = trim(p_viewer_tg_id))
             OR (sc.sender_tg_id = trim(p_viewer_tg_id) AND sc.receiver_tg_id = b.sender_tg_id)
           )
         )
    ) INTO already_connected;
  END IF;

  room_code := substr(md5(COALESCE(b.short_id, '') || ':' || CURRENT_DATE::text), 1, 7);

  RETURN jsonb_build_object(
    'ok', true,
    'is_self', is_self,
    'already_connected', already_connected,
    'viewer_has_played_solo', viewer_played,
    'should_route_to_duel', (NOT is_self AND (already_connected OR viewer_played)),
    'sender_uid', COALESCE(b.sender_uid, ''),
    'sender_tg_id', COALESCE(b.sender_tg_id, ''),
    'sender_name', COALESCE(b.sender_name, ''),
    'suggested_room_id', room_code
  );
END;
$$;

-- ============================================================================
-- ШАГ 8.2 (ТРИГГЕР А): ДРУГ НАЖАЛ СТАРТ ПОИСКА БОЧКИ -> ЗАПИСЬ СВЯЗИ + СТРОГО 1 РАЗ +2 ❤️
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_barrel_search_started(
  p_barrel_id text,
  p_opener_uid text,
  p_opener_tg_id text DEFAULT NULL,
  p_opener_username text DEFAULT NULL,
  p_opener_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.barrels%ROWTYPE;
  opener_row public.users%ROWTYPE;
  sender_row public.users%ROWTYPE;
  was_solo_virgin boolean := false;
  credited_lives integer := 0;
  ledger_inserted integer := 0;
BEGIN
  IF p_barrel_id IS NULL OR p_opener_uid IS NULL OR length(trim(p_opener_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO b FROM public.barrels WHERE short_id = trim(p_barrel_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'barrel_not_found');
  END IF;

  PERFORM public.get_or_create_player_profile(p_opener_uid, p_opener_tg_id, p_opener_username, p_opener_name);
  SELECT * INTO opener_row FROM public.users WHERE uid = trim(p_opener_uid) FOR UPDATE;

  was_solo_virgin := NOT opener_row.has_played_solo;

  -- Фиксируем, что открывший уже зашёл в цех (повторные реферальные +2 ❤️ больше никому не даст!)
  UPDATE public.users
  SET has_played_solo = true, updated_at = now()
  WHERE uid = trim(p_opener_uid);

  IF b.sender_uid IS NULL OR length(trim(b.sender_uid)) < 2 OR b.sender_uid = trim(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', true, 'is_self', true, 'credited_lives', 0);
  END IF;

  PERFORM public.get_or_create_player_profile(b.sender_uid, b.sender_tg_id, b.sender_username, b.sender_name);

  -- Записываем двустороннюю связь друзей («Твои люди в цеху»)
  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    b.sender_uid,
    trim(p_opener_uid),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(p_opener_name, ''))) > 0 THEN left(trim(p_opener_name), 40) ELSE 'Друг из Цеха' END,
    NULLIF(trim(COALESCE(p_opener_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    receiver_tg_id = COALESCE(EXCLUDED.receiver_tg_id, public.social_connections.receiver_tg_id),
    receiver_name = CASE WHEN EXCLUDED.receiver_name <> 'Друг из Цеха' THEN EXCLUDED.receiver_name ELSE public.social_connections.receiver_name END,
    receiver_username = COALESCE(EXCLUDED.receiver_username, public.social_connections.receiver_username),
    updated_at = now();

  INSERT INTO public.social_connections (
    sender_uid, receiver_uid, sender_tg_id, receiver_tg_id, receiver_name, receiver_username, opened_barrel, updated_at
  )
  VALUES (
    trim(p_opener_uid),
    b.sender_uid,
    NULLIF(trim(COALESCE(p_opener_tg_id, '')), ''),
    NULLIF(trim(COALESCE(b.sender_tg_id, '')), ''),
    CASE WHEN length(trim(COALESCE(b.sender_name, ''))) > 0 THEN left(trim(b.sender_name), 40) ELSE 'Автор бочки' END,
    NULLIF(trim(COALESCE(b.sender_username, '')), ''),
    false,
    now()
  )
  ON CONFLICT (sender_uid, receiver_uid) DO UPDATE SET
    updated_at = now();

  -- Начисляем +2 жизни и +400 очков Премьеры СТРОГО ОДИН РАЗ за нового игрока (was_solo_virgin == true)!
  IF was_solo_virgin THEN
    INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
    VALUES (b.short_id, trim(p_opener_uid))
    ON CONFLICT (barrel_id, opener_uid) DO NOTHING;
    GET DIAGNOSTICS ledger_inserted = ROW_COUNT;

    IF ledger_inserted > 0 THEN
      credited_lives := 2;
      UPDATE public.users
      SET
        lives = lives + 2,
        friends_brought = friends_brought + 1,
        premiere_points = premiere_points + 400,
        updated_at = now()
      WHERE uid = b.sender_uid
      RETURNING * INTO sender_row;
    END IF;
  ELSE
    SELECT * INTO sender_row FROM public.users WHERE uid = b.sender_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'credited_lives', credited_lives,
    'was_new_player', was_solo_virgin,
    'sender_uid', b.sender_uid,
    'sender_tg_id', COALESCE(sender_row.tg_user_id, b.sender_tg_id, ''),
    'sender_lives', COALESCE(sender_row.lives, 0)
  );
END;
$$;

-- Обновляем финальную фиксацию вскрытия бочки (чтобы не дублировать +2 ❤️ после Триггера А, но отметить opened_barrel = true и дать +150 очков спасателю)
CREATE OR REPLACE FUNCTION public.credit_friend_opened_lives(
  p_barrel_id text,
  p_sender_uid text,
  p_opener_uid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer := 0;
  opener_virgin boolean := false;
  new_lives integer := 0;
  sender_tg text := '';
BEGIN
  IF p_barrel_id IS NULL OR p_opener_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'credited', false);
  END IF;

  UPDATE public.barrels SET opens_count = opens_count + 1 WHERE short_id = trim(p_barrel_id);
  PERFORM public.bump_daily_metric('barrels_opened', 1);

  SELECT NOT has_played_solo INTO opener_virgin FROM public.users WHERE uid = trim(p_opener_uid);

  UPDATE public.users
  SET
    has_played_solo = true,
    premiere_points = premiere_points + 150,
    updated_at = now()
  WHERE uid = trim(p_opener_uid);

  IF p_sender_uid IS NULL OR length(trim(p_sender_uid)) < 2 OR trim(p_sender_uid) = trim(p_opener_uid) THEN
    RETURN jsonb_build_object('ok', true, 'credited', false, 'reason', 'self_or_empty_sender');
  END IF;

  UPDATE public.social_connections
  SET opened_barrel = true, updated_at = now()
  WHERE sender_uid = trim(p_sender_uid) AND receiver_uid = trim(p_opener_uid);

  INSERT INTO public.barrel_opens_ledger (barrel_id, opener_uid)
  VALUES (trim(p_barrel_id), trim(p_opener_uid))
  ON CONFLICT (barrel_id, opener_uid) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows = 0 OR NOT COALESCE(opener_virgin, false) THEN
    SELECT COALESCE(tg_user_id, ''), lives INTO sender_tg, new_lives FROM public.users WHERE uid = trim(p_sender_uid);
    RETURN jsonb_build_object('ok', true, 'credited', false, 'sender_lives', COALESCE(new_lives, 0), 'sender_tg_id', COALESCE(sender_tg, ''));
  END IF;

  PERFORM public.get_or_create_player_profile(p_sender_uid, NULL, NULL, '');

  UPDATE public.users
  SET
    lives = lives + 2,
    friends_brought = friends_brought + 1,
    premiere_points = premiere_points + 400,
    updated_at = now()
  WHERE uid = trim(p_sender_uid)
  RETURNING lives, COALESCE(tg_user_id, '') INTO new_lives, sender_tg;

  RETURN jsonb_build_object('ok', true, 'credited', true, 'sender_lives', new_lives, 'sender_tg_id', sender_tg);
END;
$$;

-- Список «Твои люди в цеху» для конструктора пранка
CREATE OR REPLACE FUNCTION public.get_my_workshop_friends(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arr jsonb;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'friends', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb)
  INTO arr
  FROM (
    SELECT
      receiver_uid AS friend_uid,
      COALESCE(receiver_tg_id, '') AS friend_tg_id,
      COALESCE(NULLIF(receiver_name, ''), 'Друг из Цеха') AS friend_name,
      COALESCE(receiver_username, '') AS friend_username,
      opened_barrel,
      duels_together,
      updated_at
    FROM public.social_connections
    WHERE sender_uid = trim(p_uid)
    ORDER BY updated_at DESC
    LIMIT 30
  ) f;

  RETURN jsonb_build_object('ok', true, 'friends', arr);
END;
$$;

-- ============================================================================
-- ШАГ 8.3: СИНХРОННЫЙ МУЛЬТИПЛЕЕР «НА СЧЁТ ТРИ!» (СТАВКА 1 ❤️ И ФИНАЛЬНЫЙ РАСЧЁТ БАНКА)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_duel_ante_rpc(
  p_uid text,
  p_room_id text,
  p_round_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  ins_count int := 0;
BEGIN
  IF p_uid IS NULL OR p_round_key IS NULL OR length(trim(p_round_key)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  INSERT INTO public.duel_antes (round_key, uid, room_id)
  VALUES (trim(p_round_key), trim(p_uid), left(COALESCE(p_room_id, ''), 32))
  ON CONFLICT (round_key, uid) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    -- Ставка за этот раунд уже была списана (например, переброс ничьей без повторного списания!)
    RETURN jsonb_build_object('ok', true, 'already_staked', true, 'lives', u.lives, 'premiere_points', u.premiere_points);
  END IF;

  IF u.lives <= 0 THEN
    DELETE FROM public.duel_antes WHERE round_key = trim(p_round_key) AND uid = trim(p_uid);
    RETURN jsonb_build_object('ok', false, 'reason', 'no_lives', 'lives', 0);
  END IF;

  UPDATE public.users
  SET
    lives = lives - 1,
    has_played_solo = true,
    duels_played = duels_played + 1,
    premiere_points = premiere_points + 80,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object('ok', true, 'lives', u.lives, 'premiere_points', u.premiere_points);
END;
$$;

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
  ins_count int := 0;
  n_players int := COALESCE(array_length(p_player_uids, 1), 2);
  pot_lives int;
  score_bonus numeric(6,2) := 0.00;
  pts_bonus int := 200;
  golden_drop boolean := false;
  cfg public.global_stats%ROWTYPE;
  w public.users%ROWTYPE;
BEGIN
  IF p_round_key IS NULL OR p_winner_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  n_players := GREATEST(2, LEAST(3, n_players));
  pot_lives := n_players;

  INSERT INTO public.duel_settlements (round_key, room_id, winner_uid, players_count, pot_lives)
  VALUES (trim(p_round_key), left(COALESCE(p_room_id, ''), 32), trim(p_winner_uid), n_players, pot_lives)
  ON CONFLICT (round_key) DO NOTHING;

  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count = 0 THEN
    SELECT * INTO w FROM public.users WHERE uid = trim(p_winner_uid);
    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'pot_lives', pot_lives,
      'winner_lives', COALESCE(w.lives, 0),
      'winner_score', COALESCE(w.premiere_score, 0),
      'winner_points', COALESCE(w.premiere_points, 0),
      'has_pending_ticket', COALESCE(w.has_pending_ticket, false)
    );
  END IF;

  IF n_players >= 3 THEN
    -- БОНУС ОТ ЦЕХА ЗА СТОЛ НА ТРОИХ: +0.25 к шкале Премьеры + 450 очков Лидерборда + повышенный шанс Золотой бочки!
    score_bonus := 0.25;
    pts_bonus := 450;

    SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
    IF cfg.daily_reset_date < CURRENT_DATE THEN
      cfg.daily_tickets_issued := 0;
      cfg.daily_reset_date := CURRENT_DATE;
    END IF;

    IF NOT cfg.is_paused AND cfg.daily_tickets_issued < cfg.max_daily_tickets AND random() < 0.28 THEN
      golden_drop := true;
      UPDATE public.global_stats
      SET
        daily_tickets_issued = cfg.daily_tickets_issued + 1,
        daily_reset_date = cfg.daily_reset_date,
        updated_at = now()
      WHERE id = 1;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + pot_lives,
    duels_won = duels_won + 1,
    premiere_points = premiere_points + pts_bonus,
    premiere_score = CASE
      WHEN premiere_won THEN 100.00
      ELSE LEAST(99.50, premiere_score + score_bonus)
    END,
    has_pending_ticket = (has_pending_ticket OR golden_drop),
    updated_at = now()
  WHERE uid = trim(p_winner_uid)
  RETURNING * INTO w;

  -- Обновляем счётчик совместных дуэлей между друзьями
  IF p_player_uids IS NOT NULL AND array_length(p_player_uids, 1) >= 2 THEN
    UPDATE public.social_connections
    SET duels_together = duels_together + 1, updated_at = now()
    WHERE sender_uid = ANY(p_player_uids) AND receiver_uid = ANY(p_player_uids) AND sender_uid <> receiver_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pot_lives', pot_lives,
    'score_bonus', score_bonus,
    'points_bonus', pts_bonus,
    'golden_ticket_dropped', golden_drop,
    'winner_lives', COALESCE(w.lives, pot_lives),
    'winner_score', COALESCE(w.premiere_score, 0),
    'winner_points', COALESCE(w.premiere_points, 0),
    'has_pending_ticket', COALESCE(w.has_pending_ticket, false)
  );
END;
$$;

-- ============================================================================
-- ОБНОВЛЁННЫЙ УДАР СУПЕРИГРЫ: КАПКАН ПОСЛЕДНЕГО ПРОЦЕНТА (99.5%) + НАЧИСЛЕНИЕ ОЧКОВ В ТОП-10
-- ============================================================================
CREATE OR REPLACE FUNCTION public.play_premiere_strike(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  cfg public.global_stats%ROWTYPE;
  roll numeric := random();
  delta numeric(6,2) := 0.00;
  new_score numeric(6,2);
  pts_gain integer := 40;
  outcome text := 'empty_screamer';
BEGIN
  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  IF u.has_pending_ticket THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'pending_ticket_choice',
      'lives', u.lives,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'has_pending_ticket', true
    );
  END IF;

  IF u.lives <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_lives',
      'lives', 0,
      'premiere_score', u.premiere_score,
      'premiere_points', u.premiere_points,
      'near_miss', (u.premiere_score >= 90.0)
    );
  END IF;

  SELECT * INTO cfg FROM public.global_stats WHERE id = 1 FOR UPDATE;
  IF cfg.daily_reset_date < CURRENT_DATE THEN
    cfg.daily_tickets_issued := 0;
    cfg.daily_reset_date := CURRENT_DATE;
  END IF;
  cfg.total_strikes := cfg.total_strikes + 1;

  u.lives := u.lives - 1;
  u.has_played_solo := true;

  -- Золотая бочка с Подарочным билетом другу (каждый WIN_EVERY_N_HITS удар в рамках MAX_DAILY_TICKETS)
  IF NOT cfg.is_paused
     AND (cfg.total_strikes % cfg.win_every_n_hits) = 0
     AND cfg.daily_tickets_issued < cfg.max_daily_tickets
  THEN
    cfg.daily_tickets_issued := cfg.daily_tickets_issued + 1;
    u.has_pending_ticket := true;
    outcome := 'golden_ticket';
    pts_gain := 250;
  ELSE
    -- Напряжённая асимптотика с капканом последнего процента (Near-Miss 98.5..99.5 -> борьба за ТОП-10 по очкам!)
    IF u.premiere_score < 35 THEN
      IF roll < 0.78 THEN delta := 35.00; outcome := 'score_hit'; pts_gain := 95; END IF;
    ELSIF u.premiere_score < 60 THEN
      IF roll < 0.68 THEN delta := 25.00; outcome := 'score_hit'; pts_gain := 105; END IF;
    ELSIF u.premiere_score < 80 THEN
      IF roll < 0.56 THEN delta := 18.00; outcome := 'score_hit'; pts_gain := 115; END IF;
    ELSIF u.premiere_score < 90 THEN
      IF roll < 0.46 THEN delta := 9.50; outcome := 'score_hit'; pts_gain := 125; END IF;
    ELSIF u.premiere_score < 95.5 THEN
      IF roll < 0.36 THEN delta := 2.80; outcome := 'score_hit'; pts_gain := 135; END IF;
    ELSIF u.premiere_score < 98.4 THEN
      IF roll < 0.25 THEN delta := 0.90; outcome := 'score_hit'; pts_gain := 145; END IF;
    ELSIF u.premiere_score < 99.5 THEN
      -- У самого порога Суперприза игра намеренно ведёт к промаху (скримеру), оставляя полшага до 100!
      IF roll < 0.14 THEN
        delta := LEAST(0.15, GREATEST(0.00, 99.50 - u.premiere_score));
        IF delta > 0 THEN outcome := 'score_hit'; pts_gain := 160; END IF;
      END IF;
    ELSE
      -- На 99.5+ шкала удерживает интригу, а главный отбор на Премьеру идёт среди ТОП-10 лидеров по очкам!
      delta := 0.00;
      outcome := 'empty_screamer';
      pts_gain := 75;
    END IF;
  END IF;

  new_score := CASE WHEN u.premiere_won THEN 100.00 ELSE LEAST(99.50, u.premiere_score + delta) END;

  UPDATE public.global_stats
  SET
    total_strikes = cfg.total_strikes,
    daily_tickets_issued = cfg.daily_tickets_issued,
    daily_reset_date = cfg.daily_reset_date,
    updated_at = now()
  WHERE id = 1;

  UPDATE public.users
  SET
    lives = u.lives,
    has_played_solo = true,
    premiere_score = new_score,
    premiere_points = premiere_points + pts_gain,
    has_pending_ticket = u.has_pending_ticket,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', outcome,
    'delta', delta,
    'points_gain', pts_gain,
    'premiere_score', new_score,
    'premiere_points', u.premiere_points,
    'lives', u.lives,
    'has_pending_ticket', u.has_pending_ticket,
    'premiere_won', u.premiere_won,
    'premiere_code', COALESCE(u.premiere_code, ''),
    'near_miss', (u.lives = 0 AND new_score >= 90.0 AND NOT u.premiere_won)
  );
END;
$$;

-- ============================================================================
-- ПРОГРЕССИЯ УРОВНЕЙ (1..8 -> ОТ 3 ДО 10 БОЧЕК, 9+ -> БЛИЦ НА ВРЕМЯ И ОЧКИ)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_workshop_level_rpc(
  p_uid text,
  p_level integer,
  p_time_left_sec numeric DEFAULT 0,
  p_bonus_points integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  clean_lvl integer := GREATEST(1, LEAST(99, COALESCE(p_level, 1)));
  earned_pts integer;
  next_lvl integer;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  earned_pts := LEAST(
    750,
    80 + (LEAST(10, clean_lvl) * 25) + ROUND(GREATEST(0, LEAST(30, COALESCE(p_time_left_sec, 0))) * 6)::integer + GREATEST(0, LEAST(350, COALESCE(p_bonus_points, 0)))
  );
  next_lvl := GREATEST(u.current_level, clean_lvl + 1);

  UPDATE public.users
  SET
    has_played_solo = true,
    current_level = next_lvl,
    premiere_points = premiere_points + earned_pts,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'earned_points', earned_pts,
    'current_level', u.current_level,
    'premiere_points', u.premiere_points,
    'lives', u.lives
  );
END;
$$;

-- ============================================================================
-- НАЧИСЛЕНИЕ ОЧКОВ И ЖИЗНЕЙ ЗА ТРЕЙЛЕР, КИНОПОИСК И ШЕРИНГ ВО ВСЕ СОЦСЕТИ (TG/WA/VK/IG)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_social_or_promo_bonus_rpc(
  p_uid text,
  p_action text,
  p_platform text DEFAULT 'generic',
  p_ref_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  pts_added integer := 0;
  lives_added integer := 0;
  token_key text;
  mask_now text;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) < 2 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  PERFORM public.get_or_create_player_profile(p_uid, NULL, NULL, '');
  SELECT * INTO u FROM public.users WHERE uid = trim(p_uid) FOR UPDATE;

  mask_now := CASE WHEN u.daily_social_date < CURRENT_DATE THEN '' ELSE COALESCE(u.daily_social_mask, '') END;

  IF p_action = 'trailer_watched' THEN
    PERFORM public.bump_daily_metric('trailer_completions', 1);
    IF NOT u.trailer_rewarded THEN
      pts_added := 250;
      lives_added := 1;
      u.trailer_rewarded := true;
    END IF;

    -- Если зритель пришёл по чужой реферальной ссылке на трейлер (?trailer=1&ref=UID) -> бонус отправителю!
    IF p_ref_uid IS NOT NULL AND length(trim(p_ref_uid)) >= 2 AND trim(p_ref_uid) <> trim(p_uid) AND u.trailer_ref_by IS NULL THEN
      u.trailer_ref_by := trim(p_ref_uid);
      PERFORM public.get_or_create_player_profile(p_ref_uid, NULL, NULL, '');
      UPDATE public.users
      SET
        lives = lives + 1,
        premiere_points = premiere_points + 250,
        updated_at = now()
      WHERE uid = trim(p_ref_uid);
    END IF;

  ELSIF p_action = 'kp_clicked' THEN
    PERFORM public.bump_daily_metric('kp_clicks', 1);
    IF NOT u.kp_click_rewarded THEN
      pts_added := 300;
      u.kp_click_rewarded := true;
    END IF;

  ELSIF p_action IN ('share_barrel', 'share_trailer') THEN
    token_key := '[' || p_action || ':' || left(regexp_replace(COALESCE(p_platform, 'link'), '[^a-z0-9_]', '', 'gi'), 12) || ']';
    IF position(token_key in mask_now) = 0 THEN
      mask_now := mask_now || token_key;
      pts_added := CASE WHEN p_action = 'share_trailer' THEN 150 ELSE 120 END;
      IF u.daily_shares_count < 5 THEN
        lives_added := 1;
        u.daily_shares_count := u.daily_shares_count + 1;
      END IF;
    END IF;
  END IF;

  UPDATE public.users
  SET
    lives = lives + lives_added,
    premiere_points = premiere_points + pts_added,
    trailer_rewarded = u.trailer_rewarded,
    kp_click_rewarded = u.kp_click_rewarded,
    trailer_ref_by = u.trailer_ref_by,
    daily_shares_count = u.daily_shares_count,
    daily_shares_date = CURRENT_DATE,
    daily_social_mask = mask_now,
    updated_at = now()
  WHERE uid = trim(p_uid)
  RETURNING * INTO u;

  RETURN jsonb_build_object(
    'ok', true,
    'points_added', pts_added,
    'lives_added', lives_added,
    'premiere_points', u.premiere_points,
    'lives', u.lives,
    'already_claimed', (pts_added = 0 AND lives_added = 0)
  );
END;
$$;

-- Обновляем record_funnel_event_rpc, чтобы скриншот Кинопоиска давал +500 очков Рейтинга Премьеры
CREATE OR REPLACE FUNCTION public.record_funnel_event_rpc(
  p_event text,
  p_uid text DEFAULT NULL,
  p_kp_screenshot_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event IN ('kp_clicks', 'trailer_completions', 'cinema_clicks', 'ocean_opens') THEN
    PERFORM public.bump_daily_metric(p_event, 1);
  END IF;

  IF p_event = 'kp_screenshot_verified' AND p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    UPDATE public.users
    SET
      premiere_points = premiere_points + CASE WHEN NOT kp_verified THEN 500 ELSE 0 END,
      lives = lives + CASE WHEN NOT kp_verified THEN 1 ELSE 0 END,
      kp_verified = true,
      kp_screenshot_url = COALESCE(NULLIF(trim(COALESCE(p_kp_screenshot_url, '')), ''), kp_screenshot_url),
      updated_at = now()
    WHERE uid = trim(p_uid);
    PERFORM public.bump_daily_metric('kp_clicks', 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Обновляем submit_gift_ticket_order: подаренный билет другу даёт отправителю ×2 жизней И +1000 ОЧКОВ ЛИДЕРБОРДА!
CREATE OR REPLACE FUNCTION public.submit_gift_ticket_order(
  p_gift_id text,
  p_receiver_uid text,
  p_receiver_tg_id text,
  p_receiver_username text,
  p_receiver_name text,
  p_city_cinema text,
  p_fallback_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tp public.ticket_passes%ROWTYPE;
  vc public.verified_contacts%ROWTYPE;
  clean_phone text := '';
  order_id uuid;
  new_sender_lives integer := 0;
BEGIN
  IF p_receiver_tg_id IS NULL OR length(trim(p_receiver_tg_id)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'telegram_required');
  END IF;

  IF p_city_cinema IS NULL OR length(trim(p_city_cinema)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  SELECT * INTO tp FROM public.ticket_passes WHERE short_id = trim(p_gift_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF (tp.sender_tg_id IS NOT NULL AND tp.sender_tg_id <> '' AND tp.sender_tg_id = trim(p_receiver_tg_id))
     OR (tp.sender_uid = trim(COALESCE(p_receiver_uid, '')))
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_claim_blocked');
  END IF;

  IF tp.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  SELECT * INTO vc FROM public.verified_contacts WHERE tg_user_id = trim(p_receiver_tg_id);
  IF FOUND THEN
    clean_phone := regexp_replace(vc.phone, '[^0-9+]', '', 'g');
  ELSIF p_fallback_phone IS NOT NULL AND length(regexp_replace(p_fallback_phone, '[^0-9]', '', 'g')) >= 10 THEN
    clean_phone := regexp_replace(p_fallback_phone, '[^0-9+]', '', 'g');
  END IF;

  IF length(clean_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'contact_not_verified');
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.verified_phone = clean_phone) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_already_used');
  END IF;

  INSERT INTO public.ticket_orders (
    gift_id, status,
    receiver_uid, receiver_tg_id, receiver_username, receiver_name,
    verified_phone, city_cinema, recipient_photo_url,
    sender_uid, sender_tg_id, sender_username, sender_name,
    kp_screenshot_url
  )
  VALUES (
    tp.short_id, 'pending',
    trim(COALESCE(p_receiver_uid, '')),
    trim(p_receiver_tg_id),
    NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    CASE WHEN length(trim(COALESCE(p_receiver_name, ''))) > 0 THEN trim(p_receiver_name) ELSE COALESCE(tp.recipient_name, 'Гость') END,
    clean_phone,
    left(trim(p_city_cinema), 120),
    tp.recipient_photo_url,
    tp.sender_uid,
    tp.sender_tg_id,
    tp.sender_username,
    tp.sender_name,
    tp.kp_screenshot_url
  )
  RETURNING id INTO order_id;

  UPDATE public.ticket_passes
  SET
    status = 'claimed',
    receiver_uid = trim(COALESCE(p_receiver_uid, '')),
    receiver_tg_id = trim(p_receiver_tg_id),
    receiver_username = NULLIF(trim(COALESCE(p_receiver_username, '')), ''),
    sender_rewarded = true,
    claimed_at = now()
  WHERE short_id = tp.short_id;

  -- Начисляем отправителю ×2 жизней + 1000 очков Рейтинга Премьеры + счётчик подаренных билетов!
  UPDATE public.users
  SET
    lives = GREATEST(2, lives * 2),
    friends_brought = friends_brought + 1,
    tickets_gifted = tickets_gifted + 1,
    premiere_points = premiere_points + 1000,
    updated_at = now()
  WHERE uid = tp.sender_uid
  RETURNING lives INTO new_sender_lives;

  PERFORM public.bump_daily_metric('tickets_ordered', 1);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', order_id,
    'sender_tg_id', COALESCE(tp.sender_tg_id, ''),
    'sender_name', COALESCE(tp.sender_name, ''),
    'sender_lives', COALESCE(new_sender_lives, 2),
    'verified_phone', clean_phone,
    'city_cinema', left(trim(p_city_cinema), 120)
  );
END;
$$;

-- ============================================================================
-- ТАБЛИЦА ЛИДЕРОВ «ТОП-10 НА ЗАКРЫТУЮ ПРЕМЬЕРУ 17 ДЕКАБРЯ»
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_premiere_leaderboard_rpc(p_uid text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leaders_arr jsonb;
  me_row public.users%ROWTYPE;
  my_rank bigint := 0;
  tenth_pts integer := 0;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      row_number() OVER (ORDER BY premiere_points DESC, premiere_score DESC, friends_brought DESC, updated_at ASC) AS rank,
      uid,
      CASE
        WHEN length(trim(COALESCE(display_name, ''))) > 0 THEN left(trim(display_name), 26)
        WHEN tg_username IS NOT NULL AND length(tg_username) > 0 THEN '@' || left(tg_username, 22)
        ELSE 'Игрок #' || upper(right(uid, 4))
      END AS name,
      premiere_points,
      premiere_score,
      current_level,
      friends_brought,
      tickets_gifted,
      duels_won,
      premiere_confirmed
    FROM public.users
    WHERE premiere_points > 0 OR premiere_score > 0 OR friends_brought > 0
    ORDER BY premiere_points DESC, premiere_score DESC, friends_brought DESC, updated_at ASC
    LIMIT 25
  ) t;

  SELECT COALESCE(MIN(sub.premiere_points), 0)
  INTO tenth_pts
  FROM (
    SELECT premiere_points
    FROM public.users
    ORDER BY premiere_points DESC, premiere_score DESC, friends_brought DESC
    LIMIT 10
  ) sub;

  IF p_uid IS NOT NULL AND length(trim(p_uid)) >= 2 THEN
    SELECT * INTO me_row FROM public.users WHERE uid = trim(p_uid);
    IF FOUND THEN
      SELECT COUNT(*) + 1
      INTO my_rank
      FROM public.users other
      WHERE other.premiere_points > me_row.premiere_points
         OR (other.premiere_points = me_row.premiere_points AND other.premiere_score > me_row.premiere_score);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leaders', leaders_arr,
    'tenth_points', tenth_pts,
    'me', CASE WHEN me_row.uid IS NOT NULL THEN jsonb_build_object(
      'uid', me_row.uid,
      'rank', my_rank,
      'in_top10', (my_rank >= 1 AND my_rank <= 10 AND me_row.premiere_points > 0),
      'premiere_points', me_row.premiere_points,
      'premiere_score', me_row.premiere_score,
      'current_level', me_row.current_level,
      'friends_brought', me_row.friends_brought,
      'tickets_gifted', me_row.tickets_gifted,
      'duels_won', me_row.duels_won,
      'points_to_top10', GREATEST(0, tenth_pts - me_row.premiere_points + CASE WHEN my_rank > 10 THEN 10 ELSE 0 END)
    ) ELSE NULL END
  );
END;
$$;

-- Обновляем кабинет продюсера /admin, чтобы выводить ТОП по очкам Премьеры, розданным билетам и дуэлям
CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs public.global_stats%ROWTYPE;
  daily_arr jsonb;
  orders_arr jsonb;
  leaders_arr jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT * INTO gs FROM public.global_stats WHERE id = 1;

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day ASC), '[]'::jsonb)
  INTO daily_arr
  FROM (
    SELECT * FROM public.daily_metrics ORDER BY day DESC LIMIT 21
  ) d;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO orders_arr
  FROM public.ticket_orders o;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
  INTO leaders_arr
  FROM (
    SELECT
      uid, tg_user_id, tg_username, display_name,
      premiere_points, premiere_score, current_level,
      lives, friends_brought, tickets_gifted, duels_won, packed_count,
      kp_verified, kp_screenshot_url,
      premiere_won, premiere_confirmed, premiere_code,
      updated_at
    FROM public.users
    ORDER BY premiere_points DESC, premiere_score DESC, friends_brought DESC, updated_at DESC
    LIMIT 50
  ) l;

  RETURN jsonb_build_object(
    'ok', true,
    'stats', row_to_json(gs),
    'daily', daily_arr,
    'orders', orders_arr,
    'leaders', leaders_arr
  );
END;
$$;

-- Расширяем автоочистку pg_cron старых записей ставок дуэлей старше 5 дней
CREATE OR REPLACE FUNCTION public.cleanup_expired_barrel_media()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'barrel-media'
    AND created_at < now() - interval '5 days';

  UPDATE public.barrels
  SET photo_url = NULL, voice_url = NULL
  WHERE created_at < now() - interval '5 days'
    AND (photo_url IS NOT NULL OR voice_url IS NOT NULL);

  DELETE FROM public.duel_antes WHERE created_at < now() - interval '5 days';
  DELETE FROM public.duel_settlements WHERE settled_at < now() - interval '5 days';
END;
$$;

-- Права вызова новых RPC
GRANT EXECUTE ON FUNCTION public.check_barrel_entry_routing(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_barrel_search_started(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workshop_friends(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_duel_ante_rpc(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_duel_round(text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workshop_level_rpc(text, integer, numeric, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_social_or_promo_bonus_rpc(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_premiere_leaderboard_rpc(text) TO anon, authenticated;
