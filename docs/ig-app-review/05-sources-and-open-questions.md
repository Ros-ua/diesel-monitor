# 5. Источники и спорные вопросы

## 5.1. Что выяснено поиском (сентябрь 2026)

Сайты Meta из песочницы не открывались, поэтому выводы — по результатам WebSearch.
Перед подачей стоит сверить с официальной страницей *App Review for Instagram API*.

1. **Два уровня доступа.** Standard Access — по умолчанию, работает для аккаунтов, у которых
   есть роль в приложении (свой аккаунт). Advanced Access — для чужих аккаунтов, выдаётся только
   через App Review. Meta прямо пишет: если приложение обслуживает только ваш аккаунт или аккаунт,
   которым вы управляете, Standard Access достаточно.
2. **Для Advanced Access нужны:** Business Verification, режим Live, политика конфиденциальности,
   способ удаления данных, описание использования каждого права и видео.
3. **Видео:** одно на каждое разрешение; показать вход, экран согласия и результат в приложении;
   скриншоты не принимают; входить настоящим профессиональным аккаунтом.
4. **Публикация:** частая причина отказа — видео, где «бот постит сам» без видимого действия человека.
   Отсюда в нашем сценарии — ручной запуск *Run workflow*.
5. **Лимит публикаций:** 100 постов через API за скользящие 24 часа (карусель = 1 пост).
   В одном месте документации для каруселей указано 50 — у нас всё равно ~4 в день.
   Проверка: `GET /{ig-id}/content_publishing_limit`.
6. **Сроки:** обычно 2–4 недели на одну подачу, в 2026 бывают задержки; часто нужно несколько кругов.
7. **Data Use Checkup** — ежегодная переаттестация после одобрения; пропуск отключает доступ.
8. **Для режима Live:** privacy URL, инструкция удаления данных, иконка 1024 px.

Источники:
- [App Review for Instagram API — Meta for Developers](https://developers.facebook.com/documentation/instagram-platform/app-review)
- [Overview of the Instagram API — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/overview/)
- [Business Login for Instagram — Meta for Developers](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Content Publishing — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Data Deletion Request Callback — Meta for Developers](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback)
- [Data Use Checkup FAQ — Meta for Developers](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-use-checkup/faq/)
- [Meta App Review Screencast Guide (2026)](https://singhamandeep.com/meta-app-review-screencast-why-your-demo-video-gets-rejected-2026/)
- [Instagram API Advanced Access Approval Guide (2026)](https://singhamandeep.com/instagram-api-advanced-access-approval/)
- [Meta App Review Rejected? 2026 Fix-It Guide — WoopSocial](https://woopsocial.com/blog/meta-app-review-rejected-2026-fix-guide)
- [Instagram Posting API: 2026 Integration Guide — Blotato](https://www.blotato.com/blog/instagram-posting-api)
- [Instagram API Rate Limits — bundle.social](https://bundle.social/blog/instagram-api-rate-limits)
- [Meta App Review Now Takes 20 Days — bundle.social](https://bundle.social/blog/meta-app-review-20-days)

## 5.2. Спорные вопросы (решение за владельцем)

### Вопрос 1. Подавать ли публикацию на ревью вообще?

Факт: автопубликация **уже работает** на Standard Access (последние посты 25–27.09.2026).
Старый черновик `docs/APP_REVIEW.md` советует публикацию **не** подавать.

| Вариант | Плюсы | Минусы |
|---|---|---|
| **А. Не подавать публикацию** (подавать только мост, если он нужен) | Меньше видео, меньше риск отказа; публикация продолжает работать | Если Meta когда-то ужесточит Standard — придётся подавать позже |
| **Б. Подать публикацию вместе с мостом** | Всё одобрено одним пакетом | +2 видео; отказ по одному праву может задержать весь пакет |
| **В. Подать только публикацию** | Документы в этой папке готовы полностью | Business Verification ради того, что и так работает |

**Рекомендация:** А. Использовать эту папку, только если в кабинете Meta появится явное требование
(предупреждение про Development mode, ошибка публикации с текстом про доступ/ревью).

### Вопрос 2. Если публикация «перестала работать» — точно ли дело в ревью?

Прошлый сбой 22.08.2026 был из-за **лимита запросов** («Application request limit reached»):
мост опрашивал Instagram ~1700 раз в сутки (комментарий в `.github/workflows/ig-bridge.yml`).
Ревью такое не лечит. Сначала смотреть текст ошибки в журнале GitHub Actions:
- `Application request limit reached` → лимит запросов, ждать/уменьшить опрос;
- `Invalid OAuth access token` / `Session has expired` → токен (workflow `ig-refresh.yml`, секрет `INSTAGRAM_TOKEN`);
- ошибка про permission / access level → вот тогда App Review.

### Вопрос 3. Инструкция удаления или callback?

Сейчас есть только страница-инструкция (`/privacy/#delete`). Сайт статический, сервера нет,
поэтому callback (адрес, куда Meta шлёт POST-запрос) сделать без нового сервиса нельзя.
- Вариант А: указать URL инструкции (обычно принимается).
- Вариант Б: если кабинет потребует именно callback — нужен маленький внешний обработчик
  (например, бесплатная serverless-функция). Это разработка, отдельная задача.

### Вопрос 4. Business Verification без ФОП

Без юрлица/ФОП подтвердить бизнес, скорее всего, не получится. Варианты: оформить ФОП;
не подавать на Advanced Access (вариант А из вопроса 1).

### Вопрос 5. Правки сайта для /privacy/

Английский раздел — это изменение `public/privacy/index.html`. В этой задаче код сайта
менять было нельзя, поэтому текст только подготовлен (`04-form-checklist.md` §4.3).
