import { useEffect, useMemo, useState } from 'react'

interface MobileOpsCompanionProps {
  apiBase: string
  onError: (message: string) => void
  onOpenWriter: () => void
  onOpenChat: () => void
  onOpenFullOps: () => void
}

type Stage = 'discovery' | 'qualified' | 'proposal' | 'interview' | 'negotiation' | 'won' | 'lost'

type MobileOpportunity = {
  id: string
  title: string
  client?: string
  stage: Stage
  score_v1?: number | null
  expected_revenue_usd?: number | null
  estimated_hours?: number | null
  intake_gate_status?: 'allow' | 'reject'
}

type MobileOpsPayload = {
  metrics?: {
    open_opportunity_count?: number
    closed_opportunity_count?: number
    win_rate_percent?: number
    effective_hourly_realized_usd?: number | null
    effective_hourly_estimated_pipeline_usd?: number | null
    target_checks?: {
      win_rate_target_percent?: number
      effective_hourly_target_usd?: number
    }
  }
  delivery_intelligence?: {
    blocked_projects?: number
    at_risk_projects?: number
    overdue_milestones?: number
    scope_creep_projects?: number
    communication_red_zone_projects?: number
    top_risks?: Array<{ risk: string; count: number }>
    top_toxicity_markers?: Array<{ marker: string; count: number }>
  }
  opportunities?: MobileOpportunity[]
}

const LABEL_STAGE: Record<Stage, string> = {
  discovery: 'Разведка',
  qualified: 'Квалиф.',
  proposal: 'Proposal',
  interview: 'Интервью',
  negotiation: 'Переговоры',
  won: 'Выиграно',
  lost: 'Проиграно',
}

const stageBadgeClass = (stage: Stage) => {
  if (stage === 'won') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (stage === 'lost') return 'border-red-700 bg-red-950/40 text-red-200'
  if (stage === 'negotiation' || stage === 'interview') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  if (stage === 'proposal') return 'border-blue-700 bg-blue-950/40 text-blue-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = (value as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

const usd = (value?: number | null) => (value === undefined || value === null ? '-' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)

const splitList = (value: string) => value.split(/[,\n;]+/).map(item => item.trim()).filter(Boolean)

const mondayIso = (source = new Date()) => {
  const d = new Date(source)
  const day = d.getDay()
  const delta = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

export default function MobileOpsCompanion({
  apiBase,
  onError,
  onOpenWriter,
  onOpenChat,
  onOpenFullOps,
}: MobileOpsCompanionProps) {
  const [data, setData] = useState<MobileOpsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [oppBusy, setOppBusy] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)

  const [oppTitle, setOppTitle] = useState('')
  const [oppClient, setOppClient] = useState('')
  const [oppBudget, setOppBudget] = useState('')
  const [oppHours, setOppHours] = useState('')
  const [oppSummary, setOppSummary] = useState('')

  const [reviewWeekStart, setReviewWeekStart] = useState(mondayIso())
  const [reviewWins, setReviewWins] = useState('')
  const [reviewMisses, setReviewMisses] = useState('')
  const [reviewFocus, setReviewFocus] = useState('')
  const [reviewConfidence, setReviewConfidence] = useState('70')

  const fetchOps = async () => {
    setBusy(true)
    if (!data) setLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/phase1`)
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось загрузить мобильный режим Ops Hub.'))
        return
      }
      setData(payload as MobileOpsPayload)
      onError('')
    } catch {
      onError('Сетевая ошибка при загрузке мобильного режима.')
    } finally {
      setLoading(false)
      setBusy(false)
    }
  }

  useEffect(() => {
    void fetchOps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase])

  const openLeads = useMemo(() => {
    return (data?.opportunities || [])
      .filter(item => item.stage !== 'won' && item.stage !== 'lost')
      .slice(0, 8)
  }, [data])

  const saveQuickOpportunity = async () => {
    if (!oppTitle.trim()) {
      onError('Заполни хотя бы название opportunity.')
      return
    }
    setOppBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: oppTitle.trim(),
          client: oppClient.trim() || undefined,
          stage: 'discovery',
          expected_revenue_usd: oppBudget ? Number(oppBudget) : undefined,
          estimated_hours: oppHours ? Number(oppHours) : undefined,
          summary: oppSummary.trim() || undefined,
          platform: 'Upwork',
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось сохранить opportunity.'))
        return
      }
      setOppTitle('')
      setOppClient('')
      setOppBudget('')
      setOppHours('')
      setOppSummary('')
      onError('Opportunity сохранена. Можно продолжать в полном Ops Hub.')
      await fetchOps()
    } catch {
      onError('Сетевая ошибка при сохранении opportunity.')
    } finally {
      setOppBusy(false)
    }
  }

  const saveQuickWeeklyReview = async () => {
    setReviewBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/weekly_review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: reviewWeekStart || mondayIso(),
          wins: splitList(reviewWins),
          misses: splitList(reviewMisses),
          focus_next_week: splitList(reviewFocus),
          confidence_percent: Number(reviewConfidence) || 70,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось сохранить weekly review.'))
        return
      }
      onError('Weekly review сохранён.')
      await fetchOps()
    } catch {
      onError('Сетевая ошибка при сохранении weekly review.')
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Командный режим (моб.)</div>
              <div className="text-xs text-zinc-400">Фокус на 20% действий, которые дают 80% эффекта.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void fetchOps()}
                disabled={busy}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs hover:bg-zinc-800 disabled:opacity-60"
              >
                {busy ? 'Обновляю...' : 'Обновить'}
              </button>
              <button
                onClick={onOpenFullOps}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-100 px-3 text-xs text-zinc-900 hover:bg-white"
              >
                Полный режим
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
            Загружаю мобильную сводку...
          </div>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Открытые</div>
                <div className="mt-1 text-xl font-semibold">{data.metrics?.open_opportunity_count ?? 0}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Win rate</div>
                <div className="mt-1 text-xl font-semibold">{Math.round(data.metrics?.win_rate_percent ?? 0)}%</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Eff/H факт</div>
                <div className="mt-1 text-lg font-semibold">{usd(data.metrics?.effective_hourly_realized_usd)}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-400">Eff/H воронка</div>
                <div className="mt-1 text-lg font-semibold">{usd(data.metrics?.effective_hourly_estimated_pipeline_usd)}</div>
              </div>
            </div>

            <details open className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">1) Быстрый Intake (новая opportunity)</summary>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  value={oppTitle}
                  onChange={e => setOppTitle(e.target.value)}
                  placeholder="Название вакансии"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                />
                <input
                  value={oppClient}
                  onChange={e => setOppClient(e.target.value)}
                  placeholder="Клиент (опционально)"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={oppBudget}
                    onChange={e => setOppBudget(e.target.value)}
                    placeholder="Бюджет USD"
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                  />
                  <input
                    value={oppHours}
                    onChange={e => setOppHours(e.target.value)}
                    placeholder="Часы"
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
                <textarea
                  value={oppSummary}
                  onChange={e => setOppSummary(e.target.value)}
                  placeholder="Краткий контекст вакансии"
                  className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none"
                />
                <button
                  onClick={() => void saveQuickOpportunity()}
                  disabled={oppBusy}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-100 px-4 text-sm text-zinc-900 hover:bg-white disabled:opacity-60"
                >
                  {oppBusy ? 'Сохраняю...' : 'Сохранить в Воронку'}
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">2) Открытые лиды (кратко)</summary>
              <div className="mt-3 flex flex-col gap-2">
                {openLeads.length === 0 && <div className="text-xs text-zinc-500">Нет активных лидов.</div>}
                {openLeads.map(item => (
                  <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{item.title}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${stageBadgeClass(item.stage)}`}>{LABEL_STAGE[item.stage]}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">{item.client || 'Клиент не указан'}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-zinc-400">
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5">Score: {Math.round(item.score_v1 || 0)}</span>
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5">Бюджет: {usd(item.expected_revenue_usd)}</span>
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5">Часы: {item.estimated_hours ?? '-'}</span>
                      {item.intake_gate_status === 'reject' && (
                        <span className="rounded border border-red-800 bg-red-950/40 px-2 py-0.5 text-red-200">Gate reject</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">3) Недельный чек-ин (быстро)</summary>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  value={reviewWeekStart}
                  onChange={e => setReviewWeekStart(e.target.value)}
                  placeholder="Дата недели (YYYY-MM-DD)"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                />
                <textarea
                  value={reviewWins}
                  onChange={e => setReviewWins(e.target.value)}
                  placeholder="Победы"
                  className="h-16 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none"
                />
                <textarea
                  value={reviewMisses}
                  onChange={e => setReviewMisses(e.target.value)}
                  placeholder="Промахи"
                  className="h-16 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none"
                />
                <textarea
                  value={reviewFocus}
                  onChange={e => setReviewFocus(e.target.value)}
                  placeholder="Фокус следующей недели"
                  className="h-16 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none"
                />
                <input
                  value={reviewConfidence}
                  onChange={e => setReviewConfidence(e.target.value)}
                  placeholder="Уверенность %"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500"
                />
                <button
                  onClick={() => void saveQuickWeeklyReview()}
                  disabled={reviewBusy}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-100 px-4 text-sm text-zinc-900 hover:bg-white disabled:opacity-60"
                >
                  {reviewBusy ? 'Сохраняю...' : 'Сохранить weekly review'}
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">4) Быстрые действия</summary>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button onClick={onOpenWriter} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm hover:bg-zinc-800">
                  Открыть Writer (cover letters)
                </button>
                <button onClick={onOpenChat} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm hover:bg-zinc-800">
                  Перейти в стратегический чат
                </button>
                <button onClick={onOpenFullOps} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm hover:bg-zinc-800">
                  Открыть полный Ops Hub
                </button>
              </div>
              <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                Компромисс мобильного режима: здесь ты ведёшь только оперативный цикл (intake + приоритеты + weekly check-in).
                Детализация, тонкая настройка скоринга и глубокий разбор остаются в полном режиме.
              </div>
            </details>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
              <div>Delivery риски: blocked {data.delivery_intelligence?.blocked_projects ?? 0} | at risk {data.delivery_intelligence?.at_risk_projects ?? 0}</div>
              <div className="mt-1">Overdue milestones: {data.delivery_intelligence?.overdue_milestones ?? 0} | Scope creep: {data.delivery_intelligence?.scope_creep_projects ?? 0}</div>
              <div className="mt-1">Красная зона коммуникации: {data.delivery_intelligence?.communication_red_zone_projects ?? 0}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(data.delivery_intelligence?.top_toxicity_markers || []).slice(0, 4).map(item => (
                  <span key={item.marker} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px]">
                    {item.marker}: {item.count}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
