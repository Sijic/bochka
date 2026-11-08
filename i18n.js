import { playCharacterVoice, stopCharacterVoice, isMuted } from './audio.js';

export const T = {
  ru: {
    title: 'БОЧКА', subtitle: 'ДОСТУЧАТЬСЯ ДО НЕБЕС', marathon: 'МАРАФОН ВЫЖИВАНИЯ', daily: 'ЕЖЕДНЕВНАЯ НАГРАДА',
    balance: 'БАЛАНС / ОЧКИ', claim: 'ЗАБРАТЬ ДОХОД', lives: 'ЗАПАС ЖИЗНЕЙ', air: 'ВОЗДУХ', energy: 'ЭНЕРГИЯ', regen: 'РЕГЕН',
    shareLives: '🔥 ПРИГЛАСИТЬ ДРУГА — ВЕРНУТЬ ЖИЗНИ', sector: 'ЦЕХ № 04 / СЕКТОР Б', epigraph: 'СТУЧИТЕ, И ОТВОРЯТ ВАМ...',
    tagline: 'На небесах только и говорят, что о твоём последнем пранке', enter: '▶ СТАРТ ИГРЫ ◀', rules: 'ПРАВИЛА',
    chained: 'ЦЕПИ', chainedText: 'Жизни кончились. Комбо-очки сгорают. Пригласи друга — и цепи спадут мгновенно.',
    share: '🔥 ПРИГЛАСИТЬ ДРУГА', act: 'ДЕЙСТВИЕ', hide: '🛢️ В БОЧКУ', modeTap: 'ТАПАЛКА БОЧЕК', modeNight: 'НОЧНАЯ СМЕНА',
    fogTitle: 'ЗАСЕКРЕЧЕННЫЕ ОТСЕКИ', fogHint: 'Запертые сектора цеха открываются по мере выживания.',
    upgradeTitle: 'ПРОКАЧКА ПЛОЩАДКИ', upgradeHint: 'Карточки приносят доход каждый час. Оффлайн доход копится максимум 3 часа.',
    friendsTitle: 'ДРУЗЬЯ', friendsHint: '+25 000 очков и все жизни за каждого друга, 10% от его очков навсегда.',
    yourLink: 'ТВОЯ ССЫЛКА', copy: 'КОПИРОВАТЬ', invited: 'ПРИГЛАШЕНО', archiveTitle: 'СЕКРЕТНЫЙ АРХИВ', ratingTitle: 'РЕЙТИНГ',
    prize1: 'Победители определяются не только розыгрышем купонов, но и по ТОП-скорости в рейтинге (⚡) + прокачке Бочки (с 8 до 200 ур. — только друзьями)!', prize2: 'VIP-проходка на ЗАКРЫТЫЙ ПОКАЗ с актёрами и режиссёром Алексеем Звонцовым (лидерам по общей скорости + Бочке до 200 ур. и по розыгрышу).',
    survey: 'АНКЕТА УЧАСТНИКА', tickets: '🎟️ КУПИТЬ БИЛЕТЫ В КИНО',
    tab1: 'ЦЕХ', tab2: 'ПРОКАЧКА', tab3: 'ДРУЗЬЯ', tab4: 'АРХИВ', tab5: 'РЕЙТИНГ',
    priestLine: 'Тук-тук! Кто там? Это я, Тиль Швайгер! Принёс бочку для вашего мальчика!',
    levelDone: 'УРОВЕНЬ ПРОЙДЕН', nightDone: 'ТЫ ДОЖИЛ ДО РАССВЕТА', caught: 'ТЕБЯ НАШЛИ', suffocated: 'ЗАДОХНУЛСЯ', trap: 'ЛОВУШКА', timeout: 'ВРЕМЯ ВЫШЛО', drowned: 'ПОДВАЛ ЗАТОПЛЕН',
    ok: 'ПОНЯТНО', close: 'ЗАКРЫТЬ', copied: 'Ссылка скопирована. Дружеское приглашение подготовлено: +½ жизни.',
    rulesText: 'Уровни 1–4: найди правильную бочку (она дрожит и стучит) и тапай по ней, чтобы заполнить шкалу. Рука из бочки — ×2, телефон — комбо ×3, цепи — двойной тап, опрокинутая бочка АННА — ловушка и скример. Три шкалы: жизни, воздух (пополняется точными сериями тапов) и сгорающие очки при простое.\n\nУровень 5 «Ночная смена»: беги по этажам завода, чини лампы, перекрывай вентили в подвале, собирай катушки плёнки. Когда в комнату заходит преследователь — прячься в бочку (но воздух кончается). Доживи до 06:00 — очки ×2 и секретная сцена.\n\nЖизни восстанавливаются 1 раз в 12 часов, мгновенно — за приглашённого друга. Доход карточек копится 3 часа оффлайн. Стрик 30 дней и ежедневное комбо.',
    videoP: 'Продюсер: «Эй, я продюсер фильма! Продолжай в том же духе, мы в тебя верим!»', videoD: 'Режиссёр Алексей Звонцов — обращение со съёмочной площадки.', videoA: 'Тиль Швайгер и Филипп Рейнхардт: «Красавчик, продолжай тапать, ждём тебя в топе!»',
    secret: 'СЕКРЕТНОЕ ВИДЕО: то, что ещё никто не видел. Заглушка под эксклюзивную сцену.',
    outLives: 'Ты почти дошёл. На кону кадры, которых ещё никто не видел. Верни жизни — отправь пранк другу!',
    dailyGot: 'Ежедневная награда получена', dailyWait: 'Награда уже получена сегодня. Стрик: день',
    comboTitle: 'ЕЖЕДНЕВНОЕ КОМБО', comboHint: 'Прокачай 3 секретные карточки за день → +1 000 000',
    surveyText: 'Анкета для розыгрыша билетов и VIP-проходки.', saved: 'Анкета сохранена локально (Firebase не подключён).',
    fog1: 'ТРЕЙЛЕР И СИНОПСИС', fog1d: 'Блогер заперт в стальной бочке посреди мёртвой промзоны. Ключ — у его отца, прикованного в пяти метрах.', fog2: 'ПОСТЕРЫ И ПЕРСОНАЖИ', fog2d: 'Святой отец (Тиль Швайгер), отец мальчика, блогер, сообщник с ножом, девушка, овчарка.', fog3: 'БЭКСТЕЙДЖ', fog3d: 'Кадры со съёмок в Секторе 3 и в деревянной церкви.', fog4: 'БИЛЕТЫ', fog4d: 'Предпродажа. 17 декабря в кинотеатрах.',
    lockLvl: 'ОТКРОЕТСЯ НА УРОВНЕ', lockPts: 'НУЖНО ОЧКОВ',
    youGot: 'Получено', unlockNight: 'Открыта «Ночная смена»',
  },
  kz: {
    title: 'БӨШКЕ', subtitle: 'АСПАНҒА ҚОЛ СОЗУ', marathon: 'ТІРІ ҚАЛУ МАРАФОНЫ', daily: 'КҮНДЕЛІКТІ СЫЙЛЫҚ',
    balance: 'БАЛАНС / ҰПАЙ', claim: 'ТАБЫСТЫ АЛУ', lives: 'ӨМІР ҚОРЫ', air: 'АУА', energy: 'ЭНЕРГИЯ', regen: 'ҚАЛПЫНА',
    shareLives: '🔥 ДОСТЫ ШАҚЫР — ӨМІРДІ ҚАЙТАР', sector: 'ЦЕХ № 04 / Б СЕКТОРЫ', epigraph: 'ҚАҒЫҢДАР, СОНДА СЕНДЕРГЕ ЕСІК АШЫЛАДЫ...',
    tagline: 'Аспанда тек сенің соңғы пранкің туралы айтады', enter: '▶ ОЙЫНДЫ БАСТАУ ◀', rules: 'ЕРЕЖЕ',
    chained: 'ШЫНЖЫР', chainedText: 'Өмір бітті. Комбо-ұпай жанып жатыр. Досыңды шақыр — шынжыр бірден түседі.',
    share: '🔥 ДОСТЫ ШАҚЫРУ', act: 'ӘРЕКЕТ', hide: '🛢️ БӨШКЕГЕ', modeTap: 'БӨШКЕ ТАПАЛКАСЫ', modeNight: 'ТҮНГІ АУЫСЫМ',
    fogTitle: 'ЖАБЫҚ СЕКТОРЛАР', fogHint: 'Құпия отсектер деңгейлерді өткен сайын ашылады.',
    upgradeTitle: 'АЛАҢДЫ ЖАҚСАРТУ', upgradeHint: 'Карточкалар сағат сайын табыс әкеледі. Оффлайн табыс ең көбі 3 сағат жиналады.',
    friendsTitle: 'ДОСТАР', friendsHint: 'Әр дос үшін +25 000 ұпай және барлық өмір, оның ұпайының 10% мәңгі.',
    yourLink: 'СЕНІҢ СІЛТЕМЕҢ', copy: 'КӨШІРУ', invited: 'ШАҚЫРЫЛДЫ', archiveTitle: 'ҚҰПИЯ МҰРАҒАТ', ratingTitle: 'РЕЙТИНГ',
    prize1: '«Досқа билет сыйлық» промокоды.', prize2: 'Алдын ала көрсетілімге VIP-рұқсат және режиссёр Алексей Звонцовпен кездесу.',
    survey: 'ҚАТЫСУШЫ САУАЛНАМАСЫ', tickets: '🎟️ КИНОҒА БИЛЕТ САТЫП АЛУ',
    tab1: 'ЦЕХ', tab2: 'ЖАҚСАРТУ', tab3: 'ДОСТАР', tab4: 'МҰРАҒАТ', tab5: 'РЕЙТИНГ',
    priestLine: 'Тоқ-тоқ! Бұл кім? Бұл мен, Тиль Швайгер! Балаңызға бөшке әкелдім!',
    levelDone: 'ДЕҢГЕЙ ӨТІЛДІ', nightDone: 'ТАҢҒА ДЕЙІН ТІРІ ҚАЛДЫҢ', caught: 'СЕНІ ТАПТЫ', suffocated: 'ТҰНШЫҚТЫҢ', trap: 'ТҰЗАҚ', timeout: 'УАҚЫТ БІТТІ', drowned: 'ЖЕРТӨЛЕ СУ АСТЫНДА',
    ok: 'ТҮСІНІКТІ', close: 'ЖАБУ', copied: 'Сілтеме көшірілді. Шақыру дайын: +½ өмір.',
    rulesText: '1–4 деңгей: дұрыс бөшкені тап (ол дірілдеп, қағылады) және шкаланы толтыру үшін тап. Бөшкеден шыққан қол — ×2, телефон — комбо ×3, шынжыр — қос тап, аударылған АННА бөшкесі — тұзақ пен скример. Үш шкала: өмір, ауа (дәл тап сериясымен толады) және тоқтағанда жанып кететін ұпай.\n\n5-деңгей «Түнгі ауысым»: зауыт қабаттарында жүгір, шамдарды жөнде, жертөледе вентильдерді жап, плёнка катушкаларын жина. Бөлмеге қуғыншы кірсе — бөшкеге тығыл (бірақ ауа бітеді). 06:00-ге дейін тірі қал — ұпай ×2 және құпия сахна.\n\nӨмір 12 сағатта 1 рет қалпына келеді, бірден — шақырылған дос үшін. Карточка табысы оффлайн 3 сағат жиналады. 30 күндік стрик және күнделікті комбо.',
    videoP: 'Продюсер: «Эй, мен фильмнің продюсерімін! Осылай жалғастыр, саған сенеміз!»', videoD: 'Режиссёр Алексей Звонцов — түсірілім алаңынан үндеу.', videoA: 'Тиль Швайгер мен Филипп Рейнхардт: «Жарайсың, тап, топта күтеміз!»',
    secret: 'ҚҰПИЯ ВИДЕО: ешкім көрмеген кадрлар. Эксклюзив сахна орны.',
    outLives: 'Сен аз қалды. Ешкім көрмеген кадрлар таразыда. Өмірді қайтар — досыңа пранк жібер!',
    dailyGot: 'Күнделікті сыйлық алынды', dailyWait: 'Сыйлық бүгін алынған. Стрик: күн',
    comboTitle: 'КҮНДЕЛІКТІ КОМБО', comboHint: '3 құпия карточканы бір күнде жақсарт → +1 000 000',
    surveyText: 'Билет пен VIP-рұқсат ұтысына сауалнама.', saved: 'Сауалнама жергілікті сақталды (Firebase қосылмаған).',
    fog1: 'ТРЕЙЛЕР ЖӘНЕ СИНОПСИС', fog1d: 'Блогер өлі өнеркәсіп аймағының ортасында болат бөшкеде қамалған. Кілт — бес метрде шынжырланған әкесінде.', fog2: 'ПОСТЕРЛЕР ЖӘНЕ КЕЙІПКЕРЛЕР', fog2d: 'Әулие әке (Тиль Швайгер), баланың әкесі, блогер, пышақты сыбайлас, қыз, овчарка.', fog3: 'БЭКСТЕЙДЖ', fog3d: '3-сектор мен ағаш шіркеудегі түсірілім кадрлары.', fog4: 'БИЛЕТТЕР', fog4d: 'Алдын ала сату. 17 желтоқсан кинотеатрларда.',
    lockLvl: 'ДЕҢГЕЙДЕ АШЫЛАДЫ', lockPts: 'ҚАЖЕТ ҰПАЙ',
    youGot: 'Алынды', unlockNight: '«Түнгі ауысым» ашылды',
  },
  en: {
    title: 'THE BARREL', subtitle: "KNOCKIN' ON HEAVEN'S DOOR", marathon: 'SURVIVAL MARATHON', daily: 'DAILY REWARD',
    balance: 'BALANCE / POINTS', claim: 'CLAIM INCOME', lives: 'LIVES', air: 'AIR', energy: 'ENERGY', regen: 'REGEN',
    shareLives: '🔥 INVITE A FRIEND — RESTORE LIVES', sector: 'SHOP № 04 / SECTOR B', epigraph: 'KNOCK, AND IT SHALL BE OPENED...',
    tagline: "In heaven, all they talk about is your last prank", enter: '▶ START GAME ◀', rules: 'RULES',
    chained: 'CHAINED', chainedText: 'Out of lives. Combo points are burning. Invite a friend and the chains drop instantly.',
    share: '🔥 INVITE A FRIEND', act: 'ACTION', hide: '🛢️ HIDE', modeTap: 'BARREL TAPPER', modeNight: 'NIGHT SHIFT',
    fogTitle: 'CLASSIFIED SECTORS', fogHint: 'Locked factory sectors open as you survive each level.',
    upgradeTitle: 'UPGRADE THE SET', upgradeHint: 'Cards earn points every hour. Offline income accumulates up to 3 hours.',
    friendsTitle: 'FRIENDS', friendsHint: '+25,000 points and full lives per friend, 10% of their points forever.',
    yourLink: 'YOUR LINK', copy: 'COPY', invited: 'INVITED', archiveTitle: 'SECRET ARCHIVE', ratingTitle: 'LEADERBOARD',
    prize1: 'Promo code "Free ticket for a friend".', prize2: 'VIP pass to the premiere screening and meet director Alexei Zvontsov.',
    survey: 'PLAYER SURVEY', tickets: '🎟️ BUY TICKETS',
    tab1: 'SHOP', tab2: 'UPGRADE', tab3: 'FRIENDS', tab4: 'ARCHIVE', tab5: 'RATING',
    priestLine: "Knock-knock! Who's there? It's me, Till Schweiger! Brought a barrel for your boy!",
    levelDone: 'LEVEL CLEARED', nightDone: 'YOU SURVIVED TILL DAWN', caught: 'THEY FOUND YOU', suffocated: 'SUFFOCATED', trap: 'TRAP', timeout: "TIME'S UP", drowned: 'BASEMENT FLOODED',
    ok: 'GOT IT', close: 'CLOSE', copied: 'Link copied. Invite prepared: +½ life.',
    rulesText: 'Levels 1–4: find the right barrel (it shakes and knocks) and tap it to fill the bar. A hand from a barrel — ×2, a phone — combo ×3, chains — double tap, the fallen barrel ANNA is a trap with a screamer. Three gauges: lives, air (refilled by accurate tap streaks) and points that burn while idle.\n\nLevel 5 "Night Shift": run across the factory floors, fix lamps, close valves in the basement, collect film reels. When a pursuer enters your room — hide in a barrel (but air runs out). Survive until 06:00 — points ×2 and a secret scene.\n\nLives regenerate once per 12 hours, instantly for an invited friend. Card income accumulates 3 hours offline. 30-day streak and daily combo.',
    videoP: 'Producer: "Hey, I produced this film! Keep going, we believe in you!"', videoD: 'Director Alexei Zvontsov — a message from the set.', videoA: 'Till Schweiger & Philip Reinhardt: "Keep tapping, we are waiting for you at the top!"',
    secret: 'SECRET VIDEO: footage nobody has seen. Placeholder for the exclusive scene.',
    outLives: "You almost made it. Unseen footage is at stake. Restore lives — send the prank to a friend!",
    dailyGot: 'Daily reward claimed', dailyWait: 'Already claimed today. Streak: day',
    comboTitle: 'DAILY COMBO', comboHint: 'Upgrade 3 secret cards in a day → +1,000,000',
    surveyText: 'Survey for the ticket and VIP pass draw.', saved: 'Survey saved locally (Firebase not connected).',
    fog1: 'TRAILER & SYNOPSIS', fog1d: 'A blogger is locked in a steel barrel in a dead industrial zone. The key is with his father, chained five meters away.', fog2: 'POSTERS & CHARACTERS', fog2d: 'The Priest (Till Schweiger), the father, the blogger, the accomplice with a knife, the girl, the shepherd dog.', fog3: 'BEHIND THE SCENES', fog3d: 'Shots from Sector 3 and the wooden church.', fog4: 'TICKETS', fog4d: 'Presale. December 17 in cinemas.',
    lockLvl: 'UNLOCKS AT LEVEL', lockPts: 'POINTS NEEDED',
    youGot: 'Received', unlockNight: '"Night Shift" unlocked',
  },
};

const EXTRA = {
  ru: {
    goal: 'ЦЕЛЬ', start: 'НАЧАТЬ', next: 'ДАЛЬШЕ', buy: 'КУПИТЬ', max: 'МАКС', send: 'ОТПРАВИТЬ', you: 'ТЫ',
    lvlTitle: 'УРОВЕНЬ {n}', lvlText: 'Бочек на полу: {b}. Найди ту, что дрожит и стучит, и выбей {g} тапов за {s} с. Рука — ×2, телефон — комбо ×3, цепи — двойной тап. Опрокинутая АННА — ловушка.',
    wonText: '+{n} очков. Засов сорван — открыт доступ к засекреченному отсеку.', lostText: 'Жизнь потеряна. Осталось: {n}.',
    crewTitle: 'КРУЖОК ОТ КОМАНДЫ', crewNote: 'Заглушка под вертикальное видео placeholder_video_lvl{n}.mp4',
    nightIntro: 'Супер-игра в духе Knock-Knock (Тук-тук-тук), 00:00. Ты начинаешь в Старой деревянной церкви — выйди на ночную улицу под плывущей луной, облаками и ночными птицами и проберись на трёхэтажный завод «Сектор 3» (◀ ▶ / клик, лестницы — ▲ ▼). Чини лампы и перекрывай вентили в подвале (ДЕЙСТВИЕ [E]), собирай бобины плёнки и прячься в бочках ([H]), когда рядом Священник, Отец или пёс. Доживи до рассвета 06:00!',
    nightLocked: 'Ночная смена откроется после 4 уровня.', nightWonText: 'Очки ночи ×{x}: +{n}. Секретная сцена открыта в архиве. Ночная смена теперь доступна каждый день.',
    nightOver: 'Смена сорвана. Набрано: {n}.', shift: 'СМЕНА', dawn: 'РАССВЕТ',
    surveyName: 'Имя', surveyCity: 'Город', surveyPhone: 'Телефон', surveyTg: 'Telegram', surveyDone: 'Анкета принята. Ты в розыгрыше.',
    arcPoster: 'ПОСТЕР / ЦЕХ', arcChurch: 'ПОСТЕР / ЦЕРКОВЬ', arcCast: 'ДОСЬЕ АКТЁРОВ', arcBts: 'БЭКСТЕЙДЖ', arcSecret: 'СЕКРЕТНАЯ СЦЕНА', arcConcept: 'КОНЦЕПТ / БОЧКИ',
    castPriest: 'Святой отец — Тиль Швайгер', castFather: 'Отец мальчика', castBoy: 'Пацан-блогер', castCap: 'Сообщник с ножом', castGirl: 'Девушка', castDog: 'Овчарка',
    btsNote: 'Заглушка под кадры со съёмок (Google Диск / YouTube Embed).', secretNote: 'То, что никто не видел. Заглушка под эксклюзивную сцену.',
    lockLevel: 'УРОВЕНЬ {n}', lockPoints: '{n} ОЧКОВ', lockNight: 'НОЧНАЯ СМЕНА',
    shareText: '🛢️ СОС! Я застрял в бочке в игре «БОЧКА: Достучаться до небес» — у меня кончились жизни! Срочно зайди по ссылке и НАЧНИ ИГРУ (постучи по бочке хотя бы 3 раза), иначе цепи не спадут и я не смогу продолжить! Выручай: {url}',
    inviteNote: 'Отправка в каждый РАЗНЫЙ мессенджер: +½ жизни (2 мессенджера = 1 полная жизнь!). Когда друг перейдёт по ссылке и НАЧНЁТ ТАПАТЬ в игре: все 3 жизни + 25 000 очков!',
    shareModalSub: 'Выбери мессенджер и отправь сигнал спасения. За каждый разный мессенджер сразу даётся +½ жизни (2 разных = 1 целая жизнь!). А когда друг зайдёт и начнёт стучать по бочке — восстановятся все 3 жизни + 25 000 очков!',
    shareHalfGot: 'Отправлено ({m}): +½ жизни! Отправь ещё в другой мессенджер для полной жизни!',
    shareFullGot: '✓ +1 ЖИЗНЬ ВОССТАНОВЛЕНА ({m})! Цепи ослабли — можешь продолжать игру!',
    shareDupChannel: 'В {m} уже отправлено! Выбери другой мессенджер для ещё +½ жизни.',
    shareCopiedMsg: 'Текст спасения и ссылка скопированы для {m}! Вставь и отправь другу.',
    comboDone: 'КОМБО СОБРАНО: +1 000 000', comboLeft: 'Секретные карточки дня: {n}/3', perHour: '/ ч',
    noEnergy: 'Энергия кончилась — жди восстановления.',
    welcome: 'Ты пришёл спасти друга ({c}): +500 очков! НАЧНИ ИГРУ и постучи по бочке 3 раза, чтобы сбить с него цепи!',
    friendSaved: '🔥 Ты постучал по бочке и спас друга ({c})! Его цепи сброшены!',
    arrived: '🔥 Друг зашёл по ссылке и начал стучать по бочке! Все жизни восстановлены + 25 000 очков!', tooSlow: 'Слишком медленно!', wrong: 'Не та бочка',
    paused: 'ПАУЗА', girlHere: 'Бочка занята', reelGot: 'Катушка', lampFixed: 'Свет', valveClosed: 'Вентиль', leagueUp: 'НОВАЯ ЛИГА',
    trailerNote: 'Трейлер. Тапай по экрану во время просмотра — секретные очки.', bonusTap: 'СЕКРЕТНЫЙ ТАП',
    profitHour: 'ПРИБЫЛЬ В ЧАС', streakLabel: 'СТРИК 30 ДНЕЙ', boostsTitle: 'БУСТЫ И УСИЛЕНИЯ',
    boostMulti: 'Мультитап', boostEnergy: 'Запас энергии', boostTurbo: 'Турбо ×5 (20с)', boostRefill: 'Полный бак',
    cipherBtn: 'ПРОСТУЧАТЬ ШИФР ДНЯ', cipherHint: 'Повтори ритм из 4 ударов по бочкам 1–3', cipherFail: 'Ритм сбит! Попробуй снова.',
    poor: 'Недостаточно очков', claimedToast: 'Доход собран: +{n}', free: 'БЕСПЛАТНО',
    lbAll: 'ОБЩИЙ', lbMonth: 'МЕСЯЦ', lbWeek: 'НЕДЕЛЯ', arcStreak: 'ПОСТЕР / МАРАФОН 30', lockStreak: 'СТРИК 30 ДНЕЙ',
    continueLvl: '▶ ДАЛЬШЕ ИГРАТЬ · УРОВЕНЬ {n}',
    echoTitle: 'БОНУС-СЦЕНА · ПРОСТУЧИ РИТМ ПО БОЧКАМ',
    echoSub: 'Смотри и слушай: Овчарка лает ритм у Бочки 1, Тиль стучит по Бочке 2, Отец бьёт по Бочке 3. Повтори ритм прямо по бочкам (+{b} очков)!',
    echoReplay: '🔊 ПРОСЛУШАТЬ РИТМ ЕЩЁ РАЗ',
    echoPlaying: '🔊 Смотри на бочки и персонажей: звучит ритм…',
    echoYourTurn: 'Твоя очередь! Стучи прямо по бочкам на сцене ({c}/{t})',
    echoFail: 'Сбился с ритма! Смотри повтор и попробуй снова…',
    echoWon: '✓ РИТМ ПРОБИТ ИДЕАЛЬНО! БОНУС +{b} ОЧКОВ',
    barrelLow: '🐕 БОЧКА 1 · ЛАЙ',
    barrelMid: '📖 БОЧКА 2 · ТИЛЬ',
    barrelHigh: '🔦 БОЧКА 3 · ОТЕЦ',
    toolLabel: 'КУРСОР',
    toolUpgrade: 'КУРСОР УР.{l}: {n} (×{m})',
    chainSmashed: '🛠️ ЦЕПЬ РАЗБИТА ({t})!',
    beamOnBarrel: '🔦 ЛУЧ НА БОЧКЕ — БИТЬ НЕЛЬЗЯ!',
    beamHuntWarn: '🔦 ЗА ТОБОЙ СЛЕДЯТ! НЕ СТУЧИ ({s}с)',
    beamCaughtToast: 'Попался под луч фонарика! Замри и не бей, пока луч следит за курсором!',
    crowbarBoxTitle: '🛠️ РАЗБИТЬ ЦЕПИ МОНТИРОВКОЙ',
    crowbarBoxSub: 'Ударь монтировкой по оковам 5 раз, чтобы разбить цепи и вернуть 1 жизнь прямо сейчас!',
    crowbarHitBtn: '🛠️ УДАРИТЬ МОНТИРОВКОЙ ПО ЦЕПЯМ ({c}/5)',
    crowbarBrokenMsg: '✓ ЦЕПИ РАЗБИТЫ МОНТИРОВКОЙ! +1 ЖИЗНЬ ВОССТАНОВЛЕНА!',
    modeOceanShort: '07 МОРЕ · ТИЛЬ',
    oceanTitle: 'УРОВЕНЬ 07 · ДОСТУЧАТЬСЯ ДО НЕБЕС',
    oceanIntro: 'На стене краской выведено: «НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ ЧТО О МОРЕ…» На берегу сидит герой, а рядом качается бочка с высунутой рукой и надписью «ТИЛЬ». Пока он смотрит на море — стучи по качающейся бочке ТИЛЬ! Но когда он поворачивается к бочке — СТУЧАТЬ НЕЛЬЗЯ!',
    oceanSafeHint: '🌊 ОН СМОТРИТ НА МОРЕ — СТУЧИ ПО БОЧКЕ «ТИЛЬ»!',
    oceanTurnWarn: '⚠️ ОН ПОВОРАЧИВАЕТСЯ! ПРЕКРАТИ СТУЧАТЬ!',
    oceanTurnedStop: '👁️ ОН ПОВЕРНУЛСЯ! СТУЧАТЬ НЕЛЬЗЯ! ({s}с)',
    oceanWallQuote: 'НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О МОРЕ…',
    oceanWallSub: '…И О ЗАКАТЕ. О ТОМ, КАК СОЛНЦЕ ПОГРУЖАЕТСЯ В ВОЛНЫ И СТАНОВИТСЯ АЛЫМ КАК КРОВЬ',
    charLvl1: 'УР. 01 · ОТЕЦ С ФОНАРЁМ',
    charLvl2: 'УР. 02 · СООБЩНИК В КЕПКЕ',
    charLvl3: 'УР. 03 · ДЕВУШКА С ТЕЛЕФОНОМ',
    charLvl4: 'УР. 04 · ОВЧАРКА РЕКС',
    charLvl5: 'УР. 05 · ПАЦАН-БЛОГЕР',
    charLvl6: 'УР. 06 · СВЯТОЙ ОТЕЦ (ТИЛЬ)',
    charLvl7: 'УР. 07 · ДОСТУЧАТЬСЯ ДО НЕБЕС (ТИЛЬ)',
  },
  kz: {
    goal: 'МАҚСАТ', start: 'БАСТАУ', next: 'ӘРІ ҚАРАЙ', buy: 'САТЫП АЛУ', max: 'МАКС', send: 'ЖІБЕРУ', you: 'СЕН',
    lvlTitle: 'ДЕҢГЕЙ {n}', lvlText: 'Едендегі бөшкелер: {b}. Дірілдеп қағылатынын тауып, {s} секундта {g} тап жаса. Қол — ×2, телефон — комбо ×3, шынжыр — қос тап. Аударылған АННА — тұзақ.',
    wonText: '+{n} ұпай. Құлып ашылды — келесі құпия сектор ашық.', lostText: 'Өмір жоғалды. Қалды: {n}.',
    crewTitle: 'КОМАНДАДАН ВИДЕО', crewNote: 'placeholder_video_lvl{n}.mp4 тік видеосының орны',
    nightIntro: '«3-сектор» зауыты, 00:00. Қабаттарда жүгір (◀ ▶, баспалдақ — ▲ ▼), шамдарды жөнде, жертөледе вентильдерді жап (ӘРЕКЕТ), катушкаларды жина. Қуғыншы көрінсе — бөшкеге тығыл, бірақ ауа бітеді. 06:00-ге дейін тірі қал.',
    nightLocked: 'Түнгі ауысым 4-деңгейден кейін ашылады.', nightWonText: 'Түн ұпайы ×{x}: +{n}. Құпия сахна мұрағатта ашылды. Түнгі ауысым енді күнде қолжетімді.',
    nightOver: 'Ауысым үзілді. Жиналды: {n}.', shift: 'АУЫСЫМ', dawn: 'ТАҢ',
    surveyName: 'Аты', surveyCity: 'Қала', surveyPhone: 'Телефон', surveyTg: 'Telegram', surveyDone: 'Сауалнама қабылданды. Сен ұтыстасың.',
    arcPoster: 'ПОСТЕР / ЦЕХ', arcChurch: 'ПОСТЕР / ШІРКЕУ', arcCast: 'АКТЁРЛАР ДОСЬЕСІ', arcBts: 'БЭКСТЕЙДЖ', arcSecret: 'ҚҰПИЯ САХНА', arcConcept: 'КОНЦЕПТ / БӨШКЕЛЕР',
    castPriest: 'Әулие әке — Тиль Швайгер', castFather: 'Баланың әкесі', castBoy: 'Блогер бала', castCap: 'Пышақты сыбайлас', castGirl: 'Қыз', castDog: 'Овчарка',
    btsNote: 'Түсірілім кадрларының орны (Google Drive / YouTube Embed).', secretNote: 'Ешкім көрмеген. Эксклюзив сахна орны.',
    lockLevel: 'ДЕҢГЕЙ {n}', lockPoints: '{n} ҰПАЙ', lockNight: 'ТҮНГІ АУЫСЫМ',
    shareText: '🛢️ SOS! Мен «БӨШКЕ: Аспанға қол созу» ойынында бөшкеде қамалып қалдым — өмірім бітті! Сілтемемен кіріп, ОЙЫНДЫ БАСТА (бөшкені кемінде 3 рет қақ), әйтпесе мен жалғастыра алмаймын! Көмектес: {url}',
    inviteNote: 'Әр ТҮРЛІ мессенджерге жіберу: +½ өмір (2 мессенджер = 1 толық өмір!). Досың сілтемемен кіріп, бөшкені ҚАҒУДЫ БАСТАСА: барлық 3 өмір + 25 000 ұпай!',
    shareModalSub: 'Мессенджерді таңдап, құтқару хатын жібер. Әр түрлі мессенджер үшін +½ өмір беріледі (2 түрлі = 1 толық өмір!). Ал досың кіріп, бөшкені қаға бастаса — барлық 3 өмір + 25 000 ұпай беріледі!',
    shareHalfGot: 'Жіберілді ({m}): +½ өмір! Толық өмір үшін басқа мессенджерге де жібер!',
    shareFullGot: '✓ +1 ӨМІР ҚАЛПЫНА КЕЛДІ ({m})! Ойынды жалғастыруға болады!',
    shareDupChannel: '{m} арқылы жіберілген! Тағы +½ өмір үшін басқа мессенджерді таңда.',
    shareCopiedMsg: '{m} үшін мәтін мен сілтеме көшірілді! Досыңа жібер.',
    comboDone: 'КОМБО ЖИНАЛДЫ: +1 000 000', comboLeft: 'Күннің құпия карточкалары: {n}/3', perHour: '/ сағ',
    noEnergy: 'Энергия бітті — қалпына келуін күт.',
    welcome: 'Сен досыңды ({c}) құтқаруға келдің: +500 ұпай! ОЙЫНДЫ БАСТАП, бөшкені 3 рет қақ!',
    friendSaved: '🔥 Бөшкені қағып, досыңды ({c}) құтқардың!',
    arrived: '🔥 Дос сілтемемен кіріп, бөшкені қаға бастады: барлық өмір қалпына келді, +25 000!', tooSlow: 'Тым баяу!', wrong: 'Басқа бөшке',
    paused: 'КІДІРІС', girlHere: 'Бөшке бос емес', reelGot: 'Катушка', lampFixed: 'Жарық', valveClosed: 'Вентиль', leagueUp: 'ЖАҢА ЛИГА',
    trailerNote: 'Трейлер. Қарап отырып экранға тап — құпия ұпай.', bonusTap: 'ҚҰПИЯ ТАП',
    profitHour: 'САҒАТТЫҚ ТАБЫС', streakLabel: '30 КҮНДІК СТРИК', boostsTitle: 'БУСТТАР МЕН КҮШЕЙТУ',
    boostMulti: 'Мультитап', boostEnergy: 'Энергия қоры', boostTurbo: 'Турбо ×5 (20с)', boostRefill: 'Толық қор',
    cipherBtn: 'КҮН ШИФРЫН ҚАҒУ', cipherHint: '1–3 бөшкелерге 4 соққы ырғағын қайтала', cipherFail: 'Ырғақ бұзылды! Қайта байқап көр.',
    poor: 'Ұпай жеткіліксіз', claimedToast: 'Табыс жиналды: +{n}', free: 'ТЕГІН',
    lbAll: 'ЖАЛПЫ', lbMonth: 'АЙ', lbWeek: 'АПТА', arcStreak: 'ПОСТЕР / МАРАФОН 30', lockStreak: '30 КҮНДІК СТРИК',
    continueLvl: 'ЖАЛҒАСТЫРУ · ДЕҢГЕЙ {n} ▶',
    echoTitle: 'БОНУС-САХНА · БӨШКЕЛЕРДІ ЫРҒАҚПЕН ҚАҚ',
    echoSub: 'Қара және тыңда: Овчарка 1-бөшкеде үреді, Тиль 2-бөшкені қағады, Әкесі 3-бөшкені соғады. Ырғақты қайтала (+{b} бонус ұпай)!',
    echoReplay: '🔊 ЫРҒАҚТЫ ҚАЙТА ТЫҢДАУ',
    echoPlaying: '🔊 Мұқият қара: кейіпкерлер ырғақ соғуда…',
    echoYourTurn: 'Сенің кезегің! Бөшкелерді соқ ({c}/{t})',
    echoFail: 'Қателестің! Қайта қарап көр…',
    echoWon: '✓ ЫРҒАҚ ДӘЛ ҚАЙТАЛАНДЫ! БОНУС +{b} ҰПАЙ',
    barrelLow: '🐕 БӨШКЕ 1 · ИТ',
    barrelMid: '📖 БӨШКЕ 2 · ТИЛЬ',
    barrelHigh: '🔦 БӨШКЕ 3 · ӘКЕСІ',
    toolLabel: 'КУРСОР',
    toolUpgrade: 'КУРСОР ДЕҢ.{l}: {n} (×{m})',
    chainSmashed: '🛠️ ШЫНЖЫР ҮЗІЛДІ ({t})!',
    beamOnBarrel: '🔦 ФОНАРЬ БӨШКЕДЕ — СОҚПА!',
    beamHuntWarn: '🔦 СЕНІ БАҚЫЛАП ТҰР! СОҚПА ({s}с)',
    beamCaughtToast: 'Фонарь сәулесіне түстің! Сәуле кеткенше соқпа!',
    crowbarBoxTitle: '🛠️ ШЫНЖЫРДЫ МОНТИРОВКАМЕН БҰЗУ',
    crowbarBoxSub: 'Шынжырды монтировкамен 5 рет соғып, 1 өмірді бірден қайтар!',
    crowbarHitBtn: '🛠️ МОНТИРОВКАМЕН СОҒУ ({c}/5)',
    crowbarBrokenMsg: '✓ ШЫНЖЫР БҰЗЫЛДЫ! +1 ӨМІР ҚАЛПЫНА КЕЛДІ!',
    modeOceanShort: '07 ТЕҢІЗ · ТИЛЬ',
    oceanTitle: 'ДЕҢГЕЙ 07 · АСПАНҒА ҚОЛ СОЗУ',
    oceanIntro: 'Қабырғада бояумен жазылған: «АСПАНДА ТЕК ТЕҢІЗ ТУРАЛЫ АЙТАДЫ…» Жағада кейіпкер отыр, ал қасында қолы шығып тұрған «ТИЛЬ» бөшкесі тербеледі. Ол теңізге қарап отырғанда — ТИЛЬ бөшкесін қақ! Бірақ ол бұрылғанда — ҚАҒУҒА БОЛМАЙДЫ!',
    oceanSafeHint: '🌊 ОЛ ТЕҢІЗГЕ ҚАРАП ОТЫР — «ТИЛЬ» БӨШКЕСІН ҚАҚ!',
    oceanTurnWarn: '⚠️ ОЛ БҰРЫЛА БАСТАДЫ! ТОҚТА!',
    oceanTurnedStop: '👁️ ОЛ БҰРЫЛДЫ! ҚАҒУҒА БОЛМАЙДЫ! ({s}с)',
    oceanWallQuote: 'НА НЕБЕ ТОЛЬКО И РАЗГОВОРОВ, ЧТО О МОРЕ…',
    oceanWallSub: '…ЖӘНЕ КҮННІҢ БАТУЫ ТУРАЛЫ',
    charLvl1: '01-ДЕҢ. · ФОНАРЬЛЫ ӘКЕ',
    charLvl2: '02-ДЕҢ. · КЕПКАЛЫ СЫБАЙЛАС',
    charLvl3: '03-ДЕҢ. · ТЕЛЕФОНДЫ ҚЫЗ',
    charLvl4: '04-ДЕҢ. · РЕКС ОВЧАРКАСЫ',
    charLvl5: '05-ДЕҢ. · БЛОГЕР БАЛА',
    charLvl6: '06-ДЕҢ. · ӘУЛИЕ ӘКЕ (ТИЛЬ)',
    charLvl7: '07-ДЕҢ. · АСПАНҒА ҚОЛ СОЗУ (ТИЛЬ)',
  },
  en: {
    goal: 'GOAL', start: 'START', next: 'NEXT', buy: 'BUY', max: 'MAX', send: 'SEND', you: 'YOU',
    lvlTitle: 'LEVEL {n}', lvlText: 'Barrels on the floor: {b}. Find the one that shakes and knocks, land {g} taps in {s}s. Hand — ×2, phone — combo ×3, chains — double tap. The fallen ANNA is a trap.',
    wonText: '+{n} points. Heavy bolt unlocked — access granted to the next sector.', lostText: 'Life lost. Remaining: {n}.',
    crewTitle: 'MESSAGE FROM THE CREW', crewNote: 'Placeholder for vertical video placeholder_video_lvl{n}.mp4',
    nightIntro: 'Factory "Sector 3", 00:00. Run across floors (◀ ▶, ladders — ▲ ▼), fix lamps, close basement valves (ACTION), collect film reels. See a pursuer — hide in a barrel, but air runs out. Survive until 06:00.',
    nightLocked: 'Night Shift unlocks after level 6.', nightWonText: 'Night points ×{x}: +{n}. Secret scene unlocked in the archive. Night Shift is now a daily mode.',
    nightOver: 'Shift failed. Earned: {n}.', shift: 'SHIFT', dawn: 'DAWN',
    surveyName: 'Name', surveyCity: 'City', surveyPhone: 'Phone', surveyTg: 'Telegram', surveyDone: 'Survey accepted. You are in the draw.',
    arcPoster: 'POSTER / SHOP', arcChurch: 'POSTER / CHURCH', arcCast: 'CAST DOSSIER', arcBts: 'BEHIND THE SCENES', arcSecret: 'SECRET SCENE', arcConcept: 'CONCEPT / BARRELS',
    castPriest: 'The Priest — Till Schweiger', castFather: "The boy's father", castBoy: 'The blogger kid', castCap: 'Accomplice with a knife', castGirl: 'The girl', castDog: 'Shepherd dog',
    btsNote: 'Placeholder for set footage (Google Drive / YouTube Embed).', secretNote: 'What nobody has seen. Placeholder for the exclusive scene.',
    lockLevel: 'LEVEL {n}', lockPoints: '{n} POINTS', lockNight: 'NIGHT SHIFT',
    shareText: "🛢️ SOS! I'm trapped in a barrel in THE BARREL: Knockin' on Heaven's Door and out of lives! Click my link and START THE GAME (tap a barrel at least 3 times), otherwise I can't continue! Help me: {url}",
    inviteNote: 'Each DIFFERENT messenger gives +½ life (2 messengers = 1 full life!). When your friend joins via link and STARTS TAPPING: all 3 lives + 25,000 points!',
    shareModalSub: 'Pick a messenger and send the SOS invite. Each different messenger immediately gives +½ life (2 messengers = 1 full life!). When your friend opens the link and starts tapping a barrel — all 3 lives + 25,000 points are restored!',
    shareHalfGot: 'Sent ({m}): +½ life! Send to one more messenger for a full life!',
    shareFullGot: '✓ +1 LIFE RESTORED ({m})! The chains loosened — you can continue playing!',
    shareDupChannel: 'Already sent via {m}! Pick another messenger for another +½ life.',
    shareCopiedMsg: 'SOS message & link copied for {m}! Paste and send to your friend.',
    comboDone: 'COMBO DONE: +1,000,000', comboLeft: 'Secret cards today: {n}/3', perHour: '/ h',
    noEnergy: 'Out of energy — wait for regen.',
    welcome: 'You came to rescue your friend ({c}): +500 points! START THE GAME and tap a barrel 3 times to break their chains!',
    friendSaved: '🔥 You tapped the barrel and rescued your friend ({c})!',
    arrived: '🔥 A friend joined via your link and started tapping: all lives restored, +25,000!', tooSlow: 'Too slow!', wrong: 'Wrong barrel',
    paused: 'PAUSED', girlHere: 'Barrel taken', reelGot: 'Reel', lampFixed: 'Light', valveClosed: 'Valve', leagueUp: 'NEW LEAGUE',
    trailerNote: 'Trailer. Tap the screen while watching — secret points.', bonusTap: 'SECRET TAP',
    profitHour: 'PROFIT / HOUR', streakLabel: '30-DAY STREAK', boostsTitle: 'BOOSTS & UPGRADES',
    boostMulti: 'Multitap', boostEnergy: 'Energy Limit', boostTurbo: 'Turbo ×5 (20s)', boostRefill: 'Full Tank',
    cipherBtn: 'TAP DAILY CIPHER', cipherHint: 'Repeat the 4-beat rhythm on barrels 1–3', cipherFail: 'Rhythm missed! Try again.',
    poor: 'Not enough points', claimedToast: 'Income claimed: +{n}', free: 'FREE',
    lbAll: 'ALL TIME', lbMonth: 'MONTH', lbWeek: 'WEEK', arcStreak: 'POSTER / 30-DAY STREAK', lockStreak: '30-DAY STREAK',
    continueLvl: 'CONTINUE · LEVEL {n} ▶',
    echoTitle: 'BONUS STAGE · KNOCK THE RHYTHM ON BARRELS',
    echoSub: 'Watch and listen: the Shepherd Dog barks the beat at Barrel 1, Till knocks Barrel 2, Father strikes Barrel 3. Repeat their rhythm directly on the barrels (+{b} points)!',
    echoReplay: '🔊 REPLAY RHYTHM',
    echoPlaying: '🔊 Watch the barrels & characters: rhythm playing…',
    echoYourTurn: 'Your turn! Tap the barrels on stage ({c}/{t})',
    echoFail: 'Missed the beat! Watch again…',
    echoWon: '✓ RHYTHM MATCHED! BONUS +{b} POINTS',
    barrelLow: '🐕 BARREL 1 · DOG',
    barrelMid: '📖 BARREL 2 · TILL',
    barrelHigh: '🔦 BARREL 3 · FATHER',
    toolLabel: 'CURSOR',
    toolUpgrade: 'CURSOR LV.{l}: {n} (×{m})',
    chainSmashed: '🛠️ CHAINS SMASHED ({t})!',
    beamOnBarrel: '🔦 BEAM ON BARREL — DO NOT HIT!',
    beamHuntWarn: '🔦 BEAM TRACKING YOU! FREEZE ({s}s)',
    beamCaughtToast: 'Caught in the flashlight beam! Freeze and do not tap while the beam tracks your cursor!',
    crowbarBoxTitle: '🛠️ SMASH CHAINS WITH CROWBAR',
    crowbarBoxSub: 'Strike the chains 5 times with the crowbar to smash them and restore 1 life right now!',
    crowbarHitBtn: '🛠️ STRIKE CHAINS WITH CROWBAR ({c}/5)',
    crowbarBrokenMsg: '✓ CHAINS SMASHED WITH CROWBAR! +1 LIFE RESTORED!',
    modeOceanShort: '07 OCEAN · TILL',
    oceanTitle: "LEVEL 07 · KNOCKIN' ON HEAVEN'S DOOR",
    oceanIntro: 'Painted on the wall: "IN HEAVEN, THAT\'S ALL THEY TALK ABOUT — THE OCEAN..." A man sits by the waves beside a rocking barrel with a hand sticking out labeled "ТИЛЬ". Knock while he looks at the sea — FREEZE when he turns around!',
    oceanSafeHint: '🌊 HE IS WATCHING THE SEA — KNOCK THE "ТИЛЬ" BARREL!',
    oceanTurnWarn: '⚠️ HE IS TURNING AROUND! STOP KNOCKING!',
    oceanTurnedStop: '👁️ HE TURNED AROUND! DO NOT KNOCK! ({s}s)',
    oceanWallQuote: "IN HEAVEN, THAT'S ALL THEY TALK ABOUT — THE OCEAN…",
    oceanWallSub: '…AND HOW MAGNIFICENT THE SUNSET IS OVER THE WAVES',
    charLvl1: 'LV. 01 · FATHER WITH LANTERN',
    charLvl2: 'LV. 02 · CAP ACCOMPLICE',
    charLvl3: 'LV. 03 · GIRL WITH PHONE',
    charLvl4: 'LV. 04 · SHEPHERD DOG REX',
    charLvl5: 'LV. 05 · BLOGGER KID',
    charLvl6: 'LV. 06 · THE PRIEST (TILL)',
    charLvl7: "LV. 07 · KNOCKIN' ON HEAVEN'S DOOR",
  },
};
for (const k of Object.keys(EXTRA)) Object.assign(T[k], EXTRA[k]);

const HERO = {
  ru: {
    heroTag: '# 01 / ЦЕХ, КОРПУС Б — ВХОД ВОСПРЕЩЁН', heroL1: 'А ТЫ ВЫДЕРЖИШЬ', heroL2: '90 МИНУТ ВНУТРИ?',
    slogan1: '«Бочка: стучите, и отворят вам»', slogan2: '«На небесах только и говорят, что о твоём последнем пранке»',
    attempts: 'ПОПЫТКИ', hint: 'Прислушайся: одна из бочек стучит изнутри.', hintNight: 'Беги по этажам, чини лампы, прячься в бочку. Доживи до 06:00.', hintDead: 'Попытки сгорели. Пригласи друга — цепи спадут.',
    controls: 'УПРАВЛЕНИЕ', controlsText: 'Мышь / палец — осмотреться (луч фонаря). Клик по бочке — постучать.', sound: 'ЗВУК', on: 'ВКЛ', off: 'ВЫКЛ', down: 'ВНИЗ',
    levelWord: 'УРОВЕНЬ', scoreWord: 'БАЛЛЫ', navShop: 'ЦЕХ', navLogline: 'ЛОГЛАЙН', navTrailer: 'ТРЕЙЛЕР', navDossier: 'ДОСЬЕ',
    inviteBtn: 'ПРИГЛАСИТЬ ДРУГА — ВЕРНУТЬ ПОПЫТКИ', modeShop: '01–06 ЦЕХ', modeNightShort: '08 НОЧНАЯ СМЕНА',
    loglineText: 'Популярный блогер заперт в стальной бочке посреди мёртвой промзоны. Единственный ключ — у его собственного отца, прикованного цепями в пяти метрах. Игра на выживание началась.',
    premiere: '17 ДЕКАБРЯ 2026 — В КИНОТЕАТРАХ', cdDays: 'ДНЕЙ', cdHours: 'ЧАСОВ', cdMin: 'МИНУТ', cdSec: 'СЕКУНД',
    trailerTitle: 'ОФИЦИАЛЬНЫЙ ТРЕЙЛЕР', director: 'РЕЖИССЁР — АЛЕКСЕЙ ЗВОНЦОВ', starring: 'В РОЛЯХ — ТИЛЬ ШВАЙГЕР, ФИЛИПП РЕЙНХАРДТ',
    dossierTitle: 'ДОСЬЕ', dossierHint: 'Вещественные доказательства. Дело № 04 / Сектор 3. Персонажи и улики открываются по мере прохождения цеха.', role: 'РОЛЬ',
    lockAfter: 'ОТКРОЕТСЯ ПОСЛЕ УРОВНЯ {n}', prizesTitle: 'ПРИЗЫ И РЕЙТИНГ', footerShare: 'ПОДЕЛИСЬ РЕЗУЛЬТАТОМ МИНИ-ИГРЫ',
    shareResult: 'ПОДЕЛИТЬСЯ РЕЗУЛЬТАТОМ', resultText: 'Мой результат в «БОЧКА: Достучаться до небес»: уровень {l}, {p} баллов. Стучи, и отворят: {url}',
  },
  kz: {
    heroTag: '# 01 / ЦЕХ, Б КОРПУСЫ — КІРУГЕ БОЛМАЙДЫ', heroL1: 'СЕН ІШІНДЕ', heroL2: '90 МИНУТ ШЫДАЙСЫҢ БА?',
    slogan1: '«Бөшке: қағыңдар, сонда сендерге есік ашылады»', slogan2: '«Аспанда тек сенің соңғы пранкің туралы айтады»',
    attempts: 'ӘРЕКЕТТЕР', hint: 'Тыңда: бөшкелердің бірі іштен қағылып жатыр.', hintNight: 'Қабаттарда жүгір, шамдарды жөнде, бөшкеге тығыл. 06:00-ге дейін тірі қал.', hintDead: 'Әрекеттер бітті. Досыңды шақыр — шынжыр түседі.',
    controls: 'БАСҚАРУ', controlsText: 'Тышқан / саусақ — айналаға қарау (фонарь сәулесі). Бөшкені басу — қағу.', sound: 'ДЫБЫС', on: 'ҚОСУЛЫ', off: 'ӨШІРУЛІ', down: 'ТӨМЕН',
    levelWord: 'ДЕҢГЕЙ', scoreWord: 'ҰПАЙ', navShop: 'ЦЕХ', navLogline: 'ЛОГЛАЙН', navTrailer: 'ТРЕЙЛЕР', navDossier: 'ДОСЬЕ',
    inviteBtn: 'ДОСТЫ ШАҚЫР — ӘРЕКЕТТЕРДІ ҚАЙТАР', modeShop: '01–06 ЦЕХ', modeNightShort: '08 ТҮНГІ АУЫСЫМ',
    loglineText: 'Танымал блогер өлі өнеркәсіп аймағының ортасында болат бөшкеде қамалған. Жалғыз кілт — бес метрде шынжырланған өз әкесінде. Тірі қалу ойыны басталды.',
    premiere: '17 ЖЕЛТОҚСАН 2026 — КИНОТЕАТРЛАРДА', cdDays: 'КҮН', cdHours: 'САҒАТ', cdMin: 'МИНУТ', cdSec: 'СЕКУНД',
    trailerTitle: 'РЕСМИ ТРЕЙЛЕР', director: 'РЕЖИССЁР — АЛЕКСЕЙ ЗВОНЦОВ', starring: 'РӨЛДЕРДЕ — ТИЛЬ ШВАЙГЕР, ФИЛИПП РЕЙНХАРДТ',
    dossierTitle: 'ДОСЬЕ', dossierHint: 'Заттай дәлелдер. № 04 іс / 3-сектор. Кейіпкерлер мен дәлелдер цехты өткен сайын ашылады.', role: 'РӨЛ',
    lockAfter: '{n}-ДЕҢГЕЙДЕН КЕЙІН АШЫЛАДЫ', prizesTitle: 'СЫЙЛЫҚТАР МЕН РЕЙТИНГ', footerShare: 'МИНИ-ОЙЫН НӘТИЖЕСІМЕН БӨЛІС',
    shareResult: 'НӘТИЖЕМЕН БӨЛІСУ', resultText: '«БӨШКЕ: Аспанға қол созу» ойынындағы нәтижем: {l}-деңгей, {p} ұпай. Қағыңдар, сонда ашылады: {url}',
  },
  en: {
    heroTag: '# 01 / SHOP, BLOCK B — NO ENTRY', heroL1: 'CAN YOU SURVIVE', heroL2: '90 MINUTES INSIDE?',
    slogan1: '"The Barrel: knock, and it shall be opened"', slogan2: '"In heaven, all they talk about is your last prank"',
    attempts: 'ATTEMPTS', hint: 'Listen: one of the barrels is knocking from inside.', hintNight: 'Run the floors, fix lamps, hide in a barrel. Survive till 06:00.', hintDead: 'Attempts burned out. Invite a friend to drop the chains.',
    controls: 'CONTROLS', controlsText: 'Mouse / finger — look around (flashlight beam). Click a barrel — knock.', sound: 'SOUND', on: 'ON', off: 'OFF', down: 'DOWN',
    levelWord: 'LEVEL', scoreWord: 'SCORE', navShop: 'SHOP', navLogline: 'LOGLINE', navTrailer: 'TRAILER', navDossier: 'DOSSIER',
    inviteBtn: 'INVITE A FRIEND — RESTORE ATTEMPTS', modeShop: '01–06 SHOP', modeNightShort: '08 NIGHT SHIFT',
    loglineText: 'A popular blogger is locked in a steel barrel in the middle of a dead industrial zone. The only key is with his own father, chained five meters away. The survival game has begun.',
    premiere: 'DECEMBER 17, 2026 — IN CINEMAS', cdDays: 'DAYS', cdHours: 'HOURS', cdMin: 'MINUTES', cdSec: 'SECONDS',
    trailerTitle: 'OFFICIAL TRAILER', director: 'DIRECTED BY ALEXEI ZVONTSOV', starring: 'STARRING TILL SCHWEIGER, PHILIP REINHARDT',
    dossierTitle: 'DOSSIER', dossierHint: 'Evidence. Case № 04 / Sector 3. Characters and clues unlock as you clear the shop.', role: 'ROLE',
    lockAfter: 'UNLOCKS AFTER LEVEL {n}', prizesTitle: 'PRIZES & RATING', footerShare: 'SHARE YOUR MINI-GAME RESULT',
    shareResult: 'SHARE RESULT', resultText: "My result in THE BARREL: Knockin' on Heaven's Door: level {l}, {p} points. Knock and it shall be opened: {url}",
  },
};
for (const k of Object.keys(HERO)) Object.assign(T[k], HERO[k]);

export let lang = localStorage.getItem('bochka_lang') || 'ru';
export const locale = () => (lang === 'en' ? 'en-US' : lang === 'kz' ? 'kk-KZ' : 'ru-RU');
export function setLang(l) { lang = l; localStorage.setItem('bochka_lang', l); applyI18n(); document.dispatchEvent(new CustomEvent('langchange')); }
export function t(k, params) {
  let s = (T[lang] && T[lang][k]) || T.ru[k] || k;
  if (params) for (const p of Object.keys(params)) s = s.split('{' + p + '}').join(params[p]);
  return s;
}
export function number(n) { return Math.floor(Number(n) || 0).toLocaleString(locale()); }
export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('.lang__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === lang));
  document.documentElement.lang = lang;
}
export function initLanguage() {
  document.querySelectorAll('.lang__btn').forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });
  applyI18n();
}
const charVoiceCycle = {};

function resolveStudioVoiceClip(text = '', charKey = 'father') {
  const s = String(text || '').toLowerCase();
  if (!s) return null;

  /* 1. Точные реплики бочек на стартовой заставке */
  if (s.includes('стучите, и отворят')) return 'priest_lobby';
  if (s.includes('никто не услышит')) return 'capguy_lobby';
  if (s.includes('выпустите меня')) return 'boy_lobby';
  if (s.includes('камера включена')) return 'girl_lobby';
  if (s.includes('мотор!') || charKey === 'director') return 'director_lobby';
  if (s.includes('я найду тебя')) return 'father_lobby';

  /* 2. Специальные сюжетные и реактивные фразы в игре */
  if (s.includes('попался! бери его')) return 'father_caught';
  if (s.includes('я свободен')) return 'father_free';
  if (s.includes('побойся бога') || s.includes('по пастору') || s.includes('по голове пастора')) return 'priest_hit';
  if (s.includes('по мне стучишь') || s.includes('фонарь из рук') || s.includes('не стальная бочка')) return 'father_hit';
  if (s.includes('по каске') || s.includes('шахтёрский фонарь') || s.includes('толкаешься')) return 'capguy_hit';
  if (s.includes('не пугай меня') || s.includes('телефон не выронила') || s.includes('щекотать')) return 'girl_hit';
  if (s.includes('разговоров, что о море') || s.includes('становится алым')) return 'ocean_1';
  if (s.includes('смотрю на волны') || s.includes('бочке тиля') || s.includes('поворачиваюсь')) return 'ocean_2';
  if (s.includes('кто там') && charKey === 'father') return 'father_2';

  /* 3. Чередующиеся студийные голосовые реплики каждого персонажа */
  const pools = {
    priest: ['priest_1', 'priest_2'],
    father: ['father_1', 'father_2'],
    capguy: ['capguy_1', 'capguy_2'],
    girl: ['girl_1', 'girl_2'],
    boy: ['boy_1', 'boy_2'],
    ocean: ['ocean_1', 'ocean_2'],
  };
  const pool = pools[charKey];
  if (pool && pool.length) {
    const idx = (charVoiceCycle[charKey] || 0) % pool.length;
    charVoiceCycle[charKey] = idx + 1;
    return pool[idx];
  }
  return 'father_1';
}

function cleanSpeechText(raw = '') {
  return String(raw || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/×\s*(\d+)/g, ' умножить на $1 ')
    .replace(/O₂/gi, 'кислород')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text, charKey = 'father') {
  try {
    if (isMuted()) return;
    if (charKey === 'dog') return;

    /* На русском языке воспроизводим настоящие студийные нейросетевые голоса персонажей */
    if (lang === 'ru') {
      const clipKey = resolveStudioVoiceClip(text, charKey);
      if (clipKey) {
        if ('speechSynthesis' in window) {
          try { speechSynthesis.cancel(); } catch { /* ignore */ }
        }
        if (playCharacterVoice(clipKey)) return;
      }
    }

    if (!('speechSynthesis' in window)) return;
    stopCharacterVoice();
    const cleaned = cleanSpeechText(text);
    if (!cleaned) return;
    const u = new SpeechSynthesisUtterance(cleaned);
    const targetLang = lang === 'en' ? 'en-US' : lang === 'kz' ? 'kk-KZ' : 'ru-RU';
    u.lang = targetLang;
    const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
    const prefix = targetLang.slice(0, 2).toLowerCase();
    const langVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(prefix));
    const wantFemale = charKey === 'girl';
    const match = langVoices.find((v) => wantFemale
      ? /irina|svetlana|milena|elena|female|woman|google/i.test(v.name)
      : /pavel|dmitry|yuri|maxim|male|man/i.test(v.name))
      || langVoices[0]
      || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ru'));
    if (match) u.voice = match;
    if (charKey === 'girl') { u.rate = 1.02; u.pitch = 1.08; }
    else if (charKey === 'priest') { u.rate = 0.94; u.pitch = 0.92; }
    else if (charKey === 'capguy') { u.rate = 0.98; u.pitch = 0.95; }
    else if (charKey === 'boy') { u.rate = 1.04; u.pitch = 1.05; }
    else { u.rate = 0.98; u.pitch = 0.94; }
    u.volume = 0.95;
    speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

const WALKER_LINES = {
  ru: {
    father: [
      'Правило цеха: слушай эхо и стучи по дрожащей бочке! А когда мой фонарь светит на бочку — замри!',
      'Правило цепи: все ништяки за цепью! Рукой нельзя: болторез — 1 удар, монтажка — 8, молоток — 30! Снял цепь — больше не стучи!',
      'Правило навыков: трать энергию ⚡ на панели навыков — заморозь время, сделай бочки хрупкими или все бочки призовыми!',
      'Сынок, ты здесь?! Постучи изнутри, а на путях лови воздух, чтобы не задохнуться!',
      'Видишь руку из горловины — бей быстрее, это очки ×2!',
    ],
    capguy: [
      'Правило орудия: для цепи нужен болторез (1 удар), кувалда (3), монтажка (8) или молоток (30)! Рукой нельзя!',
      'Правило навыков: прокачивай карточки навыков и жми их в бою за энергию ⚡ — отвлеки охрану, включи невидимку или рентген!',
      'Запомни: все ништяки лежат за цепью, но как снимешь цепь — больше по этой бочке не стучи!',
      'Следи за воздухом: он нет-нет попадается в бочках везде, собирай его, чтобы не задохнуться!',
    ],
    girl: [
      'Правило игры: используй навыки за энергию ⚡ — можно уменьшить бочки для очков ×3, заморозить время или включить джекпот!',
      'Смотри, бочка в натуральной цепи! Голой рукой не пробить — возьми болторез (1 удар), монтажку (8) или молоток (30)!',
      'Все лучшие ништяки спрятаны за цепью! Только не стучи по бочке после того, как собьёшь цепь!',
      'Лови бочки со значком воздуха — они появляются тут и там, чтобы ты не задохнулся!',
    ],
    priest: [
      'Я принёс бочку для вашего мальчика… Тук-тук! Кто там стучит?!',
      'Правило навыков: копи энергию ⚡ и включай карточки — Невидимку, Хрупкую сталь, Заморозку времени или Все бочки призовые!',
      'Тук-тук! Это я, Тиль Швайгер! Видишь цепь? Рукой нельзя: болторезом — с 1 удара, монтажкой — с 8, молотком — с 30!',
      'Все ништяки закованы за цепью! Но как сорвёшь цепь — не смей больше стучать по этой бочке!',
    ],
    boy: [
      'Эй, подписчики! Жмите навыки на панели за энергию ⚡ — делайте бочки хрупкими, уменьшайте их или включайте все призовые!',
      'Главное правило: как снял цепь и забрал ништяки — больше по этой бочке не стучи!',
      'Когда луч фонарика светит на бочку — замри или включи навык Невидимки!',
    ],
    ocean: [
      'На небе только и разговоров, что о море… и о закате…',
      'Постучи по бочке Тиля, пока я смотрю на волны…',
      'О том, как солнце погружается в волны и становится алым как кровь…',
      'Когда я поворачиваюсь к бочке — стучать нельзя!',
    ],
    dog: ['Ррр… Гав! (Слушай стук из бочки!)', 'Гав-гав! Ррр!'],
  },
  kz: {
    father: [
      'Жоқ… жоқ, мүмкін емес…',
      'Балам, осындасың ба?! Іштен қақшы!',
      'Кеңес: дірілдеп қағылған бөшкені ғана соқ!',
      'Аударылған бөшкеге тиме — ол тұзақ!',
      'Бөшкеден шыққан қол — ×2 ұпай, ал телефон — комбо ×3!',
    ],
    capguy: [
      'Тыныш… маған дыбыс естілді ме?',
      'Кеңес: бос бөшкені соқсаң — ауа мен ұпай жоғалтасың!',
      'Шынжырлы бөшкені қос таппен аш!',
    ],
    girl: [
      'Мұнда кім бар?.. Іштен біреу қағып жатыр!',
      'Кеңес: телефон көрінсе басып үлгер — комбо ×3 қосылады!',
      'Аударылған бөшке — тұзақ, оған тиме!',
    ],
    priest: [
      'Тоқ-тоқ! Бұл кім? Бұл мен, Тиль Швайгер!',
      'Дірілдеген бөшкені қағыңдар — сонда ашылады!',
      'Ережені есте сақта: қол — ×2, телефон — ×3, шынжыр — қос соққы!',
    ],
    boy: [
      'Ей, достар! Мен бөшкеден дыбыс естіп тұрмын!',
      'Фонарь сәулесі бөшкеге түскенде соғуға болмайды!',
    ],
    ocean: [
      'Аспанда тек теңіз туралы айтады…',
      'Мен толқынға қарап отырғанда ТИЛЬ бөшкесін қақ…',
      'Мен бұрылғанда — қағуға болмайды!',
    ],
    dog: ['Ррр… Аф!'],
  },
  en: {
    father: [
      'No… no, this cannot be…',
      'Son, are you in there?! Knock from inside!',
      'Hint: tap only the barrel that shakes and knocks!',
      'Do not touch the fallen barrel — it is a deadly trap!',
      'A hand from the top gives ×2 points, a phone gives ×3 combo!',
    ],
    capguy: [
      'Quiet… did I hear a knock?',
      'Hint: hitting empty barrels drains your air and alerts the guard!',
      'A chained barrel requires a quick double tap!',
    ],
    girl: [
      'Who is here?.. Someone is knocking from inside!',
      'Hint: tap the glowing phone barrel to trigger a ×3 combo!',
      'Avoid the fallen barrel — it costs a life!',
    ],
    priest: [
      "Knock-knock! Who's there? It's Till Schweiger!",
      'Tap the shaking barrel — and it shall be opened!',
      'Remember the rule: hand is ×2, phone is ×3, chains need a double tap!',
    ],
    boy: [
      'Hey guys! Someone is knocking from inside this barrel!',
      'Never tap a barrel while a flashlight beam is shining on it!',
    ],
    ocean: [
      "In heaven, that's all they talk about — the ocean…",
      'Knock on the TILL barrel while I watch the waves…',
      'When I turn around — do not knock!',
    ],
    dog: ['Grrr… Woof!'],
  },
};

const WALKER_HINTS = {
  ru: {
    start: 'Все ништяки за цепью! Рукой цепь нельзя: болторез — 1 удар, кувалда — 3, монтажка — 8, молоток — 30! Как снял цепь — больше не стучи!',
    hand: 'Подсказка: из бочки показалась рука — бей по ней, это бонус ×2!',
    phone: 'Подсказка: над бочкой светится телефон — жми для комбо ×3!',
    chained: 'Для цепи нужен болторез (1 удар), кувалда (3), монтажка (8) или молоток (30)! Рукой нельзя! Все ништяки за цепью, но после снятия цепи не стучи!',
    handChain: 'Голой рукой цепь не сорвать! Переключи инструмент сверху: молоток — 30 ударов, монтажка — 8, кувалда — 3, болторез — с 1 удара!',
    chainOffWarn: 'Цепь снята, все ништяки забраны! Главное — больше НЕ СТУЧИ по этой бочке!',
    hitAfterChain: 'Я же предупреждал: не стучи по бочке после того, как снял цепь! Пустая бочка гремит на весь цех!',
    wrong: 'Осторожно! Не бей по пустым бочкам — теряешь воздух и выдаёшь себя!',
    lowAir: 'Воздух на исходе! Ищи бочки с наклейкой «ВОЗДУХ» или бей по стучащей бочке!',
    shuffle: 'Внимание! Бочки поменялись местами — слушай стук и смотри, где цепь с ништяками!',
    beamCaught: 'Стой! Кто стучал под фонарём?! Я вижу тебя — замри и не бей!',
  },
  kz: {
    start: 'Барлық сыйлықтар шынжырдың артында! Қолмен болмайды: болторез — 1, монтировка — 8, балға — 30 соққы! Шынжырды алған соң қақпа!',
    hand: 'Кеңес: бөшкеден қол шықты — тез басып ×2 бонус ал!',
    phone: 'Кеңес: телефон жанды — комбо ×3 үшін соқ!',
    chained: 'Шынжырға болторез (1 соққы), кувалда (3), монтировка (8) немесе балға (30) керек! Қолмен болмайды!',
    handChain: 'Құр қолмен шынжыр үзілмейді! Құралды ауыстыр: балға — 30, монтировка — 8, болторез — 1 соққы!',
    chainOffWarn: 'Шынжыр алынды, сыйлықтар сенікі! Енді бұл бөшкені ҚАҚПА!',
    hitAfterChain: 'Шынжырды алғаннан кейін бөшкені қақпа дедім ғой!',
    wrong: 'Абайла! Бос бөшкені соқпа — ауа мен ұпай кетеді!',
    lowAir: 'Ауа азайды! «АУА» белгісі бар бөшкені немесе дірілдеген бөшкені соқ!',
    shuffle: 'Назар аудар! Бөшкелер орын ауыстырды — дыбысты тыңда!',
    beamCaught: 'Тоқта! Фонарь астында кім қақты?! Қозғалма, соқпа!',
  },
  en: {
    start: 'All goodies are behind chains! Bare hand cannot break chains: Bolt Cutter 1 hit, Sledge 3, Crowbar 8, Hammer 30! Do not knock after removing the chain!',
    hand: 'Hint: a hand reached out — tap it fast for a ×2 bonus!',
    phone: 'Hint: a phone is glowing — tap it to activate ×3 combo!',
    chained: 'For chains you need Bolt Cutter (1 hit), Sledge (3), Crowbar (8), or Hammer (30)! No bare hands! All goodies are behind the chain!',
    handChain: 'You cannot break chains with bare hands! Switch tool above: Hammer 30 hits, Crowbar 8, Sledge 3, Bolt Cutter 1 hit!',
    chainOffWarn: 'Chain removed & goodies claimed! Do NOT knock this barrel anymore!',
    hitAfterChain: 'I warned you: never knock a barrel after removing its chain!',
    wrong: 'Careful! Hitting empty barrels drains your air and alerts the guard!',
    lowAir: 'Low on air! Hit barrels with the AIR badge to breathe!',
    shuffle: 'Watch out! The barrels swapped places — follow the knocking sound!',
    beamCaught: 'Freeze! Who knocked under the flashlight?! I see you — do not tap!',
  },
};

const walkerSeq = {};
export function walkerLine(key, hintType = null) {
  if (hintType) {
    const hDict = WALKER_HINTS[lang] || WALKER_HINTS.ru;
    if (hDict[hintType]) return hDict[hintType];
  }
  const dict = WALKER_LINES[lang] || WALKER_LINES.ru;
  const arr = dict[key] || dict.father;
  const idx = (walkerSeq[key] || 0) % arr.length;
  walkerSeq[key] = idx + 1;
  return arr[idx];
}
