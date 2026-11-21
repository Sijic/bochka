// ============================================================================
// БОЧКА — ЕДИНЫЙ ЮРИДИЧЕСКИЙ КОНФИГ И ДОКУМЕНТЫ (152-ФЗ РФ)
// Лениво подгружается в #modal-legal по клику и на странице /legal.html.
// Чтобы поменять почту поддержки или реквизиты, отредактируйте LEGAL_ORG_CONFIG ниже.
// ============================================================================

export const LEGAL_ORG_CONFIG = {
  organizerFull: 'Общество с ограниченной ответственностью «БИГСКРИНПРОДАКШН»',
  organizerShort: 'ООО «БИГСКРИНПРОДАКШН»',
  production: 'кинокомпании «Киноцех» и ООО «БИГСКРИНПРОДАКШН»',
  inn: '5031151390',
  kpp: '503101001',
  ogrn: '1235000076750',
  legalAddress: '142450, Московская область, г. Старая Купавна, ул. Октябрьская, д. 14а, к. 1, кв. 363',
  // Почта поддержки и обращений по отзыву/удалению персональных данных:
  supportEmail: 'support@bochka.quest',
  ageRating: '18+',
  filmTitle: '«БОЧКА»',
  promoStart: '21 ноября 2026 года',
  promoEnd: '17 декабря 2026 года',
  burnDeadline: '16 декабря 2026 года в 23:59 МСК',
  botHandle: '@bochka_film_bot',
  siteUrl: 'https://bochka.quest',
  legalPageUrl: 'https://bochka.quest/legal.html',
};

export const LEGAL_SECTIONS = {
  rules: {
    id: 'rules',
    tabLabel: 'Правила акции',
    title: 'Раздел 1. Правила рекламной акции «БОЧКА»',
    blocks: [
      {
        heading: '1.1. Общие положения и Организатор',
        paragraphs: [
          `Рекламная акция «БОЧКА» (далее — Акция) приурочена к выходу в прокат художественного фильма ${LEGAL_ORG_CONFIG.filmTitle} (производство: ${LEGAL_ORG_CONFIG.production}). Возрастное ограничение участия: ${LEGAL_ORG_CONFIG.ageRating}.`,
          `Организатор Акции: ${LEGAL_ORG_CONFIG.organizerFull} (${LEGAL_ORG_CONFIG.organizerShort}), ИНН ${LEGAL_ORG_CONFIG.inn}, КПП ${LEGAL_ORG_CONFIG.kpp}, ОГРН ${LEGAL_ORG_CONFIG.ogrn}, юридический адрес: ${LEGAL_ORG_CONFIG.legalAddress}.`,
          'Настоящая Акция не является лотереей или иной основанной на риске азартной игрой (ст. 2 Федерального закона № 138-ФЗ «О лотереях»). Плата за участие в Акции не взимается, а получение призов основано на игровой активности, внимательности и результатах участников в веб-игре и Telegram Mini App @bochka_film_bot.',
        ],
      },
      {
        heading: '1.2. Сроки проведения и сгорание билетов',
        bullets: [
          `Общий срок проведения Акции: с ${LEGAL_ORG_CONFIG.promoStart} по ${LEGAL_ORG_CONFIG.promoEnd} (включительно).`,
          `Все неактивированные подарочные билеты, по которым получатель не оформил бронь, автоматически аннулируются ${LEGAL_ORG_CONFIG.burnDeadline}.`,
        ],
      },
      {
        heading: '1.3. Механика подарочного билета и жёсткие лимиты',
        bullets: [
          'Участник собирает в игре 4 части электронного билета (от 1/4 до 4/4) за прохождение уровней, приглашение друзей и победы в дуэлях.',
          'Собранный билет можно исключительно подарить другому человеку — самовыкуп и активация подарка на собственный аккаунт запрещены.',
          'Призовой фонд: базовый фонд — 100 бесплатных билетов, при высокой активности может автоматически расширяться до 150 билетов (суточный лимит 4–8 шт., обновление суточного лимита происходит в 00:00 по московскому времени).',
          'При исчерпании суточного или общего лимита вместо билета участнику начисляются бонусные игровые очки рейтинга (⭐) в борьбу за Суперприз.',
        ],
      },
      {
        heading: '1.4. Режим предпродажной брони до открытия касс',
        paragraphs: [
          `До открытия официальных продаж билетов на фильм ${LEGAL_ORG_CONFIG.filmTitle} в кинотеатрах (ориентировочно за 4–7 дней до 17 декабря 2026 года) заявка получателя подарка фиксируется в системе как гарантированная бронь.`,
          `После открытия расписания и касс кинотеатров Организатор выкупает билет в соответствии с пожеланием получателя (город, кинотеатр, желаемый день) и направляет готовый электронный билет (QR-код / код брони) напрямую в Telegram-бот ${LEGAL_ORG_CONFIG.botHandle}.`,
        ],
      },
      {
        heading: '1.5. Суперприз — Закрытый показ 17 декабря 2026 года',
        bullets: [
          '20 (двадцать) лидеров итогового рейтинга (ТОП-20) получают именные приглашения на Закрытый показ фильма «БОЧКА» в Москве 17 декабря 2026 года.',
          'Если победитель из ТОП-20 проживает за пределами Москвы и Московской области, приз автоматически заменяется на 2 (два) бесплатных билета в кинотеатр его города на премьерную неделю показа.',
        ],
      },
      {
        heading: '1.6. Антифрод и ограничения участия',
        bullets: [
          'Один подтверждённый номер телефона может получить не более 1 (одного) бесплатного подарочного билета за всё время Акции.',
          'Члены съёмочной группы, продюсеры, сотрудники Организатора и партнёры кампании исключены из призового пула и не участвуют в распределении призов.',
          'Организатор вправе аннулировать игровые результаты, очки и заявки без компенсации при выявлении использования ботов, скриптов автоматизации, мультиаккаунтов, подмены данных или иных попыток накрутки.',
        ],
      },
    ],
  },

  terms: {
    id: 'terms',
    tabLabel: 'Соглашение',
    title: 'Раздел 2. Пользовательское соглашение (фото и голос в бочках)',
    blocks: [
      {
        heading: '2.1. Ответственность за загружаемый контент',
        paragraphs: [
          `Используя интерактивную игру ${LEGAL_ORG_CONFIG.filmTitle} (${LEGAL_ORG_CONFIG.siteUrl} и Telegram Mini App ${LEGAL_ORG_CONFIG.botHandle}), участник подтверждает достижение возраста ${LEGAL_ORG_CONFIG.ageRating} и принимает условия настоящего Пользовательского соглашения.`,
          'Участник самостоятельно и в полном объёме несёт ответственность за любые фотографии, изображения, текстовые подписи и голосовые записи, загружаемые или записываемые им для упаковки «бочек» и отправки друзьям.',
        ],
      },
      {
        heading: '2.2. Запрещённый контент',
        bullets: [
          'Запрещена загрузка и распространение нецензурной брани, угроз, оскорблений, клеветы и материалов, унижающих честь и достоинство граждан.',
          'Запрещены материалы порнографического характера, шок-контент, пропаганда насилия, наркотиков, экстремизма и любые иные материалы, нарушающие законодательство Российской Федерации.',
          'Запрещено использовать фотографии, голоса, товарные знаки и объекты авторского права третьих лиц без их законного согласия.',
        ],
      },
      {
        heading: '2.3. Модерация и удаление медиафайлов',
        bullets: [
          'Организатор вправе без предварительного уведомления удалить любой пользовательский контент, нарушающий настоящие правила, и ограничить доступ участника к игре и призам.',
          'Все загруженные игровые медиафайлы (селфи, изображения и голосовые аудиозаписи) хранятся временно исключительно на период проведения Акции и полностью удаляются после её завершения.',
        ],
      },
    ],
  },

  privacy: {
    id: 'privacy',
    tabLabel: 'Конфиденциальность',
    title: 'Раздел 3. Политика конфиденциальности (152-ФЗ РФ)',
    blocks: [
      {
        heading: '3.1. Оператор персональных данных',
        paragraphs: [
          `Обработка персональных данных пользователей осуществляется в соответствии с Федеральным законом РФ от 27.07.2006 № 152-ФЗ «О персональных данных».`,
          `Оператор персональных данных: ${LEGAL_ORG_CONFIG.organizerFull} (${LEGAL_ORG_CONFIG.organizerShort}), ИНН ${LEGAL_ORG_CONFIG.inn}, КПП ${LEGAL_ORG_CONFIG.kpp}, ОГРН ${LEGAL_ORG_CONFIG.ogrn}, юридический адрес: ${LEGAL_ORG_CONFIG.legalAddress}.`,
        ],
      },
      {
        heading: '3.2. Перечень собираемых данных',
        bullets: [
          'Идентификатор Telegram (Telegram ID), отображаемое имя и username пользователя в Telegram.',
          'Номер телефона — собирается исключительно при добровольном подтверждении контакта через системную функцию Telegram для оформления брони бесплатного билета.',
          'Указанный пользователем город, желаемый кинотеатр и день посещения сеанса.',
          'Добровольно загруженные игровые медиафайлы (фотографии и голосовые записи внутри игровых бочек).',
        ],
      },
      {
        heading: '3.3. Цели обработки и защита данных',
        bullets: [
          'Обеспечение корректной работы игры, сохранение игрового прогресса, подсчёт рейтинга и доставка игровых уведомлений через @bochka_film_bot.',
          'Защита призового фонда от повторных выдач и ботов (правило: 1 номер телефона = 1 бесплатный билет).',
          'Покупка, оформление и доставка электронного билета или приглашения на Закрытый показ победителю.',
          'Персональные данные не продаются и не передаются третьим лицам, за исключением случаев, строго необходимых для покупки и оформления билета или исполнения требований законодательства РФ.',
        ],
      },
      {
        heading: '3.4. Срок хранения, отзыв согласия и удаление данных',
        paragraphs: [
          'Персональные данные хранятся в течение срока проведения Акции (до 17 декабря 2026 года) плюс 30 (тридцать) календарных дней для завершения выдачи призов и урегулирования обращений, после чего подлежат полному уничтожению.',
          `Участник вправе в любой момент отозвать согласие на обработку персональных данных и потребовать их удаления, направив обращение в свободной форме (с указанием Telegram ID или номера телефона) на электронную почту поддержки Оператора: ${LEGAL_ORG_CONFIG.supportEmail}.`,
        ],
      },
    ],
  },
};

function appendRequisitesCard(parent) {
  const box = document.createElement('div');
  box.className = 'legal-req-card';

  const title = document.createElement('strong');
  title.textContent = 'Реквизиты Организатора и Оператора ПДн';
  box.appendChild(title);

  const lines = [
    `${LEGAL_ORG_CONFIG.organizerFull} (${LEGAL_ORG_CONFIG.organizerShort})`,
    `ИНН: ${LEGAL_ORG_CONFIG.inn} · КПП: ${LEGAL_ORG_CONFIG.kpp} · ОГРН: ${LEGAL_ORG_CONFIG.ogrn}`,
    `Юридический адрес: ${LEGAL_ORG_CONFIG.legalAddress}`,
    `Возрастное ограничение: ${LEGAL_ORG_CONFIG.ageRating}`,
  ];
  for (const text of lines) {
    const p = document.createElement('p');
    p.textContent = text;
    box.appendChild(p);
  }

  const mailP = document.createElement('p');
  mailP.textContent = 'Почта поддержки и отзыва данных: ';
  const a = document.createElement('a');
  a.href = `mailto:${LEGAL_ORG_CONFIG.supportEmail}`;
  a.textContent = LEGAL_ORG_CONFIG.supportEmail;
  mailP.appendChild(a);
  box.appendChild(mailP);

  parent.appendChild(box);
}

function buildSectionNode(sec) {
  const article = document.createElement('article');
  article.className = 'legal-article';
  article.id = sec.id;

  const h3 = document.createElement('h3');
  h3.className = 'legal-section-title';
  h3.textContent = sec.title;
  article.appendChild(h3);

  for (const block of sec.blocks) {
    if (block.heading) {
      const h4 = document.createElement('h4');
      h4.className = 'legal-block-heading';
      h4.textContent = block.heading;
      article.appendChild(h4);
    }
    if (Array.isArray(block.paragraphs)) {
      for (const txt of block.paragraphs) {
        const p = document.createElement('p');
        p.className = 'legal-p';
        p.textContent = txt;
        article.appendChild(p);
      }
    }
    if (Array.isArray(block.bullets)) {
      const ul = document.createElement('ul');
      ul.className = 'legal-list';
      for (const item of block.bullets) {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      }
      article.appendChild(ul);
    }
  }

  return article;
}

export function renderLegalSectionInto(container, tabKey = 'rules') {
  if (!container) return;
  const key = LEGAL_SECTIONS[tabKey] ? tabKey : 'rules';
  container.textContent = '';
  container.appendChild(buildSectionNode(LEGAL_SECTIONS[key]));
  appendRequisitesCard(container);
  container.scrollTop = 0;
}

export function renderAllLegalSectionsInto(container) {
  if (!container) return;
  container.textContent = '';
  for (const key of ['rules', 'terms', 'privacy']) {
    container.appendChild(buildSectionNode(LEGAL_SECTIONS[key]));
  }
  appendRequisitesCard(container);
}
