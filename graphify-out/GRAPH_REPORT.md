# Graph Report - BAREL  (2026-11-25)

## Corpus Check
- 101 files · ~315,327 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 28 file(s) not represented in the graph (top: .woff2 20, (none) 4, .css 4)
- WARNING: 28 of 135 files seen (21%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 1493 nodes · 4671 edges · 64 communities (50 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `249e55ac`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- updatePremiereBarsUI
- backend.js
- WorkshopScene
- WorkshopAudio
- Night
- telegram.js
- state.js
- package.json
- admin.js
- src/main.js
- renderUpgrade
- rules.js
- audio.js
- СВОДНЫЙ ОТЧЁТ КРАШ-ТЕСТА, БЕЗОПАСНОСТИ, ЭКОНОМИКИ И UX — «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС» (`v6.1-film-art`)
- WorkshopDuelController
- BARREL_BATCH_CODES
- bootstrap
- tapper.js
- i18n.js
- bindUIEvents
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
- recordFunnelEvent
- handleBarrelStrike
- Tapper
- Принцип 4 отделов (у каждого отдела есть право вето на релиз)
- imaging.js
- applyPassiveDailyLifeAndHourlyStrikes
- FIGHTER_AVATARS
- showToast
- LEGAL_ORG_CONFIG
- LEGAL_SECTIONS
- src/i18n.js

## God Nodes (most connected - your core abstractions)
1. `bindUIEvents()` - 100 edges
2. `bootstrap()` - 96 edges
3. `WorkshopScene` - 79 edges
4. `WorkshopAudio` - 73 edges
5. `WorkshopDuelController` - 69 edges
6. `getViewerUid()` - 63 edges
7. `Tapper` - 62 edges
8. `getCloudDb()` - 54 edges
9. `showToast()` - 49 edges
10. `boot()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения` --references--> `bindUIEvents()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `ОТДЕЛ 3. МАРКЕТИНГ, ВИРАЛЬНОСТЬ И ВОРОНКА` --references--> `recordFunnelEvent()`  [INFERRED]
  STUDIO_STANDARD.md → src/backend.js
- `🟡 MEDIUM / LOW (Логика стадий, адаптив, защита broadcast/Storage и гигиена)` --references--> `finishRound()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `🟡 MEDIUM / LOW (Логика стадий, адаптив, защита broadcast/Storage и гигиена)` --references--> `bindUIEvents()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/main.js
- `Исполнительное резюме` --references--> `openInstagramShareFlow()`  [INFERRED]
  ОТЧЕТ_ТЕСТА_И_БАЛАНСА_v6.md → src/telegram.js

## Import Cycles
- None detected.

## Communities (64 total, 14 thin omitted)

### Community 0 - "updatePremiereBarsUI"
Cohesion: 0.27
Nodes (17): addPendingCinemaTicket(), awardTicketShard(), consumePendingCinemaTicketAndReward(), evaluateKinopoiskReturn(), finishTicketSendAndReturnToGame(), openGoldenTicketForkModal(), readSentTicketsLedger(), reconcileSentTicketsLifecycle() (+9 more)

### Community 1 - "backend.js"
Cohesion: 0.07
Nodes (103): assignBroadcastVisitor(), awardTicketShardServer(), buildDuelShareLinks(), buildTrailerReferralLinks(), burnRegularTicketForX2Lives(), checkBarrelEntryRouting(), checkFriendDuplicateConnection(), claimDuelPremiereBankReward() (+95 more)

### Community 4 - "Night"
Cohesion: 0.17
Nodes (3): alarmLock(), floorY(), Night

### Community 5 - "telegram.js"
Cohesion: 0.18
Nodes (24): triggerMultiSocialShare(), _clearHapticTimers(), copyToClipboard(), extractUrlBarrelParam(), extractUrlExtraParams(), extractUrlPassParam(), getWebApp(), _hapticTimers (+16 more)

### Community 6 - "state.js"
Cohesion: 0.10
Nodes (43): boostCost(), cardCost(), CARDS, cipherOf(), comboCards(), comboWin(), dailyReward(), dayKey() (+35 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (31): dependencies, @supabase/supabase-js@^2.49.1, three@^0.174.0, description, devDependencies, vite@^6.2.0, name, private (+23 more)

### Community 8 - "admin.js"
Cohesion: 0.15
Nodes (40): adminSupabase, admState, avatarEl(), bindAdminEvents(), bindTop100Events(), callAdminWebhook(), chainSection(), csvCell() (+32 more)

### Community 9 - "src/main.js"
Cohesion: 0.04
Nodes (63): prepareNativeShareMessage(), ./legal.js?v=155, applyShareBonusReward(), BARREL_BATCH_CODES, BARREL_CLOSER_CAST, buildSpoilerFreeReport(), checkSecret1997Combo(), clearAvatarMenuHintPulse() (+55 more)

### Community 10 - "renderUpgrade"
Cohesion: 0.24
Nodes (13): cardCost(), getEquippedSkills(), setToolLevel(), skillDuration(), skillEnergyCost(), skillLevel(), spendSkillEnergy(), toggleEquipSkill() (+5 more)

### Community 11 - "rules.js"
Cohesion: 0.19
Nodes (23): addScore(), advanceEconomy(), hourly(), advanceNight(), neighbors(), NIGHT_DURATION, nightAction(), random() (+15 more)

### Community 12 - "audio.js"
Cohesion: 0.13
Nodes (32): barkRhythm(), barrelMelodyBeat(), chainClink(), createWarehouseReverb(), decodeAllPendingSfx(), decodeSingleSfx(), drip(), getActivePrankVoice() (+24 more)

### Community 13 - "СВОДНЫЙ ОТЧЁТ КРАШ-ТЕСТА, БЕЗОПАСНОСТИ, ЭКОНОМИКИ И UX — «БОЧКА: ДОСТУЧАТЬСЯ ДО НЕБЕС» (`v6.1-film-art`)"
Cohesion: 0.11
Nodes (17): 1.1. Консоль, сеть, WebGL2 и папки скриншотов, 1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения, 1.3. Замеры 3D-цеха, хитбоксов (`px`), персонажей и скримеров, 1.4. Реальные тайминги ключевых действий (`https://bochka.quest/`), 2.1. Простые правила игры (4 строчки для экрана входа и бота), 2.2. Живой аудит вирального цикла, `watch_<id>` и стола `duel_<roomId>` (`@friends-duel`), 4.1. Нагрузочный бенчмарк живого облака Supabase (`tg_999000401..410`, `c = 10 / 25 / 50`), 4.2. Симуляция «500 игроков × 7 дней» (20 прогонов, 10 000 человеко-недель) (+9 more)

### Community 14 - "WorkshopDuelController"
Cohesion: 0.09
Nodes (9): computeSuperprizeProgress(), getActiveRealtimeClient(), escapeAttr(), escapeHtml(), getFallbackFighterAvatar(), getLevelEnergyCap(), getTilDifficultyProfile(), getTilEnergyCap() (+1 more)

### Community 16 - "bootstrap"
Cohesion: 0.11
Nodes (45): getPlayerRecoveryCode(), syncUiStage(), applyProgressiveDisclosureUI(), armWorkshopClickGuard(), bootstrap(), canClaimOceanRefillToday(), capEarlyLivesIfNoRealFriends(), checkSuperprizeTransitions() (+37 more)

### Community 17 - "tapper.js"
Cohesion: 0.10
Nodes (24): ASSET_MAP, BARREL_RECTS, CHAR_FRAMES, DOG_FRAMES, imgToCanvas(), keyOutBuildingChecker(), keyOutChecker(), keyOutOceanSprites() (+16 more)

### Community 18 - "i18n.js"
Cohesion: 0.19
Nodes (14): stopCharacterVoice(), applyI18n(), charVoiceCycle, cleanSpeechText(), EXTRA, HERO, initLanguage(), locale() (+6 more)

### Community 19 - "bindUIEvents"
Cohesion: 0.09
Nodes (34): buildBroadcastPrefix(), isPremiereRaceUnlocked(), applySeedPackModeUI(), bindUIEvents(), captureSelfieFrame(), closeSelfieCamera(), computePlayerRankTitle(), computeSuperPrizeRatingPct() (+26 more)

### Community 20 - "t"
Cohesion: 0.12
Nodes (32): t(), closeActiveWatchChannel(), closeLeaderboardModal(), configureBottomAttemptsMode(), createWatchChannelLazy(), ensureSceneReady(), enterWorkshopGate(), formatBarrelWord() (+24 more)

### Community 21 - "trophies.js"
Cohesion: 0.08
Nodes (41): audio, DECOY_SOUND_KEYS, SCREAMER_KEY_ALIAS, SFX_PATHS, Haptics, el(), TilThreePhaseController, ./trophies.js?v=2000 (+33 more)

### Community 22 - "main.js"
Cohesion: 0.12
Nodes (40): isVoiceOrPrankBusy(), t(), applyTelegramUser(), boot(), canvas, ctx, drawLobbyBackgroundTrailerAndCredits(), duckLobbyTrailerForVoice() (+32 more)

### Community 23 - "screamer-fx.js"
Cohesion: 0.31
Nodes (6): drawCover(), drawGlassCrack(), getCachedImg(), HorrorScreamerPlayer, _imgCache, preloadScreamerFrames()

### Community 24 - "net.js"
Cohesion: 0.16
Nodes (17): ARCHIVE, CONFIG, MEDIA, flushActions(), initNet(), isFirebaseConfigured(), net, queueAction() (+9 more)

### Community 25 - "./legal.js?v=1545"
Cohesion: 0.67
Nodes (4): appendRequisitesCard(), buildSectionNode(), renderAllLegalSectionsInto(), renderLegalSectionInto()

### Community 26 - "БОЧКА v6.7.1 — полная механика"
Cohesion: 0.11
Nodes (18): 10. Что проверено и что нет, 1. Путь игрока по 4 уровням, 2. Кнопка «Пойду 17 декабря», 3. Ссылки и метки трафика, 4. Как мы знаем, кто это (без читов), 5. Рейтинг и Топ-100, 6. Билеты и защита, 7. Что пишет бот @bochka_film_bot (+10 more)

### Community 27 - "ui.js"
Cohesion: 0.13
Nodes (45): gridRect(), safeUrl(), number(), barrelCardLevel(), barrelCardUpgradeCost(), barrelPremiereChances(), buyBarrelCardWithPoints(), canUpgradeBarrelWithPoints() (+37 more)

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
Cohesion: 0.08
Nodes (28): barrelRect(), drawBarrelFallback(), drawFrame(), oceanRect(), drawBarrelPopCharacter(), updateAndDrawPreGameLobby(), drawVan(), findLadder() (+20 more)

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

### Community 48 - "recordFunnelEvent"
Cohesion: 0.30
Nodes (12): recordFunnelEvent(), sendCinemaInviteReply(), clearTrailerTimers(), destroyVkTrailerPlayerAndIframe(), grantTrailer30sBaseReward(), grantTrailerFullWatchReward(), handleVkTrailerTimeProgress(), mountVkTrailerPlayer() (+4 more)

### Community 49 - "handleBarrelStrike"
Cohesion: 0.22
Nodes (28): awardV8LevelProgress(), applyOwnNameBarrelBonus(), claimKinopoiskFourthLife(), claimTrailerFifthLife(), clearBarrelReticleHover(), closeGoldenTicketForkModal(), closeTrailerModal(), createGoldenTicketPortraitDataUrl() (+20 more)

### Community 50 - "Tapper"
Cohesion: 0.10
Nodes (11): bark(), chainBreak(), coin(), creak(), isMuted(), knock(), voiceMumble(), walkerLine() (+3 more)

### Community 51 - "Принцип 4 отделов (у каждого отдела есть право вето на релиз)"
Cohesion: 0.22
Nodes (8): STUDIO_STANDARD.md — Обязательный регламент качества Игровой Студии полного цикла (BAREL), ЖЁСТКОЕ ПРАВИЛО РАЗРАБОТКИ (БЕЗ ИСКЛЮЧЕНИЙ), ОТДЕЛ 1. ГЕЙМДИЗАЙН И ГЕЙМИФИКАЦИЯ, ОТДЕЛ 2. АРТ, UX И ЗВУК, ОТДЕЛ 3. МАРКЕТИНГ, ВИРАЛЬНОСТЬ И ВОРОНКА, ОТДЕЛ 4. ЖЁСТКИЙ QA И ПРИЁМКА, Правило принятия решений и отчётности перед релизом, Принцип 4 отделов (у каждого отдела есть право вето на релиз)

### Community 52 - "imaging.js"
Cohesion: 0.06
Nodes (42): ENV, rawYtId, resolveSiteAsset(), STALE_YT_IDS, applyVividCinemaGrade(), blobToDataUrl(), canvasToBlob(), createDefaultSilhouetteCanvas() (+34 more)

### Community 53 - "applyPassiveDailyLifeAndHourlyStrikes"
Cohesion: 0.60
Nodes (5): applyPassiveDailyLifeAndHourlyStrikes(), formatNextStrikeRegenHint(), getMoscowDateKey(), readSessionResume(), saveSessionResumeSnapshot()

### Community 56 - "showToast"
Cohesion: 0.18
Nodes (14): sendDuelChallengePush(), challengeSpecificFriend1v1(), completeExternalLikeBonus(), evaluateExternalLikeReturn(), evaluateExternalYouTubeRescueReturn(), handleExternalTrailerLike(), handleIssueGiftPassClick(), initVisibilityAndAntiSeekGuards() (+6 more)

### Community 63 - "src/i18n.js"
Cohesion: 0.31
Nodes (7): applyDomTranslations(), initI18n(), listeners, onLangChange(), safeGetStorage(), safeSetStorage(), setLang()

## Knowledge Gaps
- **4 isolated node(s):** `BARREL_BATCH_CODES`, `FIGHTER_AVATARS`, `LEGAL_ORG_CONFIG`, `LEGAL_SECTIONS`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 352 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WorkshopAudio` connect `WorkshopAudio` to `.playFullScreamer`, `trophies.js`, `.setListeningBarrel`, `._rebuildPanners`, `.unlockSync`, `.stopMuffledVoiceLoop`?**
  _High betweenness centrality (0.376) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `bindUIEvents()` (e.g. with `1.2. Путь игрока по Стадиям Progressive Disclosure (`1 → 4`) и точки трения` and `🟡 MEDIUM / LOW (Логика стадий, адаптив, защита broadcast/Storage и гигиена)`) actually correct?**
  _`bindUIEvents()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BARREL_BATCH_CODES`, `FIGHTER_AVATARS`, `LEGAL_ORG_CONFIG` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backend.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06612590372068418 - nodes in this community are weakly interconnected._
- **Why does `WorkshopScene` connect `WorkshopScene` to `imaging.js`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `WorkshopScene` be split into smaller, more focused modules?**
  _Cohesion score 0.054527750730282376 - nodes in this community are weakly interconnected._
- **Why does `computeSuperprizeProgress()` connect `WorkshopDuelController` to `bootstrap`, `backend.js`, `src/main.js`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._