# БОЧКА: Упакуй друга (`bochka.quest`)

Вирусная промо-игра и Telegram Mini App к выходу психологического триллера **«Бочка»** (в прокате с **17 декабря**).

## Стек
- **Vite + Vanilla ES Modules**
- **Three.js** — 6 процедурных 200-литровых стальных бочек (`LatheGeometry`), мокрый бетонный пол, геометрические тени заводских окон, шейдерные вмятины от ударов и срыв крышки с нырком камеры
- **Web Audio API (`PannerNode`)** — 3D-пространственная прослушка металла (глухой стук ладонями и дыхание внутри загаданной бочки vs сквозняк и капли воды в пустых)
- **HTML5 Canvas** — клиентский кроп и сжатие портретов до `600×600` WebP (`< 80 КБ`) + мгновенная генерация вертикального постера для Сторис `1080×1920` (9:16 PNG)
- **Supabase + Telegram WebApp SDK** — таблица `barrels`, Storage `barrel-portraits` и пуш-уведомления отправителю (с полным автономным fallback-режимом через `localStorage` + `base64url` до подключения ключей)
- **Локализация** — `RU` / `KZ` / `EN` (`src/dict.json`)

## Быстрый старт
```bash
npm install
npm run dev      # локальный запуск Vite
npm run lint     # проверка синтаксиса модулей и словаря RU/KZ/EN
npm run build    # чистый продакшн-билд в dist/ (base: './')
```

## Подключение Supabase и Telegram-бота
1. Скопируйте `.env.example` в `.env` и укажите `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TG_BOT_USERNAME` (и `VITE_TG_NOTIFY_WEBHOOK` / `VITE_TG_BOT_TOKEN`).
2. Выполните SQL-скрипт [`supabase/schema.sql`](./supabase/schema.sql) в SQL Editor вашего проекта Supabase.
