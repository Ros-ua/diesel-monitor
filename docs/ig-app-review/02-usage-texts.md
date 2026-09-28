# 2. Тексты «Как приложение использует разрешение»

> Блоки **EN** вставлять в форму Meta как есть. **RU** — перевод, чтобы понимать, что отправляем.
> Правило Meta: текст должен совпадать с тем, что видно на видео. Ничего лишнего не обещать.
> Если подаётся и мост (комментарии/директ) — его тексты в `docs/APP_REVIEW.md` §3.

## 2.1. Описание приложения (App description)

**EN**
> Diesel Monitor UA (https://diesel-monitor.pp.ua/) is a free public dashboard of retail fuel prices
> in Ukraine (diesel, gasoline, LPG), built from open data: the Ministry of Finance fuel price index,
> National Bank of Ukraine exchange rates and public news RSS feeds.
> This app is an internal, server-side publishing tool for one Instagram professional account that we
> own: @diesel.monitor.ua. It has no other users and no public login. After our daily data collection
> job finishes, the tool generates images and short videos with the day's average fuel prices and
> publishes them to our own account as a carousel, a story, a news card and, when prices move
> noticeably, a Reel. The owner can also start any publication manually and can switch automation off
> at any time.

**RU**
> Diesel Monitor UA — бесплатная публичная панель розничных цен на топливо в Украине (дизель, бензин,
> газ), собранная из открытых данных: индекс цен Минфина, курсы НБУ, открытые RSS-ленты новостей.
> Приложение — внутренний серверный инструмент публикации для одного профессионального аккаунта
> Instagram, который принадлежит нам: @diesel.monitor.ua. Других пользователей и публичного входа нет.
> После ежедневного сбора данных инструмент делает картинки и короткие видео со средними ценами дня
> и публикует их в наш аккаунт: карусель, сторис, карточку новости и, при заметном движении цены, Reels.
> Владелец может запустить любую публикацию вручную и в любой момент выключить автоматизацию.

## 2.2. `instagram_business_basic`

**EN**
> We use instagram_business_basic only for our own Instagram professional account (@diesel.monitor.ua).
> Before every publication the tool calls GET /me to get our account ID and username, which is required
> to create media containers and publish them. It also reads the status of a media container
> (status_code) to wait until Instagram has processed our image or video, and reads the three most
> recent media of our own account (id, timestamp, media_type) to confirm that a post was really
> published and to avoid publishing the same post twice. We do not access any other account, and no
> profile data is stored or shared.

**RU**
> Мы используем instagram_business_basic только для своего профессионального аккаунта
> (@diesel.monitor.ua). Перед каждой публикацией инструмент вызывает GET /me, чтобы получить ID и имя
> нашего аккаунта — без этого нельзя создать и опубликовать медиа-контейнер. Ещё он читает статус
> контейнера (status_code), чтобы дождаться, пока Instagram обработает картинку или видео, и читает три
> последних медиа своего аккаунта (id, время, тип), чтобы убедиться, что пост действительно вышел,
> и не опубликовать его дважды. Другие аккаунты не затрагиваются, данные профиля не хранятся и никому
> не передаются.

## 2.3. `instagram_business_content_publish`

**EN**
> We use instagram_business_content_publish to publish original content that we create ourselves
> to our own Instagram professional account (@diesel.monitor.ua). Every day, after our job collects
> open fuel price data, the tool renders images (1080x1080 cards and a 1080x1920 story) and, when the
> price has moved by at least 1% in a week, a short vertical video with a price chart. It then creates
> media containers with POST /{ig-user-id}/media (carousel of 5 images, single image with caption,
> STORIES, or REELS) and publishes them with POST /{ig-user-id}/media_publish. At most about four
> publications per day are made, far below the 100-per-24-hours limit. Content is published only to
> our own account; the app never publishes on behalf of other people. The account owner can run any
> publication manually from the tool's control panel (GitHub Actions "Run workflow"), use a dry-run
> mode that prepares the content without publishing, and disable the schedule at any time.

**RU**
> Мы используем instagram_business_content_publish, чтобы публиковать собственный оригинальный контент
> в свой профессиональный аккаунт Instagram (@diesel.monitor.ua). Каждый день после сбора открытых
> данных о ценах инструмент рисует картинки (карточки 1080×1080 и сторис 1080×1920), а если цена
> сдвинулась хотя бы на 1% за неделю — короткое вертикальное видео с графиком. Затем создаёт
> медиа-контейнеры через POST /{ig-user-id}/media (карусель из 5 картинок, одна картинка с подписью,
> STORIES или REELS) и публикует их через POST /{ig-user-id}/media_publish. Максимум около четырёх
> публикаций в день — гораздо меньше лимита 100 за 24 часа. Публикуем только в свой аккаунт, от имени
> других людей приложение ничего не публикует. Владелец может запустить любую публикацию вручную из
> панели управления (GitHub Actions, кнопка «Run workflow»), включить режим репетиции (контент готовится,
> но не публикуется) и в любой момент выключить расписание.

> ⚠️ Про «режим репетиции»: вход `dry` есть только у `instagram.yml` (карусель) и `reels.yml`.
> У `ig-news.yml` и `ig-story.yml` его нет. Если это смущает — фразу «dry-run mode» можно убрать,
> текст останется верным.

## 2.4. Инструкция для проверяющего (Reviewer instructions)

**EN**
> This app is a private, server-side publishing tool for a single Instagram professional account that
> we own (@diesel.monitor.ua). It runs on a schedule in GitHub Actions and has no public web interface
> and no login except the one-time Instagram Business Login done by the account owner. Because of this,
> reviewers cannot sign in to the tool itself; the attached screencasts show the full flow:
> 1. The account owner signs in with Instagram Business Login and grants instagram_business_basic and
>    instagram_business_content_publish (the consent screen is shown).
> 2. The owner starts the publishing job manually in the control panel (GitHub Actions → Run workflow).
> 3. The job log shows that the post was published and prints its Instagram media ID.
> 4. The new post (carousel / story / Reel) is shown on https://www.instagram.com/diesel.monitor.ua/
>    in the Instagram app.
> The interface of the tool is in Ukrainian; English captions in the video explain every step.
> Website: https://diesel-monitor.pp.ua/ · Privacy policy: https://diesel-monitor.pp.ua/privacy/

**RU**
> Приложение — закрытый серверный инструмент публикации для одного нашего профессионального аккаунта
> Instagram (@diesel.monitor.ua). Работает по расписанию в GitHub Actions, публичного веб-интерфейса
> и входа нет, кроме разового входа владельца через Instagram Business Login. Поэтому проверяющий
> не может сам войти в инструмент; приложенные видео показывают весь путь:
> 1. Владелец входит через Instagram Business Login и выдаёт права basic и content_publish (виден экран согласия).
> 2. Владелец вручную запускает задачу публикации (GitHub Actions → Run workflow).
> 3. В журнале задачи видно, что пост опубликован, и напечатан его media ID.
> 4. Новый пост (карусель / сторис / Reels) виден в профиле в приложении Instagram.
> Интерфейс на украинском, английские подписи в видео объясняют каждый шаг.
