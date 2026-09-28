# 3. Сценарий записи экранного видео (screencast)

## Общие правила Meta (по состоянию на 2026)

- **Одно видео на одно разрешение.** Общий ролик «про всё» — частая причина отказа.
- Показать **весь путь**: вход → экран согласия с нужными правами → действие → результат в Instagram.
- Скриншоты больше не принимают — только видео.
- Для публикации проверяющий хочет видеть, что **человек сам** запускает публикацию
  (или явно включил автоматизацию), а не «бот постит сам по себе».
- То, что видно на видео, должно совпадать с текстом из `02-usage-texts.md`. Ничего непонятного на экране.
- Входить **настоящим** аккаунтом @diesel.monitor.ua (не тестовым).

## Технические требования к записи

- 1080p, длительность 1–3 минуты, формат MP4. Курсор виден.
- Интерфейс у нас украинский → **на каждом шаге английская подпись** (текст подписей ниже).
- **Никогда не показывать:** значение `INSTAGRAM_TOKEN`, App Secret, код `code=...` из адреса после входа,
  страницу Settings → Secrets в GitHub, телефон, почту. Если секрет мелькнул — перезаписать ролик.
- Запись экрана: OBS Studio (бесплатно) или встроенная запись Windows (Win+Alt+R) / macOS (Cmd+Shift+5).
  Подписи удобно наложить в бесплатном редакторе (например, Clipchamp, DaVinci Resolve).
- Instagram-профиль показывать можно с телефона (зеркало экрана) или в браузере instagram.com.

## Подготовка (до записи, один раз)

1. **Выбрать, что публикуем на видео.** Скрипты защищены от повторов: карусель и сторис не выйдут
   второй раз за ту же дату цен, новость — если она уже была. Поэтому:
   - проще всего — **новость** (`ig-news.yml`): запускать вручную **до 16:00 UTC (19:00 Киев)**, пока
     автоматический запуск ещё не опубликовал свежую новость;
   - или **Reels** (`reels.yml`) с галочкой `force` — ролик соберётся и выйдет всегда;
   - для **карусели** в день записи временно выключить авто-запуск: GitHub → Actions →
     «Пост в Instagram (будні)» → «…» → *Disable workflow*. После сбора цен (~14:00 UTC)
     включить обратно и запустить вручную уже на камеру. Это кнопка в GitHub, код не меняется.
2. В App Dashboard найти ссылку входа (Instagram → API setup with Instagram login →
   *Set up Instagram business login* → *Embed URL*). Она выглядит так (ID приложения — ваш):
   ```
   https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=<APP_ID>
     &redirect_uri=https://diesel-monitor.pp.ua/&response_type=code
     &scope=instagram_business_basic,instagram_business_content_publish
   ```
   В `scope` оставить **только** права, которые подаём.
3. Выйти из Instagram в браузере, где будет запись, чтобы на видео был виден вход.
4. Заранее открыть вкладки: App Dashboard, ссылку входа, GitHub Actions, профиль instagram.com/diesel.monitor.ua.

---

## Видео 1 — `instagram_business_basic`

| # | Действие на экране | Английская подпись |
|---|---|---|
| 1 | App Dashboard: видно название приложения «Diesel Monitor UA» | *Diesel Monitor UA — internal publishing tool for our own account @diesel.monitor.ua* |
| 2 | Открыть ссылку входа (подготовка п.2) | *The account owner starts Instagram Business Login* |
| 3 | Ввести логин @diesel.monitor.ua (пароль не показывать крупно) | *Signing in as @diesel.monitor.ua* |
| 4 | **Остановиться на экране согласия на 3–5 секунд**, навести курсор на список прав | *Consent screen: instagram_business_basic and instagram_business_content_publish* |
| 5 | Нажать *Allow*. Произойдёт переход на diesel-monitor.pp.ua — **адресную строку с `code=` не показывать** (обрезать кадр или сразу переключиться) | *Permissions granted by the account owner* |
| 6 | GitHub → Actions → «Новина в Instagram (щодня)» → *Run workflow* | *Owner starts a publishing job manually* |
| 7 | Открыть запуск → шаг «Публікація» → строка `ig-news: опубліковано … (media …)` | *The tool reads our account ID (GET /me) and uses it to publish* |
| 8 | Открыть профиль @diesel.monitor.ua: вверху видно имя аккаунта и новый пост | *Only our own account is accessed. No data about other users is read.* |

## Видео 2 — `instagram_business_content_publish`

Можно записать сразу после видео 1 (шаги 1–5 те же), но сохранить **отдельным файлом**.

| # | Действие на экране | Английская подпись |
|---|---|---|
| 1–5 | Как в видео 1: вход и экран согласия с `instagram_business_content_publish` | *Owner grants instagram_business_content_publish* |
| 6 | Показать сайт https://diesel-monitor.pp.ua/ — цены дня | *Source: our public fuel price dashboard built from open data* |
| 7 | GitHub → Actions → выбрать публикацию (см. подготовку п.1) → *Run workflow*. Для Reels включить `force` | *The owner starts publishing manually (it also runs daily after data collection)* |
| 8 | В запуске показать шаг с картинкой/видео (например, «Картка новини») | *Step 1: the tool renders an image from today's prices* |
| 9 | Шаг «Публікація»: строка `опубліковано … (media …)` | *Step 2: POST /media creates a container, POST /media_publish publishes it* |
| 10 | Обновить профиль @diesel.monitor.ua в Instagram — новый пост первый; открыть его | *The new post is live on our own Instagram account* |
| 11 | (желательно) Показать у `instagram.yml` вход `dry` = «Репетиція» и кнопку *Disable workflow* | *The owner can do a dry run and can turn automation off at any time* |

## Если подаём ещё и мост / сводку

Сценарии видео для `instagram_business_manage_comments`, `instagram_business_manage_messages`,
`instagram_business_manage_insights` — в `docs/APP_REVIEW.md` §5 (ролики B и C).
Важно: при подаче нескольких прав на экране согласия будут видны **все** запрошенные права —
в `scope` ссылки входа должно быть ровно то, что подаётся.

## Проверка ролика перед отправкой

- [ ] Видно название приложения и вход настоящим аккаунтом.
- [ ] Экран согласия виден несколько секунд, права читаются.
- [ ] Видно ручной запуск и результат в Instagram.
- [ ] Подписи на английском на каждом шаге.
- [ ] Ни одного секрета, токена, `code=`, телефона.
- [ ] Один файл = одно разрешение.
