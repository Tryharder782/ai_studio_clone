# Деплой в Railway (без ПК)

Этот гайд разворачивает `Work Boost OS` в облаке, чтобы приложение работало 24/7 и с телефона без запуска локального сервера.

## 1. Что нужно заранее

1. Аккаунт в Railway.
2. GitHub-репозиторий с проектом.
3. Ключ Gemini (`GOOGLE_API_KEY`).

## 2. Подготовь репозиторий

1. Убедись, что в репозитории есть:
   1. `Dockerfile`
   2. `backend/requirements-server.txt`
2. Если у тебя в репо есть верхняя папка `ai_studio_clone`, запомни это (понадобится `Root Directory`).

## 3. Создай проект в Railway

1. Открой Railway -> `New Project`.
2. Выбери `Deploy from GitHub repo`.
3. Подключи репозиторий.
4. Если код лежит не в корне репо, зайди в сервис -> `Settings` -> `Root Directory` и укажи:
   1. `ai_studio_clone`

## 4. Настрой переменные окружения

В `Variables` добавь:

1. `GOOGLE_API_KEY=...`
2. `WORKBOOST_DATA_DIR=/data`

Опционально:

1. `PORT=8000` (обычно Railway ставит автоматически).

## 5. Подключи постоянный диск (важно)

Чтобы данные не терялись после перезапуска:

1. Открой сервис -> `Volumes`.
2. Создай volume.
3. Mount path: `/data`.

Там будут храниться:

1. `.ai/ops/phase1_store.json`
2. `.ai/backups/*`
3. history файлы
4. `attachments/*`

## 6. Запусти деплой

1. Нажми `Deploy`.
2. Дождись статуса `Healthy`.
3. Открой `Generated Domain` (например `https://work-boost-os.up.railway.app`).

## 7. Проверка после деплоя

Проверь в браузере:

1. `https://<твой-домен>/api/config`
2. `https://<твой-домен>/api/ops/phase1`

Ожидается:

1. JSON-ответ без 500 ошибок.

## 8. Подключение телефона

1. Открой домен Railway на телефоне.
2. Добавь приложение на главный экран (`Install app` / `Добавить на главный экран`).
3. Работай как с обычным мобильным приложением.

Если фронт и backend на одном домене:

1. Ничего в `Backend URL` менять не нужно.

Если backend на другом домене:

1. В Sidebar укажи `Backend URL` вручную.

## 9. Что будет храниться в облаке

Да, все рабочие данные будут в облаке (в volume `/data`):

1. Opportunities, decisions, postmortem, playbooks, delivery, weekly reviews.
2. История чатов.
3. Вложения.
4. Бэкапы.

## 10. Частые проблемы

1. `Build failed`:
   1. Проверь `Root Directory` (частая ошибка).
2. `500 API Key is required`:
   1. Проверь переменную `GOOGLE_API_KEY`.
3. Данные пропадают после перезапуска:
   1. Не подключен volume `/data`.
   2. Нет `WORKBOOST_DATA_DIR=/data`.
4. Не работает PWA-install:
   1. Убедись, что открыт именно `https://` домен Railway.

## 11. Рекомендации по безопасности

1. Никогда не храни ключи в репозитории.
2. Используй только Variables в Railway.
3. Регулярно проверяй бэкапы в `.ai/backups`.
