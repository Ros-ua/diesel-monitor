# Instagram App Review — Diesel Monitor UA

> Черновик для подачи. Русские пояснения — для Роса. Блоки **EN (paste)** вставлять в форму Meta как есть.
> Места «проверить» — выводы из кода, их нужно подтвердить в App Dashboard.

## 0. Коротко (RU)

**Тип входа:** *Instagram API with Instagram Login* (Business Login for Instagram).
- Все запросы идут на `graph.instagram.com`.
- Токен продлевается через `refresh_access_token?grant_type=ig_refresh_token` (`ig-refresh.yml`).
- Facebook-страница не используется.

Поэтому права **`pages_*`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `business_management` НЕ нужны**. Не запрашивать, иначе будет отказ «permission not used».

| Право | Где в коде | Эндпоинты | Сейчас |
|---|---|---|---|
| `instagram_business_basic` | все скрипты, `ig-insights.mjs`, `ig-bridge.mjs` | `GET /me`, `GET /me/media`, `refresh_access_token` | работает |
| `instagram_business_content_publish` | `instagram-carousel.mjs`, `instagram-news.mjs`, `instagram-story.mjs`, `instagram-reel.mjs` | `POST /{ig-id}/media` (IMAGE / CAROUSEL / STORIES / REELS), `GET /{container}?fields=status_code`, `POST /{ig-id}/media_publish` | **работает** |
| `instagram_business_manage_insights` | `ig-insights.mjs` | `GET /{media-id}/insights?metric=reach` | reach не приходит |
| `instagram_business_manage_comments` | `ig-bridge.mjs` | `GET /{media-id}/comments`, `POST /{comment-id}/replies` | тексты не приходят, cron выключен |
| `instagram_business_manage_messages` | `ig-bridge.mjs` | `GET /me/conversations`, `GET /{conversation-id}?fields=messages{…}`, `POST /me/messages` | не работает, cron выключен |

**Что требует Advanced Access.** Standard Access даёт данные только пользователей, у которых есть роль в приложении. У @diesel.monitor.ua роль есть.

- **Публикация уже работает на Standard.** В ревью её не включать: каждое лишнее право — это лишний скринкаст и лишний риск отказа.
- **`manage_messages` — Advanced обязателен:** авторы директа — посторонние люди.
- **`manage_comments` — почти наверняка Advanced**, по той же причине. Сначала исключить простую причину: в токене может просто не быть этого scope (см. §9).
- **`instagram_business_basic`** подаётся вместе с ними как обязательная зависимость.
- **`manage_insights`** — метрики только своего аккаунта, Standard должен хватать. Перевыпустить токен с этим scope и запустить `ig-insights` вручную. Если reach пришёл — в ревью это право не включать.

**Минимальный пакет:** `instagram_business_basic` + `instagram_business_manage_comments` + `instagram_business_manage_messages`.

**До записи скринкаста обязательно:**
1. `ig-bridge.mjs:209` — проверить по документации, нужен ли `platform=instagram` в `me/conversations`. Без него DM могут не читаться молча.
2. **Не хранить username и ID комментаторов** в публичной ветке `ig-bridge-state` (поле `who`, `ig-bridge.mjs:197,242`). Сейчас это противоречит странице приватности, а Meta это проверяет.
3. Убедиться, что ветка `ig-bridge-state` существует (она есть). Без неё workflow моста падает.
4. Добавить в `/privacy/` английский раздел (текст в §6).
5. Стейт моста пишется только в конце прогона. Если прогон упадёт после ответа, ответ уйдёт повторно, а он публичный. Желательно писать стейт сразу после каждого ответа.

## 1. App settings (Basic)

- App name: **Diesel Monitor UA**
- App icon: `assets/app-icon-1024.png` (1024×1024)
- Category: *Business and Pages* (или *Utility & Productivity*)
- App Domains: `diesel-monitor.pp.ua`
- Privacy Policy URL: `https://diesel-monitor.pp.ua/privacy/`
- User Data Deletion → Data Deletion Instructions URL: `https://diesel-monitor.pp.ua/privacy/#delete` (проверить, что якорь есть)
- Contact email: тот же, что на странице privacy
- Instagram → API setup with Instagram login → Business login settings → OAuth redirect URI: `https://diesel-monitor.pp.ua/`

## 2. App description — EN (paste)

> Diesel Monitor UA (diesel-monitor.pp.ua) is a free, non-commercial public dashboard of retail fuel prices in Ukraine (diesel, gasoline, LPG), built from open data (Ministry of Finance fuel price index, National Bank of Ukraine exchange rates, public RSS news).
> The app is an internal, server-side tool used by one business only — our own Instagram professional account @diesel.monitor.ua. It has no end users other than the account owner and no public login.
> It (1) publishes daily price cards, carousels, stories and short Reels generated from open data to our own account; (2) sends the owner a weekly performance summary of our own posts; and (3) lets the owner read and reply to comments and direct messages on our account from a private Telegram chat, so that followers who ask about fuel prices get a timely, human-written answer. All replies are written manually by the account owner; the app never sends automated or bulk messages.

## 3. Permission justifications — EN (paste)

### instagram_business_basic
> We use instagram_business_basic to identify our own Instagram professional account (id, username, followers_count, media_count) and to list our own recent media (id, caption, permalink, timestamp, media_type, like_count, comments_count). This is needed to (a) resolve the account ID used for publishing, (b) find which of our posts have new comments so the owner can answer them, and (c) build a weekly summary of likes and comments on our own posts that is sent privately to the account owner. We only access the account that belongs to us; no data about other accounts is collected.

### instagram_business_manage_comments
> Followers often ask questions about fuel prices under our posts (e.g. "where is diesel cheapest in Lviv today?"). The account owner is not always in the Instagram app, so our tool reads new comments on our own recent posts (comment id, text, username, timestamp) and forwards each new comment to the owner's private Telegram chat. When the owner replies to that notification, the tool posts the owner's reply as a reply to the original comment (POST /{comment-id}/replies). Every reply is typed by a human; nothing is generated or sent automatically. Only the comment ID is kept, to avoid forwarding the same comment twice; it is not shared with anyone. We do not hide, delete or moderate comments with this permission.

### instagram_business_manage_messages
> People send our account direct messages asking about prices, stations and data on our website. Our tool lists conversations of our own account, forwards new incoming messages to the owner's private Telegram chat and, when the owner replies there, sends that human-written reply back to the same person via POST /me/messages within the standard 24-hour messaging window. We never initiate conversations, never send promotional or bulk messages and never use automated replies. Only message IDs are kept (to avoid duplicate forwarding); message texts are not stored by us.

### instagram_business_manage_insights (только если понадобится, см. §0)
> Once a week the tool reads the reach metric (GET /{media-id}/insights?metric=reach) for our own posts from the last 7 days and sends a short summary to the account owner in a private Telegram chat, so we can see which kinds of posts (price carousel, news card, Reel) are useful to our audience. Only our own account's aggregated metrics are read; they are not shared or sold.

### instagram_business_content_publish (не подавать, пока работает на Standard)
> After our data collection job finishes each day, the tool generates images/videos with the day's average fuel prices and publishes them to our own account: a carousel, a single-image news post, a story and occasionally a Reel. Content is generated only from public open data and published only to @diesel.monitor.ua.

## 4. Reviewer instructions — EN (paste)

> This app is a private back-office tool for a single Instagram professional account (@diesel.monitor.ua) that we own. It runs on a schedule (GitHub Actions) and has no public web UI or user login beyond the one-time Instagram Business Login performed by the account owner. The account owner's "inbox" is a private Telegram chat with our bot. For this reason reviewers cannot log into the tool itself; the attached screencasts show the complete flow end to end:
>
> 1. The account owner signs in with Instagram Business Login and grants the requested permissions (consent screen visible).
> 2. A second Instagram account (our test user) leaves a comment on one of our posts.
> 3. The tool runs; the comment (text, username, link to the post) appears in the owner's Telegram chat.
> 4. The owner replies to that Telegram message; the tool posts the reply under the original comment on Instagram (shown in the Instagram app).
> 5. The test user sends a direct message to @diesel.monitor.ua; it appears in Telegram; the owner replies; the reply is shown in the test user's Instagram Direct.
>
> Telegram messages are in Ukrainian; English captions in the video explain every step.
> Test Instagram account (optional): username: ______ / password: ______ (2FA disabled).
> Our account: https://www.instagram.com/diesel.monitor.ua/ — Website: https://diesel-monitor.pp.ua/

## 5. Сценарий скринкаста (RU; подписи в видео — EN)

**Общие правила:**
- 1080p, курсор виден, без монтажа, скрывающего переходы.
- На каждом шаге английская подпись: интерфейс на украинском.
- **Токены, секреты, номера телефонов не показывать.**
- Один ролик на право, 1–3 минуты.

**Ролик A — Login + basic**
1. App Dashboard, видно название приложения. Подпись: *"Internal tool for @diesel.monitor.ua"*.
2. Открыть Business Login URL со scope `instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages`.
3. Войти как @diesel.monitor.ua. **Задержаться на экране согласия.** Нажать Allow.
4. GitHub → Actions → «Зведення Instagram» → Run workflow.
5. Показать сводку в Telegram. Подпись: *"Weekly summary sent privately to the owner"*.

**Ролик B — comments**
1. Тестовый аккаунт пишет комментарий под постом: *"Where is diesel cheapest today?"*.
2. Run workflow моста. В Telegram приходит «💬 Коментар…». Подпись: *"Comment forwarded to owner"*.
3. Ответить Reply в Telegram. Снова Run workflow. Приходит «✅ Відповідь надіслано».
4. В Instagram под комментарием виден ответ. Подпись: *"Human-written reply visible on Instagram"*.

**Ролик C — messages**
1. Заранее: тестовый аккаунт подписан, его запрос на переписку принят.
2. Тестовый аккаунт пишет в Direct.
3. Run workflow моста. В Telegram приходит «📩 Особисте…».
4. Reply в Telegram. Run workflow.
5. На телефоне тестового аккаунта ответ пришёл. Подпись: *"Reply within 24h window; no automated messages"*.

## 6. Privacy policy

**Сейчас на `public/privacy/index.html`:**

Есть:
- ✅ страница публичная;
- ✅ есть контакты для удаления данных.

Не хватает:
- ❌ английского раздела;
- ❌ перечня данных Instagram;
- ❌ обработчиков (Telegram, GitHub);
- ❌ срока хранения;
- ❌ фраза «дані третіх осіб не зберігаються поза Instagram» **сейчас неверна** (см. §0 п.2). Сначала исправить код, потом текст.

**Добавить (EN):**

> ### Instagram data (English)
> The "Diesel Monitor UA" app is used only by the owner of the Instagram professional account @diesel.monitor.ua.
> **What we access:** our own account profile and media; comments on our own posts (comment ID, text, username, time); direct messages sent to our account (message ID, sender's Instagram-scoped ID and username, text, time); aggregated metrics of our own posts (likes, comments, reach).
> **Why:** to publish our fuel-price content, to let the account owner read and manually reply to comments and messages, and to review how our own posts perform.
> **Where it goes:** new comments and messages are forwarded to the account owner's private Telegram chat so they can reply. Automation runs on GitHub Actions. We do not sell, rent or share this data with advertisers or any other third party, and we do not use it for profiling.
> **Retention:** we keep only comment and message IDs (no texts, no usernames) for up to 30 days to avoid duplicate notifications. Weekly summaries are not stored.
> **Deletion:** to have any data related to you deleted, contact us via the Telegram or email address below; we delete it within 30 days and confirm by reply.
> **Contact:** see the contacts section of this page.

**Data Handling Questions (EN, черновик):**
- Data processors: *Telegram (delivery of notifications to the account owner), GitHub (hosting of the automation and minimal state).*
- Sharing with third parties: *No, except delivery to the owner's own Telegram chat as described.*
- Responsible entity / country: *______ (individual / ФОП), Ukraine.*
- Requests from public authorities: *None received; we would only comply with legally binding requests after review, disclosing the minimum required.*

## 7. Business verification (RU)

- Для Advanced Access Meta обычно требует Business Verification бизнес-портфеля, к которому привязано приложение.
- Где: business.facebook.com → Security Centre → Start verification.
- Что нужно:
  - юридическое имя и адрес;
  - **выписка ФОП / ЄДР**;
  - телефон;
  - сайт `diesel-monitor.pp.ua`;
  - желательно email на домене или подтверждение домена (DNS или meta-тег).
- Если ФОП нет — это вероятный блокер. Проверить в Dashboard, можно ли подать как Individual developer.
- Привязать приложение к портфелю: App Settings → Basic → Business portfolio.

## 8. Тестовые пользователи (RU)

- App Roles → **Instagram Testers**: добавить второй (тестовый) аккаунт.
- Принять приглашение: Instagram (web) → Settings → Apps and websites → Tester invites.
- Тестовому аккаунту: подписаться на @diesel.monitor.ua, чтобы его запрос на переписку был принят.
- В @diesel.monitor.ua: Settings → Messages and story replies → Message controls → Connected tools → **Allow access to messages = ON**.
- Ревьюерам давать только тестовый аккаунт без 2FA, **не основной**.

## 9. Чеклист Роса

- [ ] Перевыпустить токен через Business Login с нужными scope. Проверить их в Access Token Debugger. Обновить секрет `INSTAGRAM_TOKEN`.
- [ ] Вручную запустить `ig-insights`: пришёл ли reach? Если да, insights в ревью не включать.
- [ ] Починить мост (§0 п.1, 2, 5) — это разработка, можно поручить Claude.
- [ ] Обновить privacy: английский раздел, срок хранения, Telegram и GitHub.
- [ ] Заполнить App Settings → Basic (§1).
- [ ] Пройти Business Verification.
- [ ] Добавить Instagram Tester, включить «Allow access to messages».
- [ ] Записать ролики A–C.
- [ ] Заполнить Data Handling, вставить тексты из §2–4, подать.
- [ ] После одобрения:
  - перевести приложение в **Live**;
  - включить cron моста не чаще `*/15`;
  - опрашивать только посты, где вырос `comments_count`, чтобы снова не упереться в лимит запросов, который уже блокировал публикации.
- [ ] Раз в год проходить Data Use Checkup.
