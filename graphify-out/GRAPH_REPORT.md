# Graph Report - BAREL  (2026-11-26)

## Corpus Check
- 104 files · ~326,475 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 28 file(s) not represented in the graph (top: .woff2 20, (none) 4, .css 4)
- WARNING: 28 of 138 files seen (20%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 1512 nodes · 4790 edges · 62 communities (49 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5d6bf300`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- showToast
- backend.js
- WorkshopScene
- WorkshopAudio
- Night
- telegram.js
- state.js
- package.json
- admin.js
- src/main.js
- Actor
- rules.js
- audio.js
- СВОДНЫЙ ОТЧЁТ КРАШ-ТЕСТА, БЕЗОПАСНОСТИ, ЭКОНОМИКИ И UX — «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС» (`v6.1-film-art`)
- WorkshopDuelController
- renderUpgrade
- showToast
- tapper.js
- i18n.js
- handleSealBarrelClick
- t
- trophies.js
- main.js
- screamer-fx.js
- net.js
- ./legal.js?v=1545
- БОЧКА v6.7.1 — полная механика
- ui.js
- index.ts
- СИСТЕМНЫЙ АТЛАС ПК: КАРТА ДИСКОВ, МОСТОВ, ПРОЕКТОВ И МОДЕЛЕЙ
- steps
- trailer.js
- БОЧКА: достучаться до небес
- night.js
- 2. Метрики и аналитика касаний по сегментам (Дни 3, 10, 21, 35, 50)
- 2. Как теперь работает каждая механика
- Ponytail Help
- BarrelVoiceRecorder
- ponytail-audit/SKILL.md
- Ponytail Gain
- ponytail-review/SKILL.md
- Ponytail
- БОЧКА: Упакуй друга (`bochka.quest`)
- testbog-gate.js
- ponytail-debt/SKILL.md
- .gitguardian.yaml
- ecc-continuous-learning.md
- Til3DBarrelDuel
- handleBarrelStrike
- Tapper
- Принцип 4 отделов (у каждого отдела есть право вето на релиз)
- imaging.js
- showScreen
- LEGAL_ORG_CONFIG
- LEGAL_SECTIONS
- bootstrap
- initUI

## God Nodes (most connected - your core abstractions)
1. `bindUIEvents()` - 104 edges
2. `bootstrap()` - 97 edges
3. `WorkshopScene` - 79 edges
4. `WorkshopAudio` - 73 edges
5. `WorkshopDuelController` - 70 edges
6. `getViewerUid()` - 68 edges
7. `Tapper` - 62 edges
8. `getCloudDb()` - 59 edges
9. `showToast()` - 50 edges
10. `boot()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `ОТДЕЛ 3. МАРКЕТИНГ, ВИРАЛЬНОСТЬ И ВОРОНКА` --references--> `recordFunnelEvent()`  [INFERRED]
  STUDIO_STANDARD.md → src/backend.js
- `1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения` --references--> `bindUIEvents()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `🟠 HIGH (Сломанные метрики, гонки, инфляция и визуальные дефекты)` --references--> `bootstrap()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `🟡 MEDIUM / LOW (Логика стадий, адаптив, защита broadcast/Storage и гигиена)` --references--> `startNewbieOnboardingRound()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `🔴 CRITICAL (Блокеры продакшена, утечка ПДн, бесплатные билеты и сбои `/admin/`)` --references--> `unlockTrailerReward()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js

## Import Cycles
- None detected.

## Communities (62 total, 13 thin omitted)

### Community 0 - "showToast"
Cohesion: 0.13
Nodes (40): recordFunnelEvent(), addPendingCinemaTicket(), applyShareBonusReward(), applyWriteAccessBonusToProfile(), awardTicketShard(), checkSuperprizeTransitions(), completeExternalLikeBonus(), evaluateExternalLikeReturn() (+32 more)

### Community 1 - "backend.js"
Cohesion: 0.06
Nodes (118): assignBroadcastVisitor(), awardTicketShardServer(), buildDuelShareLinks(), buildTrailerReferralLinks(), burnRegularTicketForX2Lives(), checkBarrelEntryRouting(), checkFriendDuplicateConnection(), claimDuelPremiereBankReward() (+110 more)

### Community 4 - "Night"
Cohesion: 0.20
Nodes (4): alarmLock(), barrelMelodyBeat(), floorY(), Night

### Community 5 - "telegram.js"
Cohesion: 0.21
Nodes (18): _clearHapticTimers(), extractUrlBarrelParam(), extractUrlExtraParams(), extractUrlPassParam(), getWebApp(), _hapticTimers, initTelegram(), isTelegramMiniApp() (+10 more)

### Community 6 - "state.js"
Cohesion: 0.12
Nodes (30): cipherOf(), energyLimit(), tapPower(), addPoints(), buyBoost(), buyCard(), CARDS, claim() (+22 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (31): dependencies, @supabase/supabase-js@^2.49.1, three@^0.174.0, description, devDependencies, vite@^6.2.0, name, private (+23 more)

### Community 8 - "admin.js"
Cohesion: 0.15
Nodes (40): adminSupabase, admState, avatarEl(), bindAdminEvents(), bindTop100Events(), callAdminWebhook(), chainSection(), csvCell() (+32 more)

### Community 9 - "src/main.js"
Cohesion: 0.04
Nodes (83): isPremiereRaceUnlocked(), sendCinemaInviteReply(), ./legal.js?v=155, BARREL_BATCH_CODES, BARREL_CLOSER_CAST, bindUIEvents(), buildPersonalShareCopy(), buildSpoilerFreeReport() (+75 more)

### Community 11 - "rules.js"
Cohesion: 0.11
Nodes (40): addScore(), advanceEconomy(), boostCost(), cardCost(), CARDS, comboCards(), comboWin(), dailyReward() (+32 more)

### Community 12 - "audio.js"
Cohesion: 0.16
Nodes (25): barkRhythm(), chainClink(), createWarehouseReverb(), decodeAllPendingSfx(), decodeSingleSfx(), drip(), hit(), hum() (+17 more)

### Community 13 - "СВОДНЫЙ ОТЧЁТ КРАШ-ТЕСТА, БЕЗОПАСНОСТИ, ЭКОНОМИКИ И UX — «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС» (`v6.1-film-art`)"
Cohesion: 0.11
Nodes (17): 1.1. Консоль, сеть, WebGL2 и папки скриншотов, 1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения, 1.3. Замеры 3D-цеха, хитбоксов (`px`), персонажей и скримеров, 1.4. Реальные тайминги ключевых действий (`https://bochka.quest/`), 2.1. Простые правила игры (4 строчки для экрана входа и бота), 2.2. Живой аудит вирального цикла, `watch_<id>` и стола `duel_<roomId>` (`@friends-duel`), 4.1. Нагрузочный бенчмарк живого облака Supabase (`tg_999000401..410`, `c = 10 / 25 / 50`), 4.2. Симуляция «500 игроков × 7 дней» (20 прогонов, 10 000 человеко-недель) (+9 more)

### Community 14 - "WorkshopDuelController"
Cohesion: 0.10
Nodes (8): computeSuperprizeProgress(), escapeAttr(), escapeHtml(), getFallbackFighterAvatar(), getLevelEnergyCap(), getTilDifficultyProfile(), getTilEnergyCap(), WorkshopDuelController

### Community 15 - "renderUpgrade"
Cohesion: 0.20
Nodes (16): canClaimDaily(), cardCost(), currentTool(), getEquippedSkills(), league(), setToolLevel(), skillDuration(), skillEnergyCost() (+8 more)

### Community 16 - "showToast"
Cohesion: 0.13
Nodes (20): applyFirstSocialExclusive(), canClaimOceanRefillToday(), challengeSpecificFriend1v1(), createTicketShardDataUrl(), createVictimCardDataUrl(), ensureDuelReady(), finishRound(), getActivePointsMultiplier() (+12 more)

### Community 17 - "tapper.js"
Cohesion: 0.17
Nodes (15): ASSET_MAP, BARREL_RECTS, CHAR_FRAMES, DOG_FRAMES, gridRect(), imgToCanvas(), keyOutBuildingChecker(), keyOutChecker() (+7 more)

### Community 18 - "i18n.js"
Cohesion: 0.17
Nodes (16): playCharacterVoice(), stopCharacterVoice(), applyI18n(), charVoiceCycle, cleanSpeechText(), EXTRA, HERO, initLanguage() (+8 more)

### Community 19 - "handleSealBarrelClick"
Cohesion: 0.24
Nodes (13): buildBroadcastPrefix(), prepareNativeShareMessage(), applySeedPackModeUI(), getActiveBranchPrefix(), getTeamSeedRole(), handleQuick1TapPrankClick(), handleSealBarrelClick(), isInitialSeedPackRequired() (+5 more)

### Community 20 - "t"
Cohesion: 0.18
Nodes (28): t(), clearBarrelReticleHover(), closeActiveWatchChannel(), configureBottomAttemptsMode(), createGoldenTicketPortraitDataUrl(), createWatchChannelLazy(), ensureSceneReady(), enterWorkshopGate() (+20 more)

### Community 21 - "trophies.js"
Cohesion: 0.08
Nodes (41): audio, DECOY_SOUND_KEYS, SCREAMER_KEY_ALIAS, SFX_PATHS, Haptics, el(), TilThreePhaseController, ./trophies.js?v=2000 (+33 more)

### Community 22 - "main.js"
Cohesion: 0.13
Nodes (38): isVoiceOrPrankBusy(), t(), applyTelegramUser(), boot(), canvas, ctx, duckLobbyTrailerForVoice(), ensureLobbyTrailerSound() (+30 more)

### Community 23 - "screamer-fx.js"
Cohesion: 0.31
Nodes (6): drawCover(), drawGlassCrack(), getCachedImg(), HorrorScreamerPlayer, _imgCache, preloadScreamerFrames()

### Community 24 - "net.js"
Cohesion: 0.16
Nodes (15): ARCHIVE, CONFIG, MEDIA, flushActions(), initNet(), isFirebaseConfigured(), net, queueAction() (+7 more)

### Community 25 - "./legal.js?v=1545"
Cohesion: 0.67
Nodes (4): appendRequisitesCard(), buildSectionNode(), renderAllLegalSectionsInto(), renderLegalSectionInto()

### Community 26 - "БОЧКА v6.7.1 — полная механика"
Cohesion: 0.11
Nodes (18): 10. Что проверено и что нет, 1. Путь игрока по 4 уровням, 2. Кнопка «Пойду 17 декабря», 3. Ссылки и метки трафика, 4. Как мы знаем, кто это (без читов), 5. Рейтинг и Топ-100, 6. Билеты и защита, 7. Что пишет бот @bochka_film_bot (+10 more)

### Community 27 - "ui.js"
Cohesion: 0.14
Nodes (25): scream(), stopAllVoices(), barrelCardLevel(), barrelCardUpgradeCost(), barrelPremiereChances(), buyBarrelCardWithPoints(), canUpgradeBarrelWithPoints(), friendArrived() (+17 more)

### Community 28 - "index.ts"
Cohesion: 0.13
Nodes (14): ADMIN_NOTIFY_BIND_CODE, adminDb, bufToHex(), CORS_HEADERS, duelPushThrottle, encoder, getConfiguredAdminNotifyChatIds(), hmacSha256Raw() (+6 more)

### Community 29 - "СИСТЕМНЫЙ АТЛАС ПК: КАРТА ДИСКОВ, МОСТОВ, ПРОЕКТОВ И МОДЕЛЕЙ"
Cohesion: 0.11
Nodes (18): 1. Состояние дисков, 2. Реестр NTFS-мостов (Junctions / Symlinks), 3. Каталог рабочих проектов, 4. Веса нейросетей и кэши моделей, 5. Python окружения (venv / .venv), 6. Ключевые программы и SDK, 7. Статус слотов .env (без секретов), `F:\AI_Director\.env` (+10 more)

### Community 30 - "steps"
Cohesion: 0.15
Nodes (12): jobs, ping, name, on, schedule, workflow_dispatch, runs-on, steps (+4 more)

### Community 31 - "trailer.js"
Cohesion: 0.24
Nodes (12): C, drawBarrel(), drawFloor(), initTrailer(), injectStyle(), makeGrain(), mount(), mountCanvasTeaser() (+4 more)

### Community 32 - "БОЧКА: достучаться до небес"
Cohesion: 0.18
Nodes (10): Firebase, Telegram и приглашения, Безопасность перед конкурсом, БОЧКА: достучаться до небес, Запуск, Ночная смена, Подключённые материалы, Призы и персональные данные (+2 more)

### Community 33 - "night.js"
Cohesion: 0.07
Nodes (37): barrelRect(), drawBarrelFallback(), drawFrame(), oceanRect(), sheets, T, walkerLine(), drawBarrelPopCharacter() (+29 more)

### Community 34 - "2. Метрики и аналитика касаний по сегментам (Дни 3, 10, 21, 35, 50)"
Cohesion: 0.18
Nodes (10): 1. Воронка удержания (Retention D1–D60), 2. Метрики и аналитика касаний по сегментам (Дни 3, 10, 21, 35, 50), 3. Главные причины оттока за 60 дней, 4. Приоритетные правки экономики и рассылок, День 10: Интрига 5-го уровня: отец, собака и бочка 19·97 (`Email + Telegram-тизер`, промокод: `нет`), День 21: Срочный бонус за возврат (+3 ❤️ сгорают через 12ч) (`Срочный Push + DM бота`, промокод: `BOCHKA-COMEBACK`), День 35: Таблица лидеров и дуэли На счёт три: позови 2 друзей (`Telegram-дайджест + Лидерборд`, промокод: `DUEL-X2`), День 3: Анонс главного приза и Золотой бочки (порог 72%) (`Telegram-пост + Web Push`, промокод: `BOCHKA-72GOLD`) (+2 more)

### Community 35 - "2. Как теперь работает каждая механика"
Cohesion: 0.20
Nodes (9): 1. Сводка внесённых правок (по итогам OASIS 60 дней + 12 Chrome QA), 2. Как теперь работает каждая механика, 3. План новых тестов для следующего прогона (OASIS + Playwright), Механика 1. Ускоренный Блиц (12с) + Мини-ивент дня (`record_solo_level_win`), Механика 2. Справедливый ТОП-10 с мягким бонусом за друзей (`get_premiere_leaderboard_rpc`), Механика 3. Задания смены и достижения (`#daily-quests-box`), Механика 4. Прозрачный фонд призов (`get_public_raffle_transparency`), Механика 5. Напоминания о мини-ивентах (`#btn-toggle-reminders`) (+1 more)

### Community 36 - "Ponytail Help"
Cohesion: 0.22
Nodes (8): Band (Claude Code), Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 38 - "ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Map first, 2. Look for, 3. Check before you report, 4. Output

### Community 39 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 40 - "ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Understand first, 2. Look for, 3. Check before you report, 4. Output

### Community 41 - "Ponytail"
Cohesion: 0.40
Nodes (4): Before you write, Levels, Ponytail, The smallest complete change

### Community 42 - "БОЧКА: Упакуй друга (`bochka.quest`)"
Cohesion: 0.40
Nodes (4): БОЧКА: Упакуй друга (`bochka.quest`), Быстрый старт, Подключение Supabase и Telegram-бота, Стек

### Community 43 - "testbog-gate.js"
Cohesion: 0.40
Nodes (3): errEl, form, input

### Community 44 - "ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 45 - ".gitguardian.yaml"
Cohesion: 0.50
Nodes (3): secret, ignored_paths, version

### Community 49 - "handleBarrelStrike"
Cohesion: 0.12
Nodes (41): awardV8LevelProgress(), applyOwnNameBarrelBonus(), capEarlyLivesIfNoRealFriends(), checkSecret1997Combo(), claimKinopoiskFourthLife(), claimTrailerFifthLife(), closeGoldenTicketForkModal(), consumePendingCinemaTicketAndReward() (+33 more)

### Community 50 - "Tapper"
Cohesion: 0.11
Nodes (8): bark(), chainBreak(), creak(), getActivePrankVoice(), isMuted(), knock(), voiceMumble(), Tapper

### Community 51 - "Принцип 4 отделов (у каждого отдела есть право вето на релиз)"
Cohesion: 0.22
Nodes (8): STUDIO_STANDARD.md — Обязательный регламент качества Игровой Студии полного цикла (BAREL), ЖЁСТКОЕ ПРАВИЛО РАЗРАБОТКИ (БЕЗ ИСКЛЮЧЕНИЙ), ОТДЕЛ 1. ГЕЙМДИЗАЙН И ГЕЙМИФИКАЦИЯ, ОТДЕЛ 2. АРТ, UX И ЗВУК, ОТДЕЛ 3. МАРКЕТИНГ, ВИРАЛЬНОСТЬ И ВОРОНКА, ОТДЕЛ 4. ЖЁСТКИЙ QA И ПРИЁМКА, Правило принятия решений и отчётности перед релизом, Принцип 4 отделов (у каждого отдела есть право вето на релиз)

### Community 52 - "imaging.js"
Cohesion: 0.06
Nodes (43): ENV, rawYtId, resolveSiteAsset(), STALE_YT_IDS, applyVividCinemaGrade(), blobToDataUrl(), canvasToBlob(), createDefaultSilhouetteCanvas() (+35 more)

### Community 56 - "showScreen"
Cohesion: 0.22
Nodes (18): syncUiStage(), applyProgressiveDisclosureUI(), armWorkshopClickGuard(), clearTrailerTimers(), closeBurgerDrawer(), closeTrailerModal(), destroyVkTrailerPlayerAndIframe(), enterModeABarrelHub() (+10 more)

### Community 63 - "bootstrap"
Cohesion: 0.09
Nodes (28): getPlayerRecoveryCode(), applyDomTranslations(), initI18n(), listeners, onLangChange(), safeGetStorage(), safeSetStorage(), setLang() (+20 more)

### Community 65 - "initUI"
Cohesion: 0.23
Nodes (23): coin(), playPrankVoice(), safeUrl(), number(), notifyReferrerTapped(), bindConfigLinks(), clearEchoTimers(), closeModal() (+15 more)

## Knowledge Gaps
- **2 isolated node(s):** `LEGAL_ORG_CONFIG`, `LEGAL_SECTIONS`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 351 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WorkshopAudio` connect `WorkshopAudio` to `.playFullScreamer`, `trophies.js`, `.setListeningBarrel`, `._rebuildPanners`, `.unlockSync`, `.stopMuffledVoiceLoop`?**
  _High betweenness centrality (0.368) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `bindUIEvents()` (e.g. with `1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения` and `🟡 MEDIUM / LOW (Логика стадий, адаптив, защита broadcast/Storage и гигиена)`) actually correct?**
  _`bindUIEvents()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LEGAL_ORG_CONFIG`, `LEGAL_SECTIONS` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `showToast` be split into smaller, more focused modules?**
  _Cohesion score 0.13205128205128205 - nodes in this community are weakly interconnected._
- **Why does `./scene.js?v=2000` connect `imaging.js` to `backend.js`, `WorkshopScene`, `package.json`, `src/main.js`, `t`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Should `backend.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05839317165695705 - nodes in this community are weakly interconnected._
- **Why does `WorkshopScene` connect `WorkshopScene` to `imaging.js`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._