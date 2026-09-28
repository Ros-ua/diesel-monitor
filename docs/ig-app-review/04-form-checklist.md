# 4. Чек-лист полей формы Meta

Обозначения: ✅ есть · ⚠️ есть, но надо доделать · ❌ нет · 👤 делает владелец в кабинете Meta
(из кода это не видно, проверить вручную).

## 4.1. App Settings → Basic

| Поле | Статус | Что у нас / что сделать |
|---|---|---|
| **Display name** (название) | 👤 | `Diesel Monitor UA`. Без слов «Instagram», «Meta», «Insta» — Meta их запрещает в названиях. |
| **App icon** 1024×1024 | ✅ | Файл есть в репозитории: `assets/app-icon-1024.png` (PNG 1024×1024). Загрузить вручную. На сайте он не опубликован — и не нужно. |
| **Privacy Policy URL** | ⚠️ | https://diesel-monitor.pp.ua/privacy/ (файл `public/privacy/index.html`). Страница открыта всем, ссылка есть в подвале сайта (`src/App.tsx:75`). Не хватает английского текста и раздела про Instagram-данные — см. 4.3. |
| **User data deletion** | ✅ / ⚠️ | Вариант «Data Deletion Instructions URL»: https://diesel-monitor.pp.ua/privacy/#delete — якорь `id="delete"` на странице **есть**. Текст только на украинском → добавить английский (см. 4.3). Callback URL (автоматическое удаление) нам не нужен: у сайта нет сервера. |
| **Terms of Service URL** | ❌ (не обязательно) | Страницы условий нет. Для этого типа приложения поле необязательное. Если захотите — нужна новая страница (это изменение сайта, в этой задаче не делалось). |
| **App domains** | 👤 | `diesel-monitor.pp.ua` |
| **Contact email** | 👤 | Email из раздела «Контакти» страницы privacy (он уже публичный). Лучше тот же, что на странице. |
| **Category** | 👤 | Рекомендация: **Business and pages**. Запасной вариант: *Utility & productivity*. Выбирать из выпадающего списка — названия могут немного отличаться. |
| **Business portfolio** (привязка к бизнесу) | 👤 | Нужна для Business Verification (см. 4.4). |
| **Website / Platform** | 👤 | Add platform → Website → `https://diesel-monitor.pp.ua/` |

## 4.2. Instagram → API setup with Instagram login

| Поле | Статус | Что сделать |
|---|---|---|
| Instagram-аккаунт подключён (роль Instagram Tester / владелец) | ✅ | Раз публикация работает — подключён. |
| OAuth redirect URI | 👤 | `https://diesel-monitor.pp.ua/` (так записано в `docs/APP_REVIEW.md` §1 — сверить в кабинете). |
| Deauthorize callback URL, Data deletion request URL | 👤 | Поля в Business login settings. Можно указать `https://diesel-monitor.pp.ua/privacy/#delete`. Если кабинет требует именно callback (адрес, принимающий POST), — см. вопрос 3 в `05-sources-and-open-questions.md`. |

## 4.3. Страница политики конфиденциальности — чего не хватает

Сейчас на https://diesel-monitor.pp.ua/privacy/ (обновлено 24.07.2026) **есть**:
- ✅ страница публичная, без входа;
- ✅ что сайт собирает (анонимная статистика GoatCounter, без cookie);
- ✅ раздел «Видалення даних» с якорем `#delete`, срок 30 дней, контакты (Telegram и email);
- ✅ упоминание приложения «Diesel Monitor UA» и аккаунта @diesel.monitor.ua.

**Не хватает** (правки сайта — в этой задаче не делались, нужен отдельный заказ):
- ❌ **английской версии** — проверяющие Meta читают по-английски;
- ❌ перечня, какие именно данные Instagram приложение получает (для публикации: только ID и имя своего аккаунта, статусы своих публикаций);
- ❌ где работает автоматизация (GitHub Actions) и что уходит в Telegram владельцу;
- ⚠️ фраза «Жодні дані третіх осіб не зберігаються поза платформою Instagram»: если когда-нибудь включат мост —
  тексты комментариев и директа пересылаются в Telegram владельцу. Сейчас мост выключен, а в его
  состоянии хранятся только ID (ники убраны 26.09, `scripts/lib/міст.mjs`), так что для подачи
  **только публикации** фраза верна.

Готовый английский текст для добавления (только публикация):

> ### Instagram data (English)
> The "Diesel Monitor UA" app is used only by the owner of the Instagram professional account
> @diesel.monitor.ua to publish our own fuel-price content (posts, carousels, stories, Reels) to that account.
> **What we access:** the ID and username of our own account and the processing status of our own posts.
> We do not access data of other Instagram users.
> **Where it runs:** the automation runs on GitHub Actions; images are hosted in our public GitHub repository.
> We do not sell, rent or share any data with advertisers or other third parties.
> **Deletion:** if you want any data related to you deleted, contact us via Telegram or email below;
> we will delete it within 30 days and confirm by reply.

Если подаётся ещё и мост — брать расширенный текст из `docs/APP_REVIEW.md` §6.

## 4.4. Проверка бизнеса и доступ

| Пункт | Статус | Комментарий |
|---|---|---|
| **Business Verification** | 👤 ❓ | Обязательна для любого Advanced Access. Нужны документы (выписка ФОП / ЄДР, адрес, телефон, сайт). Без ФОП — вероятный блокер. |
| **Data Handling Questions** | 👤 | Отвечают при подаче и затем ежегодно (Data Use Checkup). Черновик ответов — `docs/APP_REVIEW.md` §6. Для «только публикации»: обработчики данных — GitHub; передача третьим лицам — нет. |
| **App mode: Live** | 👤 | Переключать после одобрения. Для Live Meta требует privacy URL, инструкцию удаления данных и иконку — они есть/готовы. |
| **Data Use Checkup** раз в год | 👤 | Если пропустить — доступ отключают без продления. Поставить напоминание в календарь. |

## 4.5. Итог «есть / нет»

| Есть | Нет / сделать |
|---|---|
| Иконка 1024×1024 (`assets/app-icon-1024.png`) | Английский раздел на /privacy/ |
| Страница политики https://diesel-monitor.pp.ua/privacy/ | Business Verification (документы) |
| Инструкция удаления данных https://diesel-monitor.pp.ua/privacy/#delete | Видео 1 и 2 (сценарий в `03-screencasts.md`) |
| Сайт https://diesel-monitor.pp.ua/ и профиль instagram.com/diesel.monitor.ua | Решение: что именно подавать (варианты в `05-…md`) |
| Тексты для формы (`02-usage-texts.md`) | Terms of Service (необязательно) |
