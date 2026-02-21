# Work Boost OS — Полный гайд пользователя (RU)

Версия документа: 1.1
Актуально для текущего кода проекта в папке `ai_studio_clone`.

---

## 0. Как пользоваться этим документом

Этот файл написан как рабочая инструкция «от запуска до диагностики».

Рекомендуемый порядок чтения:

1. Сначала прочитай `Раздел 2` (запуск).
2. Затем `Раздел 5` (Ops Hub как основной рабочий центр).
3. Потом `Раздел 7` (Cover Writer) и `Раздел 8` (логика скоринга/памяти).
4. В конце зафиксируй `Раздел 11` (практический workflow) и `Раздел 12` (диагностика).

Если нужен максимально короткий старт «сегодня начать работать»:

1. Запусти `start_app.bat`.
2. Открой вкладку `Ops Hub` и добавь первую карточку во `Воронке`.
3. В `Настройки` выставь цели Win Rate и Eff/H.
4. Для отклика открывай `Writer` и генерируй cover letter из сжатого контекста.
5. После каждой недели фиксируй `Weekly review` во вкладке `Исполнение`.
6. В конце дня делай backup через `Настройки -> Создать Бэкап`.

---

## 1. Что это за система

`Work Boost OS` — локальная операционная система для фриланс-воркфлоу, где в одном приложении объединены:

1. Стратегический чат (основная модель).
2. Ops Hub (воронка, решения, постмортемы, delivery, playbooks, настройки).
3. Mini Writer (дешёвая модель для cover letter).
4. Сжатая память контекста (memory packets), чтобы уменьшать расход токенов.

Ключевая идея:

1. Дорогая/сильная модель — для стратегии.
2. Дешёвая/быстрая модель — для рутинного письма.
3. Rule-based слой — для скоринга, фильтров, рисков и аналитики.

---

## 2. Быстрый старт

## 2.1. Требования

1. Python 3.11+.
2. Node.js + npm.
3. API ключ Gemini в `.env`.

Пример `.env`:

```env
GOOGLE_API_KEY=your_google_ai_studio_api_key_here
# альтернативно поддерживается:
# GEMINI_API_KEY=...
```

## 2.2. Запуск в режиме разработки (backend + frontend)

Команда/скрипт:

1. Запусти `start_app.bat`.

Что делает скрипт:

1. Стартует backend (`backend/main.py`) на `0.0.0.0:8000`.
2. Стартует frontend (Vite dev server) на `0.0.0.0:5173`.
3. Открывает браузер на `http://localhost:5173`.

## 2.3. Запуск desktop EXE

1. Сначала собери EXE через `build_desktop.bat`.
2. Потом запусти `Run AI Studio Desktop.bat`.

Если EXE не найден, скрипт покажет ошибку и попросит сначала выполнить сборку.

## 2.4. Сборка EXE

Скрипт `build_desktop.bat` делает:

1. Установку Python-зависимостей (`requirements.txt`).
2. Установку фронтенд-зависимостей (`npm ci` или `npm install`).
3. Сборку фронтенда (`npm run build`).
4. Сборку desktop через PyInstaller (`ai_studio.spec`).
5. Копию `.env` рядом с EXE.

Готовый EXE:

1. `backend/dist/AI Studio/AI Studio.exe`.

## 2.5. Smoke-проверка после сборки

Есть скрипт: `backend/smoke_ops_check.py`.

Он проверяет ключевой flow:

1. Загрузка ops payload.
2. Создание opportunity.
3. Proposal pack.
4. Playbook suggestions.
5. Mark used + feedback.
6. Автолинк исхода при переводе opportunity в `won`.
7. Создание backup.
8. Удаление тестовых сущностей.

---

## 3. Где что хранится

## 3.1. Важные директории и файлы

1. `backend/main.py` — весь API и бизнес-логика.
2. `frontend/src/App.tsx` — основной shell приложения.
3. `frontend/src/components/OpsHubModal.tsx` — весь Ops Hub UI.
4. `frontend/src/components/ChatInterface.tsx` — чат-интерфейс.
5. `frontend/src/components/CoverWriterMini.tsx` — mini writer.
6. `.ai/ops/phase1_store.json` — основное локальное хранилище Ops данных.
7. `.ai/backups/*.zip` — zip-бэкапы Ops данных.
8. `backend/attachments/` — локальные вложения.

## 3.2. Логи

1. Backend лог: `backend/ai_studio_backend.log`.
2. Desktop лог: `backend/ai_studio_desktop.log`.

Открытие логов из UI:

1. Через кнопку в Sidebar (`Лог backend`, `Лог desktop`).

---

## 4. Общая навигация по приложению

Главный экран (`App.tsx`) включает:

1. Welcome overlay: «Командный Центр Готов» + кнопка «Продолжить командование».
2. Верхний переключатель страниц: `Ops Hub` / `Чат`.
3. Кнопка `Writer` (открывает mini writer поверх любой страницы).
4. Глобальная плашка ошибок (если API вернул ошибку).

Состояния:

1. По умолчанию открывается `Ops Hub`.
2. `Чат` открывается отдельной страницей.

---

## 5. Ops Hub — полный разбор функций

`Ops Hub` — центральный операционный интерфейс (`OpsHubModal.tsx`).

Вкладки:

1. Воронка.
2. Решения.
3. Разбор.
4. Playbooks.
5. Исполнение.
6. Настройки.

## 5.1. Общие элементы Ops Hub

Верхний блок:

1. `Обновить` — повторный запрос `/api/ops/phase1`.
2. `Закрыть` — только в модальном режиме (не embedded).
3. KPI карточки:
   1. Открытые opportunities.
   2. Закрытые opportunities.
   3. Процент побед (win rate).
   4. Реализованный Eff/H.
   5. Eff/H воронки.
   6. Целевые пороги.
4. Быстрые кнопки перехода:
   1. `Открыть Воронку`.
   2. `Открыть Playbooks`.
   3. `Открыть Delivery`.
   4. `Настройки`.

Если данные не загрузились:

1. Показывается «Не удалось загрузить данные Ops Hub».
2. Кнопка `Повторить загрузку`.

---

## 5.2. Вкладка «Воронка»

### 5.2.1. Блок создания/редактирования opportunity

Функции:

1. Создание новой карточки opportunity.
2. Редактирование существующей карточки.
3. Автозаполнение карточки из текста/URL/вложения.
4. Управление AI-черновиком Proposal Pack.
5. Фильтр по стадии.

Поля формы opportunity:

1. `Название вакансии`.
2. `Клиент`.
3. `Стадия` (`discovery|qualified|proposal|interview|negotiation|waiting_offer|offer_received|blocked|active|won|upsell|lost`).
4. `URL вакансии`.
5. `Ожидаемая выручка (USD)`.
6. `Оценка часов`.
7. `Краткое описание`.
8. `Фактическая выручка (USD)`.
9. `Фактические часы`.
10. `Заметки`.

Кнопки:

1. `Добавить opportunity` / `Обновить opportunity`.
2. `Отмена редактирования` (если редактирование).
3. `Внести правки` (только для AI-черновиков) — отправляет текстовый запрос агенту на изменение карточки-черновика.

### 5.2.2. Автозаполнение opportunity

Входы:

1. `URL вакансии`.
2. `Вложение` (скриншот/PDF/текстовый файл).
3. `Текст вакансии / бриф`.

Кнопки:

1. `Автозаполнить карточку` — вызывает `/api/ops/opportunity/autofill`.
2. `Убрать` — очистка выбранного файла.

Что возвращается и показывается:

1. `Уверенность`.
2. `Пустые поля`.
3. `Сигналы`.
4. `Intake gate summary` (включая reject/allow, fallback, skip model).

### 5.2.3. Канбан стадий pipeline

Для каждой стадии:

1. Количество карточек.
2. Суммарная ожидаемая выручка.
3. Список карточек, отсортированных по score/обновлению.

Для каждой карточки:

1. Заголовок + клиент + платформа.
2. Score и recommendation.
3. Ожидаемые и фактические деньги/часы.
4. Краткое summary.
5. Короткий score rationale.
6. Intake gate индикаторы:
   1. Gate status.
   2. Intake score.
   3. Hard reject hits.
   4. Heavy penalty hits.
   5. Risk marker hits.
   6. Toxicity hits.
7. Селектор смены стадии (live update `/api/ops/opportunity/stage`).
8. Кнопки `Изменить`, `Удалить`.
9. Кнопка `Собрать Pack v2`.

### 5.2.4. Proposal Pack v2

Функции:

1. Показ структурированного proposal-пакета.
2. Опциональная генерация AI-черновика cover letter.
3. Копирование пакета в буфер.

Кнопки:

1. `Копировать` — копирует полный pack (opportunity, score, why/proof/risks/questions/playbooks/draft).
2. `Очистить` — очищает текущий pack.

Секции в pack:

1. Opportunity summary.
2. Почему проект стоит брать.
3. Доказательства (из decision ledger).
4. Риски и вопросы клиенту.
5. Рекомендации playbook.
6. Черновик cover letter.

Переключатель в верхней части вкладки:

1. `AI-черновик` (чекбокс) — включает/выключает генерацию cover letter внутри proposal pack.

---

## 5.3. Вкладка «Решения» (Decision Ledger)

Функции:

1. CRUD решений.
2. Фильтр по статусу решения.
3. Централизованный журнал стратегических решений.

Поля формы решения:

1. `Краткое описание решения`.
2. `Рассмотренные варианты`.
3. `Выбранный вариант`.
4. `Обоснование`.
5. `Ожидаемый эффект`.
6. `Уверенность (%)`.
7. `Статус решения` (`active|validated|superseded|discarded`).

Кнопки:

1. `Сохранить решение` / `Обновить решение`.
2. `Отмена редактирования`.
3. В журнале: `Изменить`, `Удалить`.

---

## 5.4. Вкладка «Разбор» (Postmortem)

Функции:

1. CRUD postmortem.
2. Фильтр по исходу.
3. Автотеги таксономии исходов.
4. Вывод покрытия таксономии и топ-тегов.

Поля формы postmortem:

1. `Связанная opportunity` (опционально).
2. `Исход` (`won|lost|withdrawn|no_response`).
3. `Ключевые выводы`.
4. `Корневые причины`.
5. `Теги таксономии`.
6. `Action items`.
7. `Что сработало`.

Кнопки:

1. `Сохранить postmortem` / `Обновить postmortem`.
2. `Отмена редактирования`.
3. В журнале: `Изменить`, `Удалить`.

Дополнительно:

1. Автолинк исходов в `playbook_usage_events`, если postmortem связан с opportunity.

---

## 5.5. Вкладка «Playbooks»

### 5.5.1. KPI Playbooks

Карточки:

1. Всего playbook.
2. Активные.
3. Сработали сейчас.
4. Использования.
5. События использования.
6. Позитивный фидбек.
7. Негативный фидбек.

### 5.5.2. Форма playbook

Поля:

1. `Название playbook`.
2. `Цель`.
3. `Ключевые триггеры`.
4. `Действия`.
5. `Шаблон оффера / скрипт переговоров`.
6. `Теги`.
7. `Приоритет` (0-100).
8. `Статус` (чекбокс `Активен`).

Кнопки:

1. `Сохранить playbook` / `Обновить playbook`.
2. `Отмена редактирования`.

### 5.5.3. Триггерный слой (suggestions)

Поля:

1. `Связанная opportunity` (опционально).
2. `Связанный проект` (опционально).
3. `Заметка по использованию` (опционально).
4. `Контекст для рекомендаций` (текст клиента/проблема/фрагмент вакансии).

Кнопки:

1. `Подобрать playbook` — `/api/ops/playbook/suggest`.
2. В карточке рекомендации: `Отметить использованным` — `/api/ops/playbook/mark_used`.

Что показывает рекомендация:

1. Итоговый балл.
2. Base score + adaptive delta.
3. Исторический win rate.
4. Исторический Eff/H.
5. Исторический feedback score.
6. Матч-триггеры.
7. Рекомендованные действия.
8. Offer template.

### 5.5.4. Лучшие playbook

Для каждого playbook:

1. Usage events.
2. Win rate.
3. Eff/H.
4. Revenue total.
5. Won/Lost/Pending counts.
6. Avg feedback.

### 5.5.5. События использования playbook

Поля события:

1. Playbook.
2. Outcome.
3. Feedback label.
4. Opportunity / проект.
5. Триггеры.
6. Заметка.
7. Выручка / часы / Eff/H.
8. Время обновления.

Кнопки:

1. `Полезно` — feedback +1.
2. `Не полезно` — feedback -1.
3. `Delete` — удалить usage event.

### 5.5.6. Библиотека playbook

Показывает:

1. Название.
2. Active/paused.
3. Цель.
4. Приоритет.
5. Кол-во использований.
6. Триггеры.
7. Первые действия.
8. Обновлено и последнее использование.

Кнопки:

1. `Изменить`.
2. `Удалить`.

---

## 5.6. Вкладка «Исполнение» (Delivery)

### 5.6.1. Delivery KPI

Карточки:

1. Активные проекты.
2. Блокеры.
3. Просроченные майлстоуны.
4. Выполнение майлстоунов (%).
5. Delivery Eff/H.
6. Недельная уверенность.

Строка алертов:

1. Целевой Delivery Eff/H.
2. Число проектов со scope creep.
3. Число проектов в красной зоне коммуникации.
4. Топ токсичных маркеров.

Если `effective_hourly_alert = true`, строка подсвечивается как red alert.

### 5.6.2. Мост к исполнению (Execution Bridge)

Функция:

1. Из выигранной opportunity создать delivery-project шаблон.

Поле:

1. `Выигранная opportunity`.

Кнопка:

1. `Создать bridge`.

Ограничение:

1. Bridge разрешён только для `won` opportunities.

### 5.6.3. Форма execution project

Поля:

1. `Связанная opportunity`.
2. `Статус проекта` (`planning|active|at_risk|blocked|done|archived`).
3. `Название проекта`.
4. `Клиент`.
5. `URL вакансии`.
6. `Дата старта` (`YYYY-MM-DD`).
7. `Дедлайн` (`YYYY-MM-DD`).
8. `Плановая стоимость (USD)`.
9. `Фактическая стоимость (USD)`.
10. `Плановые часы`.
11. `Фактические часы`.
12. `Краткое описание`.
13. `Риски` (список).
14. `Следующие шаги` (список).
15. `Майлстоуны` (по строкам, формат: `title | status | YYYY-MM-DD`).

Кнопки:

1. `Сохранить проект` / `Обновить проект`.
2. `Отмена редактирования`.

### 5.6.4. Список проектов исполнения

Показывает:

1. Статус проекта.
2. Прогресс.
3. Дедлайн.
4. Eff/H по проекту.
5. Summary, risks, next actions, milestones.

Кнопки:

1. `Изменить`.
2. `Удалить`.

### 5.6.5. Weekly feedback loop

Поля weekly review:

1. `Дата начала недели`.
2. `Победы`.
3. `Промахи`.
4. `Бутылочные горлышки`.
5. `Эксперименты`.
6. `Фокус следующей недели`.
7. `Уверенность (%)`.
8. `ID связанных проектов`.

Кнопки:

1. `Автогенерация` — `/api/ops/weekly_review/suggest`.
2. `Сохранить weekly review` / `Обновить weekly review`.
3. `Отмена редактирования`.
4. В журнале: `Изменить`, `Удалить`.

Журнал weekly review показывает:

1. Кол-во обзоров.
2. Среднюю уверенность.
3. Дельту импульса.
4. Топ bottlenecks.

---

## 5.7. Вкладка «Настройки»

### 5.7.1. Целевые пороги

Поля:

1. `Цель Win Rate (%)`.
2. `Цель Эффективной Ставки ($/ч)`.

Кнопка:

1. `Сохранить Цели`.

### 5.7.2. Резервные копии

Показывает:

1. Общее число backup-файлов.
2. Время последнего backup.
3. Имя и размер последнего backup.

Кнопки:

1. `Открыть Папку` — открыть каталог backup в проводнике.
2. `Создать Бэкап` — создать zip архив `.ai/ops`.

### 5.7.3. Скоринг-движок v2

Базовые поля:

1. `Мин. фиксированный бюджет ($)`.
2. `Мин. почасовая ставка ($/ч)`.
3. `Порог исключения по ставке ($/ч)`.
4. `Порог отклонения (score)`.
5. `Пропускать AI при reject` (чекбокс).
6. `Жесткий reject low-budget` (чекбокс).

Продвинутые правила (`details` блок):

1. `Предпочтительные ключевые слова`.
2. `Ключевые слова риска`.
3. `Слова сильного штрафа`.
4. `Слова риск-маркеров`.
5. `Маркеры токсичности`.
6. `Маркеры жёсткого отказа`.

Кнопка:

1. `Сохранить Скоринг v2`.

---

## 6. Страница «Чат» — полный разбор

## 6.1. Чат-вкладки

В `App.tsx` зашиты 3 истории:

1. `Главный` -> `Работа над собой 3.json`.
2. `Работа над собой 2` -> `Работа над собой 2.json`.
3. `Hong Kong` -> `Гонконг_ Советы по поступлению 2026_ 2.json`.

## 6.2. Восстановление истории

Экран до загрузки:

1. Кнопка `Восстановить чат`.
2. При отсутствии ключа — подсказка про `.env`.

Запрос:

1. `/api/load_history`.

После загрузки:

1. Подгружается первая порция сообщений (`/api/history`).
2. Токены считаются и показываются в шапке.

## 6.3. Realtime синхронизация

1. Вебсокет `/ws`.
2. Backend рассылает `chat_appended`.
3. Другие окна/клиенты получают новые сообщения live.

## 6.4. Отправка сообщений

Форма отправляет:

1. Текст запроса.
2. Файлы.
3. Параметры модели (model, temperature, media, thinking, tools, system instructions).

Кнопка:

1. `Отправить`.

Горячая клавиша:

1. `Enter` отправляет.
2. `Shift+Enter` — новая строка.

## 6.5. Вложения в чате

Поддержка ввода файлов:

1. Через кнопку `+`.
2. Drag-and-drop в зону ввода.
3. Paste из буфера (если clipboard содержит файлы).

Разрешённые типы в input accept:

1. `image/*`, `video/*`, `audio/*`.
2. `.pdf .doc .docx .txt .json .csv .xml .html .css .js .ts .py .java .c .cpp .md`.

Перед отправкой:

1. Карточки вложений (`AttachmentCard`) с миниатюрой/иконкой.
2. Кнопка удаления конкретного файла.

После отправки:

1. Вложения рендерятся как `MessageAttachment`.
2. Поддерживаются preview режимы:
   1. Image.
   2. Video.
   3. PDF превью.
   4. Text snippet.
   5. Generic file card.

## 6.6. Lightbox preview

`LightboxPreview` поддерживает:

1. Image fullscreen.
2. Video fullscreen + controls.
3. PDF viewer (`iframe`).
4. Source viewer для текстовых файлов.
5. Download fallback для остальных файлов.

Закрытие:

1. По клику на фон.
2. Кнопка `X`.
3. `Esc`.

## 6.7. Thought blocks

Если модель вернула мыслительные блоки:

1. Они оборачиваются в `[THOUGHT_BLOCK]...[/THOUGHT_BLOCK]`.
2. В UI показываются компонентом `ThoughtProcess`.
3. Можно раскрыть/свернуть.

## 6.8. Sidebar (на странице чата)

### 6.8.1. Основные переключатели

1. `Ops` — переход к Ops Hub.
2. `Writer` — открыть mini writer.

### 6.8.2. Модель

Клик по карточке модели открывает `ModelSelectorModal`.

Доступные модели:

1. `gemini-3.1-pro-preview`.
2. `gemini-3-pro-preview`.
3. `gemini-3-flash-preview`.
4. `gemini-2.5-pro`.

Есть поиск по имени/ID.

### 6.8.3. Системные инструкции

Клик по блоку открывает `SystemInstructionsModal`.

Функции:

1. Ввод/редактирование system prompt.
2. `Сохранить` — применяет к текущей сессии.
3. `Отмена`.

### 6.8.4. Параметры генерации

1. `Температура` (range 0..2, шаг 0.1).
2. `Качество медиа`: `Default|Low|Medium|High`.
3. `Глубина мышления`: `Off|Low|High`.

### 6.8.5. Инструменты

1. `Выполнение кода` (toggle).
2. `Поиск Google` (toggle).

### 6.8.6. Допкнопки

1. `Открыть Cover Writer`.
2. `Открыть Ops Hub`.
3. `Синхронизировать историю` -> `SyncDriveModal`.
4. `Лог backend`.
5. `Лог desktop`.

## 6.9. SyncDriveModal

Поле:

1. `Строка ссылок` (Google Drive links string).

Кнопка:

1. `Запустить синхронизацию`.

Логика:

1. POST `/api/sync_drive`.
2. Обновляет историю, скачивает вложения.
3. После успеха — авто reload UI.

## 6.10. Ops Mini Agent

Компонент: `OpsMiniAgent.tsx`.

Цель:
1. Выполнение операционных задач в фоне без переключения основного ИИ-Стратега на рутину (используется дешёвая и быстрая модель).
2. Анализ истории чата и автоматическое выполнение действий (изменение стадии карточки, обновление бюджета, перенос в архив и т.д.).

Логика:
1. Открывается кнопкой `Открыть Ops Agent` из Sidebar.
2. Вводится инструкция-задание (например: «Обнови бюджет в последней карточке до $500»).
3. Имеет независимый ползунок размера контекста (количества последних анализируемых сообщений).
4. Результат выполнения выводится в основной чат интерфейса как сообщение от агента.

---

## 7. Cover Writer (mini окно)

Компонент: `CoverWriterMini.tsx`.

Цель:

1. Генерация/переписывание/полировка cover letter дешёвой моделью.
2. Использование сжатого контекста (memory packet).

## 7.1. Режимы

1. `Черновик` (`draft`).
2. `Переписать` (`rewrite`).
3. `Улучшить` (`polish`).

## 7.2. Управление контекстом

Параметры:

1. `Бюджет токенов` (400..4000).
2. `Последние сообщения стратега` (2..12).

Кнопки:

1. `Обновить контекст` -> `/api/memory/context`.
2. `Пересобрать память` -> `/api/memory/rebuild`.

Отображается:

1. Роль режима.
2. Версия памяти.
3. Токены контекста / лимит.

## 7.3. Инструкция

Поле:

1. Большой textarea инструкции.

Шаблонные кнопки:

1. `Быстрый черновик`.
2. `Формальный стиль`.
3. `Полировка`.

Основная кнопка:

1. `Сгенерировать` -> `/api/cover_writer`.

Результат:

1. Markdown-рендер готового текста.

## 7.4. Автоматическое делегирование (Writer Handoff)

Если Стратег решает сгенерировать Cover Letter по просьбе пользователя прямо в главном чате:
1. Стратег вызывает tool `generate_cover_letter`.
2. Система перехватывает вызов и делегирует его Cover Writer в фоне.
3. Writer-модель генерирует письмо, и оно автоматически отображается в потоке чата.

---

## 8. Алгоритмы и правила (важно)

## 8.1. Intake Gate (до дорогого AI)

Используется в autofill/scoring:

1. Извлекает бюджет и hourly из текста (`extract_budget_signals`).
2. Извлекает effort/hours (`extract_effort_signals`).
3. Применяет guardrails:
   1. `min_budget_usd`.
   2. `min_hourly_usd`.
   3. `min_hourly_exception_usd`.
   4. `reject_score_threshold`.
4. Считает penalties:
   1. `heavy_penalty_keywords` = -50 за hit.
   2. `risk_marker_keywords` = -20 за hit.
5. Проверяет hard reject keywords.

Выход gate:

1. `status: allow|reject`.
2. `decision: REJECTED|PROCEED_TO_STRATEGIST_AI`.
3. Причины reject.
4. Детали сигналов и hit-ов.
5. Флаг `skip_model_on_reject`.

Если `rejected && skip_model_on_reject`:

1. Autofill возвращает deterministic карточку без вызова модели.

## 8.2. Scoring v2

Финальный score opportunity учитывает:

1. Hourly fit.
2. Budget.
3. Clarity.
4. Strategic fit.
5. Risk.

Плюс:

1. Stage bonus.
2. Penalty за gate reject, toxicity, urgency+low clarity.
3. Ограничение score intake_score при наличии.
4. Доп cap для hard reject и low-budget reject.

Выход score:

1. `score_v1`.
2. `score_band` (`high|medium|low`).
3. `score_recommendation` (`prioritize|consider|deprioritize`).
4. Rationale и hit-ы.

## 8.3. Delivery Intelligence

Считает:

1. Status breakdown проектов.
2. Overdue milestones.
3. Completion rate milestones.
4. Delivery effective hourly.
5. Planned effective hourly.
6. Scope creep projects.
7. Under-target hourly projects.
8. Communication red-zone projects.
9. Топ рисков и токсичных маркеров.

## 8.4. Playbook adaptive ranking

Балл playbook = base + adaptive.

Base учитывает:

1. Число matched triggers.
2. Priority.

Adaptive учитывает историю:

1. Resolved win rate.
2. Historical effective hourly.
3. Usage volume.
4. Feedback score (+/-).
5. Positive/negative feedback баланс.

## 8.5. Weekly review auto-suggest

Строит черновик по сигналам:

1. Done projects/milestones за неделю.
2. Overdue milestones.
3. Blocked/at_risk проекты.
4. Risks/next_actions.
5. Последние postmortem findings.

Генерирует:

1. Wins.
2. Misses.
3. Bottlenecks.
4. Experiments.
5. Focus next week.
6. Confidence %.
7. Linked project ids.
8. Source signals meta.

## 8.6. Memory compression для writer

Пайплайн:

1. Разбивка истории на chunks с overlap.
2. Суммаризация чанков + извлечение fact candidates.
3. Приоритизация фактов (`hard|high|normal`).
4. Canonical memory: objective/profile/style/constraints/facts/chunks.
5. Writer packet: latest_turns + relevant_chunks + must_keep_facts.
6. Compact packet до token budget (поэтапное урезание).

---

## 9. Полный API справочник

## 9.1. Системные и чат API

1. `GET /` — index frontend.
2. `GET /api/config` — статус API key + пути логов.
3. `POST /api/open_log` — открыть лог файл (`backend|desktop`).
4. `WS /ws` — realtime broadcast `chat_appended`.
5. `POST /api/load_history` — загрузить и нормализовать историю.
6. `POST /api/sync_drive` — синк drive-вложений в историю.
7. `GET /api/history` — пагинация истории.
8. `POST /api/chat` — отправка сообщения в strategist chat.

## 9.2. Ops API

1. `GET /api/ops/phase1` — полный payload Ops Hub.
2. `POST /api/ops/targets` — обновить success targets.
3. `POST /api/ops/backup/create` — создать backup zip.
4. `POST /api/ops/backup/open_dir` — открыть папку backup.
5. `POST /api/ops/scoring/profile` — обновить scoring profile.
6. `POST /api/ops/outcome_taxonomy` — обновить taxonomy labels.
7. `POST /api/ops/proposal_pack` — собрать proposal pack.
8. `POST /api/ops/opportunity/autofill` — автоизвлечение карточки.
9. `POST /api/ops/opportunity` — создать/обновить opportunity.
10. `POST /api/ops/opportunity/stage` — сменить стадию.
11. `POST /api/ops/opportunity/delete` — удалить opportunity.
12. `POST /api/ops/execution_bridge/from_opportunity` — bridge в delivery.
13. `POST /api/ops/execution_project` — создать/обновить проект.
14. `POST /api/ops/execution_project/delete` — удалить проект.
15. `POST /api/ops/weekly_review` — создать/обновить weekly review.
16. `POST /api/ops/weekly_review/suggest` — автосуггест weekly review.
17. `POST /api/ops/weekly_review/delete` — удалить weekly review.
18. `POST /api/ops/playbook` — создать/обновить playbook.
19. `POST /api/ops/playbook/delete` — удалить playbook (+usage events).
20. `POST /api/ops/playbook/mark_used` — добавить usage event.
21. `POST /api/ops/playbook/suggest` — предложить playbooks по контексту.
22. `POST /api/ops/playbook/usage/delete` — удалить usage event.
23. `POST /api/ops/playbook/usage/feedback` — оценка полезности события.
24. `POST /api/ops/decision` — создать/обновить decision.
25. `POST /api/ops/decision/delete` — удалить decision.
26. `POST /api/ops/postmortem` — создать/обновить postmortem.
27. `POST /api/ops/postmortem/delete` — удалить postmortem.

## 9.3. Memory / Writer API

1. `POST /api/memory/rebuild` — полная пересборка canonical memory.
2. `POST /api/memory/update` — пересборка с параметрами.
3. `POST /api/memory/context` — получить writer packet preview.
4. `POST /api/cover_writer` — генерация cover letter mini writer.

---

## 10. Форматы и ограничения полей

## 10.1. Списковые поля

В большинстве форм можно вводить:

1. Через запятую.
2. Через новую строку.
3. Через `;`.

Backend нормализует через split + trim + dedupe.

## 10.2. Даты

1. Формат: `YYYY-MM-DD`.
2. Неверные даты нормализуются в пустое значение.

## 10.3. Milestones

Формат строки:

1. `title | status | YYYY-MM-DD`.
2. `status` допускает: `todo|in_progress|blocked|done`.

## 10.4. Feedback score для usage event

Допустимые значения:

1. `-1`, `0`, `1`.
2. Текстовые алиасы (`helpful`, `not_helpful`, `neutral`, и т.д.) тоже парсятся.

---

## 11. Как использовать систему на практике (рекомендуемый flow)

## 11.1. Intake вакансии

1. Открой `Ops Hub -> Воронка`.
2. Вставь текст вакансии/URL/скрин.
3. Нажми `Автозаполнить карточку`.
4. Проверь intake gate и score-маркеры.
5. Сохрани opportunity.

## 11.2. Решение брать/не брать

1. Перейди в `Решения`.
2. Зафиксируй decision + rationale + expected impact.

## 11.3. Подготовка отклика

1. В карточке opportunity нажми `Собрать Pack v2`.
2. Проверь риски/вопросы/playbook recommendations.
3. При необходимости включи AI-черновик.
4. Скопируй pack и адаптируй под клиента.

## 11.4. Переговоры и playbooks

1. Открой `Playbooks`.
2. Вставь контекст диалога в `Контекст для рекомендаций`.
3. Нажми `Подобрать playbook`.
4. Отметь реально использованный playbook.
5. Дай feedback (`Полезно/Не полезно`) после результата.

## 11.5. После win

1. Переведи opportunity в `won`.
2. В `Исполнение` создай `bridge`.
3. Веди delivery-карточку (часы/стоимость/риски/шаги/майлстоуны).

## 11.6. Еженедельный цикл

1. В `Исполнение` нажми `Автогенерация` weekly review.
2. Отредактируй выводы вручную.
3. Сохрани weekly review.

## 11.7. Резервные копии

1. В `Настройки` регулярно нажимай `Создать Бэкап`.
2. При проблемах откатывай `phase1_store.json` из zip.

---

## 12. Ошибки и диагностика

## 12.1. Где видны ошибки

1. Красная плашка в верхней части UI (`appError`).
2. Детали backend ошибок включают `error_id` + путь к логу.

## 12.2. Частые проблемы

1. `API-ключ не найден`:
   1. Добавь `GOOGLE_API_KEY` или `GEMINI_API_KEY` в `.env`.
   2. Перезапусти backend.
2. `Загружаю данные Ops Hub...`/пусто:
   1. Проверь backend на `:8000`.
   2. Нажми `Повторить загрузку`.
   3. Проверь backend лог.
3. Вложения не отображаются:
   1. Проверь наличие файла в `backend/attachments`.
   2. Проверь корректность URL `/attachments/...`.
4. Writer не генерирует:
   1. Нужна загруженная история (`/api/load_history`) или валидный API key.
   2. Проверь `/api/memory/context` и `/api/cover_writer` ошибки.

## 12.3. Открытие логов

1. В Sidebar нажми `Лог backend` или `Лог desktop`.

## 12.4. Почему может «висеть» экран `Загружаю данные Ops Hub...`

Проверяй по порядку:

1. Убедись, что backend реально запущен:
   1. Открой `http://localhost:8000/api/config`.
   2. Если страница не открывается, перезапусти `start_app.bat`.
2. Проверь, что endpoint Ops Hub отвечает:
   1. Открой `http://localhost:8000/api/ops/phase1`.
   2. Если там ошибка 500, смотри `backend/ai_studio_backend.log`.
3. Проверь JSON-хранилище:
   1. Файл: `.ai/ops/phase1_store.json`.
   2. Если файл битый (невалидный JSON), восстанови из `.ai/backups/*.zip`.
4. Если UI чёрный или пустой после обновлений фронтенда:
   1. Останови frontend dev server.
   2. Перезапусти `npm run dev` из папки `frontend`.
5. Если в консоли браузера есть 404 по `/attachments/...`:
   1. Это проблема отдельных вложений, не всего Ops Hub.
   2. Проверь наличие файлов в `backend/attachments`.
6. Если ошибка содержит `error_id`:
   1. Найди этот `error_id` в `backend/ai_studio_backend.log`.
   2. Исправляй первопричину по стеку именно этой ошибки.

## 12.5. Если русский текст отображается «кракозябрами»

Симптом:

1. В UI или исходниках видны строки вида `Р...` вместо русского текста.

Что проверить:

1. Кодировка файлов фронтенда должна быть `UTF-8`.
2. В IDE включи открытие/сохранение в UTF-8 без перекодирования в ANSI.
3. При запуске из терминала PowerShell «кракозябры» в выводе могут быть только проблемой консоли, а не файла.
4. Для проверки открой тот же файл в IDE и убедись, что внутри сохранён нормальный русский текст.

---

## 13. Безопасность и приватность

1. Данные хранятся локально (local-first).
2. Нет встроенной multi-user auth модели.
3. Ключи лежат локально в `.env`.
4. Бэкапы сохраняются локально в `.ai/backups`.

Рекомендации:

1. Не публикуй `.env`.
2. Регулярно делай backup.
3. Перед отправкой данных в модель убирай лишнюю чувствительную информацию.

---

## 14. Техническая карта сущностей (для AI-агента)

Основные коллекции в `phase1_store.json`:

1. `success_targets`.
2. `scoring_profile`.
3. `outcome_taxonomy`.
4. `opportunities`.
5. `decisions`.
6. `postmortems`.
7. `execution_projects`.
8. `weekly_reviews`.
9. `playbooks`.
10. `playbook_usage_events`.

Фактически это полный источник правды для Ops Hub.

---

## 15. Краткий словарь статусов

1. Opportunity stages:
   1. `discovery`.
   2. `qualified`.
   3. `proposal`.
   4. `interview`.
   5. `negotiation`.
   6. `waiting_offer`.
   7. `offer_received`.
   8. `blocked`.
   9. `active`.
   10. `won`.
   11. `upsell`.
   12. `lost`.
2. Decision statuses:
   1. `active`.
   2. `validated`.
   3. `superseded`.
   4. `discarded`.
3. Postmortem outcomes:
   1. `won`.
   2. `lost`.
   3. `withdrawn`.
   4. `no_response`.
4. Execution statuses:
   1. `planning`.
   2. `active`.
   3. `at_risk`.
   4. `blocked`.
   5. `done`.
   6. `archived`.

---

## 16. Что ещё можно автоматизировать в следующей итерации

1. Авто-создание opportunity из clipboard watcher.
2. Полная русификация остаточных UI-строк (`Delete`, `No usage событий yet`, и т.д.).
3. Автонапоминания по weekly review и backup.
4. Экспорт итогового proposal pack в шаблоны Upwork.

---

## 17. Примечание по полноте

Этот документ покрывает:

1. Все пользовательские разделы UI.
2. Все кнопки/поля основных рабочих модулей.
3. Все backend endpoints, доступные приложению.
4. Основные алгоритмы скоринга, intake, playbooks, delivery intelligence и memory compression.

Если ты меняешь код, обновляй этот файл синхронно с изменениями в:

1. `frontend/src/components/OpsHubModal.tsx`.
2. `frontend/src/App.tsx`.
3. `frontend/src/components/ChatInterface.tsx`.
4. `frontend/src/components/Sidebar.tsx`.
5. `frontend/src/components/CoverWriterMini.tsx`.
6. `backend/main.py`.

---

## 18. Мобильный режим (телефон)

В приложении добавлен отдельный мобильный сценарий:

1. `Commander (моб.)` — компактный режим Ops Hub для телефона.
2. `Полный режим` — исходный детальный Ops Hub.
3. Переключатель `Моб. режим / Полный` есть в шапке приложения на узком экране.

### 18.1. Что включает Commander (моб.)

1. Оперативная сводка KPI (open, win rate, Eff/H).
2. Быстрый intake (создание новой opportunity по короткой форме).
3. Сжатый список активных лидов.
4. Быстрый weekly check-in.
5. Кнопки перехода в Writer, Chat, Полный Ops Hub.

### 18.2. Компромисс мобильного UX

Чтобы уместить много логики на маленьком экране, используется правило:

1. На телефоне — только «оперативные решения» (что взять, что отправить, где риск).
2. На десктопе/полном режиме — глубокая детализация и тонкая настройка.

Иначе говоря:

1. `Телефон = командный пульт`.
2. `Десктоп = инженерный штаб`.

### 18.3. Установка как приложение (PWA)

Добавлены:

1. `frontend/public/manifest.webmanifest`.
2. `frontend/public/sw.js`.
3. Иконки `frontend/public/icons/*`.

Как поставить на телефон:

1. Запусти приложение (`start_app.bat`).
2. Открой на телефоне URL вида `http://<LAN_IP>:5173`.
3. В браузере выбери `Добавить на главный экран` / `Install app`.

Ограничение:

1. Для полноценного PWA-install в ряде браузеров нужен HTTPS.
2. На `localhost` работает проще, на LAN может потребоваться туннель с HTTPS.

### 18.4. Работа без ПК (облачный backend)

Если хочешь пользоваться приложением без запуска сервера на домашнем ПК:

1. Разверни backend+frontend в облаке (Docker).
2. Добавь переменные:
   1. `GOOGLE_API_KEY`
   2. `WORKBOOST_DATA_DIR=/data`
3. Подключи persistent volume на `/data`.
4. На телефоне открой URL облачного приложения и добавь на главный экран.

Дополнительно:

1. В Sidebar есть поле `Backend URL (облако/удалённый)`.
2. Если фронт и backend на разных доменах, укажи там адрес backend и нажми `Применить`.

Подробный чек-лист:

1. `docs/PHONE_NO_PC_SETUP_RU.md`.
2. `docs/RAILWAY_DEPLOY_RU.md`.
