# 1. Какие разрешения использует наш код

## Как устроено (для новичка)

- «Разрешение» (permission, scope) — это пункт, на который владелец аккаунта соглашается
  при входе через Instagram. Без него API отвечает ошибкой.
- Все наши скрипты ходят на адрес `https://graph.instagram.com/v23.0`. Это значит, что
  приложение использует **Instagram API with Instagram Login** (вход через Instagram,
  без Facebook-страницы). Поэтому все права называются `instagram_business_*`.
- Ключ доступа лежит в секрете GitHub `INSTAGRAM_TOKEN` (значение здесь не приводится).
  Раз в месяц его продлевает workflow `.github/workflows/ig-refresh.yml`
  (запрос `GET /refresh_access_token?grant_type=ig_refresh_token`).

**Не просить** права от «другого» API (`instagram_basic`, `instagram_content_publish`,
`pages_show_list`, `pages_read_engagement`, `business_management`). Наш код их не использует,
а Meta отказывает за права, которые «не видны в работе приложения».

## Сводная таблица

| Разрешение | Нужно для автопубликации? | Где в коде | Какие запросы | Состояние на 28.09.2026 |
|---|---|---|---|---|
| `instagram_business_basic` | **Да** (обязательная база) | все скрипты | `GET /me?fields=id,username`, `GET /me/media`, `GET /{контейнер}?fields=status_code` | работает |
| `instagram_business_content_publish` | **Да** (главное) | `scripts/instagram-carousel.mjs`, `instagram-news.mjs`, `instagram-story.mjs`, `instagram-reel.mjs` | `POST /{ig-id}/media`, `POST /{ig-id}/media_publish` | работает (Standard Access) |
| `instagram_business_manage_insights` | Нет | `scripts/ig-insights.mjs:30` | `GET /{media-id}/insights?metric=reach` | охват не приходит |
| `instagram_business_manage_comments` | Нет | `scripts/ig-bridge.mjs:72,175` | `GET /{media-id}/comments`, `POST /{comment-id}/replies` | мост выключен |
| `instagram_business_manage_messages` | Нет | `scripts/ig-bridge.mjs:109,121,177` | `GET /me/conversations`, `POST /me/messages` | мост выключен |

Для задачи «автопубликация» нужны **только первые два**. Остальные три — для отдельной
функции «мост в Telegram» и недельной сводки; они описаны в `docs/APP_REVIEW.md`.

## 1.1. `instagram_business_basic` — «кто я»

**Зачем:** перед каждой публикацией скрипт спрашивает у Instagram ID своего аккаунта
(`/me`). Без ID не к чему «прикрепить» пост.

Где в коде:
- `scripts/instagram-carousel.mjs:319` — `GET /me?fields=id`
- `scripts/instagram-news.mjs:400` — `GET /me?fields=id,username`
- `scripts/instagram-story.mjs:153` — `GET /me?fields=id`
- `scripts/instagram-reel.mjs:71` — `GET /me?fields=id,username`
- `scripts/instagram-carousel.mjs:363` — `GET /{ig-id}/media?fields=id,timestamp,media_type`:
  страховка. Если Instagram ответил ошибкой на публикацию, скрипт смотрит 3 последних поста —
  не вышел ли пост всё-таки (чтобы не опубликовать дубль).
- `scripts/instagram-news.mjs:42`, `scripts/instagram-reel.mjs:35` — `GET /{контейнер}?fields=status_code`:
  ждём, пока Instagram «переварит» картинку/видео (статус `FINISHED`).

Meta: `instagram_business_basic` — обязательная зависимость для всех остальных прав;
подаётся в ревью всегда вместе с ними.

## 1.2. `instagram_business_content_publish` — «опубликовать»

**Зачем:** это само действие публикации. Публикация в Instagram API идёт в 2 шага:
1. `POST /{ig-id}/media` — создать «контейнер» (черновик): даём ссылку на картинку/видео и подпись.
2. `POST /{ig-id}/media_publish` — опубликовать контейнер.

Картинку Instagram скачивает сам по ссылке, поэтому workflow сначала коммитит файл в репозиторий,
а потом даёт ссылку вида `https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards/...`.

| Что публикуем | Скрипт | Workflow (когда запускается) | Тип |
|---|---|---|---|
| Карусель цен (5 слайдов) | `instagram-carousel.mjs:325,335,348` | `instagram.yml` — после «Збір цін (щодня)» | 5 × `is_carousel_item` → `media_type=CAROUSEL` |
| Карточка новости | `instagram-news.mjs:442,451` | `ig-news.yml` — каждый день 16:00 UTC | картинка + подпись |
| Сторис с ценами | `instagram-story.mjs:156,170` | `ig-story.yml` — после сбора цен | `media_type=STORIES` |
| Reels с графиком | `instagram-reel.mjs:75,91` | `reels.yml` — проверка в 05:30 UTC, ролик только при движении цены ≥1% | `media_type=REELS`, `share_to_feed=true` |

Нагрузка: максимум ~4 публикации в сутки. Лимит Meta — 100 публикаций через API за
скользящие 24 часа (карусель считается как одна). Запас огромный.

## 1.3. Что НЕ используется (и поэтому не подавать)

- Стикеры-ссылки, опросы, музыка из библиотеки Instagram — через API недоступны никому
  (об этом же комментарии в `instagram-story.mjs` и `reels.yml`).
- Отметки людей и товаров (`user_tags`, `product_tags`) — в коде нет.
- Вебхуки (webhooks) — в коде нет, всё работает опросом по расписанию.

## 1.4. Нужен ли App Review именно для публикации

Коротко: **для своего аккаунта — нет** (подробности и источники — в `05-sources-and-open-questions.md`).

- **Standard Access** (базовый доступ) — выдаётся автоматически, работает для аккаунтов,
  у которых есть роль в приложении. @diesel.monitor.ua такую роль имеет — поэтому посты и выходят.
- **Advanced Access** (расширенный доступ) — нужен, когда приложением пользуются чужие аккаунты.
  Выдаётся только через App Review + Business Verification.
