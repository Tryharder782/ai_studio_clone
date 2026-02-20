# AI Studio Clone - Дизайн-Документ (Lean v2)

## 1) Зачем Нужен Продукт

Продукт нужен как "операционный слой" для фрилансера, чтобы не терять контекст между:

1. Выбором вакансий.
2. Переговорами и cover letter.
3. Исполнением проектов.
4. Рефлексией по результатам.

Ключевой принцип: система должна усиливать решения, а не создавать новую нагрузку.

---

## 2) Продуктовая Стратегия

Система делится на 3 роли:

1. Strategist:
Модель высокого качества для сложных решений.

2. Writer:
Дешевая модель для draft-задач.

3. Ops Intelligence:
Rule-based логика для скоринга, рисков и weekly loop.

Экономика токенов:

1. Сначала deterministic фильтры (intake gate).
2. Только потом вызов модели, если лид не отсеян.

---

## 3) Scope (Lean)

В scope:

1. Intake + скоринг лидов.
2. Proposal pack и cover-letter drafting.
3. Легкий delivery pulse (не task manager).
4. Weekly review и playbook-подсказки.

Вне scope:

1. Полноценная mini-Jira.
2. Корпоративная advanced analytics ради визуализаций.
3. Сложная enterprise-инфраструктура.

---

## 4) Архитектура

1. Frontend:
React + Vite (Ops Hub как основной интерфейс).

2. Backend:
FastAPI (скоринг, оркестрация, API, хранение).

3. Data:
Local JSON store: `.ai/ops/phase1_store.json`.

4. AI:
Gemini для strategist/writer сценариев.

---

## 5) Домены Данных

1. `opportunities`
Лиды и их экономические параметры.

2. `decisions`
Стратегические решения и rationale.

3. `postmortems`
Причины wins/losses и action items.

4. `execution_projects`
Минимальный delivery-пульс: ссылка, деньги, часы, риски.

5. `weekly_reviews`
Недельная фиксация wins/misses/focus/confidence.

---

## 6) Ключевая Логика (Core)

## 6.1 Scoring Engine v2

1. Hard filters:
Лиды с бюджетом ниже порога (`$1000`) получают reject/deprioritize.

2. Penalty model:
Низкий бюджет, низкий hourly, hard-reject keywords, токсичные маркеры.

3. Explainability:
Каждый score сопровождается понятными причинами.

## 6.2 Intake Gate

1. Работает до дорогих AI-вызовов.
2. Использует budget/hourly сигналы из текста вакансии.
3. При reject может пропускать модель полностью (экономия токенов).

## 6.3 Delivery Intelligence

1. Отслеживает не только blocked/overdue, но и коммуникационную токсичность.
2. Следит за scope creep и падением effective hourly.
3. Выводит red-zone сигналы заранее.

## 6.4 Playbook Engine (v1 baseline)

1. Конвертирует успешные паттерны в playbook.
2. Автопредлагает playbook по триггерам.
3. Поднимает апселл и переговорную эффективность.
4. Ведет usage events и автоматически линковает outcome из opportunity/postmortem.
5. Адаптивно ранжирует рекомендации по historical win rate и effective hourly.
6. Собирает explicit feedback (helpful/not-helpful) для калибровки качества рекомендаций.

---

## 7) UX Принципы

1. Один Ops Hub для всей операционки.
2. Минимум обязательных ручных полей.
3. Автоматизация как "черновик + подтверждение", а не "черный ящик".
4. Видимые error messages и быстрый доступ к логам.

---

## 8) Надежность

Практичный уровень для solo-утилиты:

1. Логирование ошибок с `error_id`.
2. Backup-first (one-click zip backup + открытие backup папки из UI).
3. Простая восстановляемость данных.

Без избыточной сложности:

1. Минимальные необходимые проверки.
2. Без тяжелой тестовой матрицы на раннем этапе.

---

## 9) Метрики Успеха

1. Effective hourly `>= 85 USD/h`.
2. Win rate `>= 25%`.
3. Меньше ручной рутины в weekly review.
4. Раннее выявление проблемных клиентов и риск-проектов.

---

## 10) Текущий Фокус Разработки

1. Дотюнить toxicity/scope creep сигналы под реальные кейсы и убрать лишние false positives.
2. Откалибровать adaptive recommendation веса на основе живой статистики (feedback + win-rate + eff/h).
3. Повысить качество extraction из вложений (PDF/скриншоты) в сложных кейсах.
4. Подготовить стабильный релизный цикл: сборка exe + smoke-check после сборки.
5. Держать систему тонкой и дешевой в поддержке.
