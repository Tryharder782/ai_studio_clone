# AI Studio Clone - Roadmap (Lean v2)

## 1) Главная Цель

Собрать не "вторую работу по обслуживанию тулзы", а легкий операционный слой для фриланса, который:

1. Отсекает плохие лиды максимально рано.
2. Подсказывает лучшие переговорные/апселл паттерны.
3. Держит под контролем effective hourly и win rate.

Целевые метрики:

1. Effective hourly: минимум `85 USD/h`.
2. Win rate: минимум `25%`.

---

## 2) Что Уже Сделано

## Phase 1 - Done

1. Decision Ledger.
2. Opportunity Pipeline.
3. Postmortem.
4. Базовый Ops Hub UI и локальное хранение.

## Phase 2 - Done

1. Scoring Engine v1.
2. Proposal Pack v1.
3. Outcome taxonomy.

## Phase 3 - Done

1. Execution Bridge.
2. Delivery Intelligence.
3. Weekly feedback loop.
4. Weekly auto-suggest draft.

## Phase 4 - In Progress (Closed in Current Iteration)

1. Playbook Engine v1 baseline (CRUD, приоритеты, usage счетчик).
2. Trigger layer baseline (context-aware suggestions по pipeline/delivery сигналам).
3. Автотрекинг outcome по playbook usage events через updates opportunity/postmortem.
4. Adaptive recommendation layer: playbook score учитывает historical win rate и effective hourly.
5. Backup-first: one-click создание zip backup + открытие backup директории из Ops Hub.
6. Playbook quality feedback: helpful/not-helpful feedback loop на usage events.
7. Proposal Pack v2: playbook recommendations встроены в proposal/negotiation план.
8. Autofill hardening: deterministic fallback для budget/hourly/hours + финальный intake gate.
9. Smoke-check script: `backend/smoke_ops_check.py` покрывает ключевой ops flow.

---

## 3) Принятые Изменения После Пересмотра

1. `Scoring Engine v2` становится приоритетом номер один.
2. Вводится жесткий Intake Gate для low-budget/low-hourly лидов.
3. Delivery слой упрощается: это "пульс бизнеса", а не mini-Jira.
4. Phase 4 сдвигается в сторону Playbook Engine; сложная аналитика — в низкий приоритет.
5. Надежность: легкий backup-first подход вместо тяжелой тестовой инфраструктуры на старте.

---

## 3.5) Phase 5 - Расширения Интеллектуального Ассистента (Разработка ИИ-напарником)
*Этот этап был полностью спроектирован и реализован ИИ-ассистентом совместно с пользователем после передачи проекта.*

1. **Ops Mini Agent**: Невидимый операционный помощник для обновления данных Ops Hub в фоне (без отвлечения основного стратегического ИИ).
2. **Cover Writer Delegation**: Автоматическое делегирование сложной задачи написания Cover Letter от Strategist к быстрой Writer модели.
3. **Interactive Drafts (Внести правки)**: Возможность запрашивать правки для черновиков карточек Opportunity через UI перед сохранением.
4. **Expanded Pipeline**: Внедрены более гранулярные стадии воронки (`waiting_offer`, `offer_received`, `blocked`, `active`, `upsell`).
5. **UI & DB Hardening**: Исправление багов кодировки (mojibake) и ужесточение API-схем (opportunity_id) для точной работы агентов.

---

## 4) Актуальный To-Do (Приоритетный)

## P0 - Прямо сейчас

1. Improve toxicity parser precision:
Тонкая настройка словаря и false-positive контроля для red-zone сигналов.

2. Scope creep guardrails:
Усилить ранние предупреждения по падению project effective hourly и перерасходу часов.

3. Packaging + release hardening:
Собрать свежий desktop exe и прогнать smoke-проверку на собранном билде.

## P1 - Следом

1. Fine-tune playbook adaptive weights:
Откалибровать влияние feedback/win-rate/effective-hourly на финальный recommendation score.

2. Improve proposal quality:
Добавить A/B шаблоны cover-letter generation под разные типы лидов.

3. Better extraction from attachments:
Повысить качество budget/hourly/hours extraction из PDF/скриншотов.

## P2 - Потом

1. Advanced analytics (только если появится реальная потребность).
2. Расширенная визуализация трендов.

---

## 5) Что Сознательно Ограничиваем

1. Не делаем полнофункциональный task manager.
2. Не строим корпоративный BI-слой.
3. Не усложняем поддержку системы ради "красивой архитектуры".

---

## 6) Минимальная Операционная Надежность

1. One-click backup `.ai/ops/` в zip + доступ к папке бэкапов из UI.
2. Простая проверка восстановляемости backup.
3. Логирование ошибок с `error_id` и быстрый доступ к логам из UI.

---

## 7) Definition of Success

1. Удержание effective hourly `>= 85 USD/h` 4 недели подряд.
2. Удержание win rate `>= 25%` 4 недели подряд.
3. Снижение времени ручного weekly review минимум на 30%.
4. Раннее обнаружение проблемных клиентов до финансового ущерба.
