import { useEffect, useMemo, useState } from 'react'
import OpsHubModal from './OpsHubModal.tsx'

type OpsSection = 'dashboard' | 'pipeline' | 'execution' | 'playbooks' | 'decisions' | 'postmortem' | 'settings'
type Stage = 'discovery' | 'qualified' | 'proposal' | 'interview' | 'negotiation' | 'waiting_offer' | 'offer_received' | 'blocked' | 'active' | 'won' | 'upsell' | 'lost'

type Opportunity = {
  id: string
  title: string
  client?: string
  stage: Stage
  summary?: string
  notes?: string
  platform?: string
  job_url?: string
  expected_revenue_usd?: number | null
  estimated_hours?: number | null
  actual_revenue_usd?: number | null
  actual_hours?: number | null
  score_v1?: number | null
  score_recommendation?: 'prioritize' | 'consider' | 'deprioritize'
  score_rationale?: string[]
  intake_gate_status?: 'allow' | 'reject'
  updated_at?: string
}

type PipelineColumn = {
  stage: Stage
  count: number
  expected_revenue_usd: number
  items: Opportunity[]
}

type OpsPayload = {
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
    top_toxicity_markers?: Array<{ marker: string; count: number }>
  }
  pipeline_board?: PipelineColumn[]
  opportunities?: Opportunity[]
}

interface OpsCommandCenterProps {
  apiBase: string
  onError: (message: string) => void
}

const STAGES: Stage[] = [
  'discovery',
  'qualified',
  'proposal',
  'interview',
  'negotiation',
  'waiting_offer',
  'offer_received',
  'blocked',
  'active',
  'won',
  'upsell',
  'lost'
]

const STAGE_LABEL: Record<Stage, string> = {
  discovery: 'Разведка',
  qualified: 'Квалифицировано',
  proposal: 'Предложение',
  interview: 'Интервью',
  negotiation: 'Переговоры',
  waiting_offer: 'Ожидание оффера',
  offer_received: 'Оффер получен',
  blocked: 'Ожидание доступов',
  active: 'В работе',
  won: 'Выиграно',
  upsell: 'Апселл',
  lost: 'Проиграно',
}

const SECTION_LABEL: Record<OpsSection, string> = {
  dashboard: 'Dashboard',
  pipeline: 'Воронка',
  execution: 'Исполнение',

  playbooks: 'Playbooks',
  decisions: 'Решения',
  postmortem: 'Разбор / Postmortem',
  settings: 'Настройки',
}

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = (value as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (detail) return JSON.stringify(detail)
  }
  return fallback
}

const usd = (value?: number | null) => (value === undefined || value === null ? '-' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)

const shortDate = (value?: string) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

const scoreBadgeClass = (recommendation?: Opportunity['score_recommendation']) => {
  if (recommendation === 'prioritize') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (recommendation === 'consider') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

const extractOpsPayload = (payload: unknown): OpsPayload | null => {
  if (payload && typeof payload === 'object' && 'metrics' in payload) {
    return payload as OpsPayload
  }
  if (payload && typeof payload === 'object' && 'payload' in payload) {
    const nested = (payload as { payload?: unknown }).payload
    if (nested && typeof nested === 'object' && 'metrics' in nested) {
      return nested as OpsPayload
    }
  }
  return null
}

export default function OpsCommandCenter({ apiBase, onError }: OpsCommandCenterProps) {
  const [section, setSection] = useState<OpsSection>('dashboard')
  const [data, setData] = useState<OpsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [stageFilter, setStageFilter] = useState<Stage>('discovery')
  const [pipelineMode, setPipelineMode] = useState<'list' | 'detail'>('list')
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('')

  const [detailTitle, setDetailTitle] = useState('')
  const [detailClient, setDetailClient] = useState('')
  const [detailJobUrl, setDetailJobUrl] = useState('')
  const [detailStage, setDetailStage] = useState<Stage>('discovery')
  const [detailExpectedRevenue, setDetailExpectedRevenue] = useState('')
  const [detailEstimatedHours, setDetailEstimatedHours] = useState('')
  const [detailSummary, setDetailSummary] = useState('')
  const [detailNotes, setDetailNotes] = useState('')
  const [isEditingDetail, setIsEditingDetail] = useState(false)

  const [proposalPackText, setProposalPackText] = useState('')
  const [proposalBusy, setProposalBusy] = useState(false)
  const [autofillBusy, setAutofillBusy] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [createClient, setCreateClient] = useState('')
  const [createStage, setCreateStage] = useState<Stage>('discovery')
  const [createJobUrl, setCreateJobUrl] = useState('')
  const [createExpectedRevenue, setCreateExpectedRevenue] = useState('')
  const [createEstimatedHours, setCreateEstimatedHours] = useState('')
  const [createSummary, setCreateSummary] = useState('')
  const [createNotes, setCreateNotes] = useState('')
  const [autofillHint, setAutofillHint] = useState('')
  const [showCreateOverlay, setShowCreateOverlay] = useState(false)

  const fetchOps = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/phase1`)
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось загрузить данные Ops'))
        return
      }
      const extracted = extractOpsPayload(payload)
      if (!extracted) {
        onError('Неожиданный формат ответа /api/ops/phase1')
        return
      }
      setData(extracted)
      onError('')
    } catch {
      onError('Сетевая ошибка при загрузке Ops')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchOps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase])

  // Auto-refresh when draft cards confirm changes in the chat
  useEffect(() => {
    const handler = () => void fetchOps()
    window.addEventListener('ops-data-changed', handler)
    return () => window.removeEventListener('ops-data-changed', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase])

  const pipelineBoard = useMemo(() => data?.pipeline_board || [], [data])
  const stageItems = useMemo(() => {
    const column = pipelineBoard.find(item => item.stage === stageFilter)
    return (column?.items || []).slice().sort((a, b) => {
      const aTs = new Date(a.updated_at || '').getTime()
      const bTs = new Date(b.updated_at || '').getTime()
      return bTs - aTs
    })
  }, [pipelineBoard, stageFilter])

  const selectedOpportunity = useMemo(
    () => stageItems.find(item => item.id === selectedOpportunityId) || null,
    [selectedOpportunityId, stageItems],
  )

  useEffect(() => {
    if (!selectedOpportunity) return
    setDetailTitle(selectedOpportunity.title || '')
    setDetailClient(selectedOpportunity.client || '')
    setDetailJobUrl(selectedOpportunity.job_url || '')
    setDetailStage(selectedOpportunity.stage || 'discovery')
    setDetailExpectedRevenue(
      selectedOpportunity.expected_revenue_usd === undefined || selectedOpportunity.expected_revenue_usd === null
        ? ''
        : String(selectedOpportunity.expected_revenue_usd),
    )
    setDetailEstimatedHours(
      selectedOpportunity.estimated_hours === undefined || selectedOpportunity.estimated_hours === null
        ? ''
        : String(selectedOpportunity.estimated_hours),
    )
    setDetailSummary(selectedOpportunity.summary || '')
    setDetailNotes(selectedOpportunity.notes || '')
    setIsEditingDetail(false)
  }, [selectedOpportunity])

  const currentIndex = useMemo(
    () => stageItems.findIndex(item => item.id === selectedOpportunityId),
    [stageItems, selectedOpportunityId],
  )

  const openOpportunity = (id: string) => {
    setSelectedOpportunityId(id)
    setProposalPackText('')
    setPipelineMode('detail')
  }

  const moveToPrev = () => {
    if (currentIndex <= 0) return
    openOpportunity(stageItems[currentIndex - 1].id)
  }

  const moveToNext = () => {
    if (currentIndex >= 0 && currentIndex < stageItems.length - 1) {
      openOpportunity(stageItems[currentIndex + 1].id)
      return
    }
    const currentStageIndex = STAGES.indexOf(stageFilter)
    const nextStage = STAGES[currentStageIndex + 1]
    if (!nextStage) return
    const nextColumn = pipelineBoard.find(item => item.stage === nextStage)
    const nextCount = nextColumn?.items?.length || 0
    if (nextCount <= 0) return
    const ok = window.confirm(`Карточки в "${STAGE_LABEL[stageFilter]}" закончились. Перейти к категории "${STAGE_LABEL[nextStage]}"?`)
    if (!ok) return
    setStageFilter(nextStage)
    setPipelineMode('list')
    setSelectedOpportunityId('')
  }

  const saveOpportunity = async () => {
    if (!selectedOpportunityId || !detailTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedOpportunityId,
          title: detailTitle,
          client: detailClient,
          stage: detailStage,
          job_url: detailJobUrl,
          expected_revenue_usd: detailExpectedRevenue,
          estimated_hours: detailEstimatedHours,
          summary: detailSummary,
          notes: detailNotes,
          platform: selectedOpportunity?.platform || 'Upwork',
          actual_revenue_usd: selectedOpportunity?.actual_revenue_usd,
          actual_hours: selectedOpportunity?.actual_hours,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось обновить opportunity'))
        return
      }
      const extracted = extractOpsPayload(payload)
      if (extracted) {
        setData(extracted)
      } else {
        await fetchOps()
      }
      setIsEditingDetail(false)
      onError('')
    } catch {
      onError('Сетевая ошибка при обновлении opportunity')
    } finally {
      setSaving(false)
    }
  }

  const deleteOpportunity = async () => {
    if (!selectedOpportunityId || !selectedOpportunity) return
    const ok = window.confirm(`Удалить opportunity "${selectedOpportunity.title}"?`)
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/opportunity/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedOpportunityId }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось удалить opportunity'))
        return
      }
      const extracted = extractOpsPayload(payload)
      if (extracted) {
        setData(extracted)
      } else {
        await fetchOps()
      }
      setPipelineMode('list')
      setSelectedOpportunityId('')
      setProposalPackText('')
      onError('')
    } catch {
      onError('Сетевая ошибка при удалении opportunity')
    } finally {
      setSaving(false)
    }
  }

  const buildProposalPack = async () => {
    if (!selectedOpportunityId) return
    setProposalBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/proposal_pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: selectedOpportunityId,
          include_ai_draft: true,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.pack) {
        onError(toErrorMessage(payload, 'Не удалось собрать proposal pack'))
        return
      }
      const pack = payload.pack
      const text = [
        `Opportunity: ${pack.opportunity?.title || '-'}`,
        `Score: ${pack.score_summary?.score_v1 ?? '-'}`,
        '',
        'Почему брать проект:',
        ...(pack.why_this_project || []).map((line: string) => `- ${line}`),
        '',
        'Риски:',
        ...(pack.risk_flags || []).map((line: string) => `- ${line}`),
        '',
        'Вопросы клиенту:',
        ...(pack.questions_for_client || []).map((line: string) => `- ${line}`),
        '',
        'Черновик cover letter:',
        pack.cover_letter_draft || '(не сгенерирован)',
      ].join('\n')
      setProposalPackText(text)
      onError('')
    } catch {
      onError('Сетевая ошибка при сборке proposal pack')
    } finally {
      setProposalBusy(false)
    }
  }

  const runAutofill = async () => {
    if (!sourceUrl.trim() && !sourceText.trim() && !sourceFile) {
      onError('Заполни хотя бы один источник: URL, текст или файл.')
      return
    }
    setAutofillBusy(true)
    try {
      const form = new FormData()
      form.append('source_url', sourceUrl)
      form.append('source_text', sourceText)
      form.append('stage_hint', createStage || stageFilter)
      if (sourceFile) form.append('file', sourceFile)
      const res = await fetch(`${apiBase}/api/ops/opportunity/autofill`, {
        method: 'POST',
        body: form,
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.autofill) {
        onError(toErrorMessage(payload, 'Не удалось автозаполнить карточку'))
        return
      }
      const auto = payload.autofill
      setCreateTitle(auto.title || '')
      setCreateClient(auto.client || '')
      setCreateStage((auto.stage as Stage) || createStage)
      setCreateJobUrl(auto.job_url || sourceUrl || '')
      setCreateExpectedRevenue(
        auto.expected_revenue_usd === undefined || auto.expected_revenue_usd === null
          ? ''
          : String(auto.expected_revenue_usd),
      )
      setCreateEstimatedHours(
        auto.estimated_hours === undefined || auto.estimated_hours === null
          ? ''
          : String(auto.estimated_hours),
      )
      setCreateSummary(auto.summary || '')
      setCreateNotes(auto.notes || '')
      const gateDecision = payload?.intake_gate?.decision ? `Gate: ${payload.intake_gate.decision}` : ''
      const confidence =
        auto.confidence_percent !== undefined
          ? `Confidence: ${Math.round(Number(auto.confidence_percent) || 0)}%`
          : ''
      setAutofillHint([gateDecision, confidence].filter(Boolean).join(' | '))
      onError('')
    } catch {
      onError('Сетевая ошибка при автозаполнении карточки')
    } finally {
      setAutofillBusy(false)
    }
  }

  const createOpportunity = async () => {
    if (!createTitle.trim()) {
      onError('Укажи название карточки.')
      return
    }
    setCreateBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle,
          client: createClient,
          stage: createStage || stageFilter,
          job_url: createJobUrl,
          expected_revenue_usd: createExpectedRevenue,
          estimated_hours: createEstimatedHours,
          summary: createSummary,
          notes: createNotes,
          platform: 'Upwork',
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Не удалось добавить карточку'))
        return
      }
      const extracted = extractOpsPayload(payload)
      if (extracted) {
        setData(extracted)
      } else {
        await fetchOps()
      }
      setStageFilter(createStage || stageFilter)
      setCreateTitle('')
      setCreateClient('')
      setCreateJobUrl('')
      setCreateExpectedRevenue('')
      setCreateEstimatedHours('')
      setCreateSummary('')
      setCreateNotes('')
      setSourceText('')
      setSourceUrl('')
      setSourceFile(null)
      setAutofillHint('')
      setShowCreateOverlay(false)
      onError('')
    } catch {
      onError('Сетевая ошибка при создании карточки')
    } finally {
      setCreateBusy(false)
    }
  }

  const renderDashboard = () => (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 xl:col-span-2">
        <h3 className="text-sm font-semibold">Ключевые показатели</h3>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-[11px] text-zinc-400 uppercase">Открытые</div>
            <div className="mt-1 text-xl font-semibold">{data?.metrics?.open_opportunity_count ?? 0}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-[11px] text-zinc-400 uppercase">Закрытые</div>
            <div className="mt-1 text-xl font-semibold">{data?.metrics?.closed_opportunity_count ?? 0}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-[11px] text-zinc-400 uppercase">Win rate</div>
            <div className="mt-1 text-xl font-semibold">{Math.round(data?.metrics?.win_rate_percent || 0)}%</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-[11px] text-zinc-400 uppercase">Eff/H</div>
            <div className="mt-1 text-xl font-semibold">{usd(data?.metrics?.effective_hourly_realized_usd)}</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <h3 className="text-sm font-semibold">Срочные сигналы</h3>
        <div className="mt-3 text-xs text-zinc-300 space-y-1">
          <div>Blocked: {data?.delivery_intelligence?.blocked_projects ?? 0}</div>
          <div>At risk: {data?.delivery_intelligence?.at_risk_projects ?? 0}</div>
          <div>Overdue milestones: {data?.delivery_intelligence?.overdue_milestones ?? 0}</div>
          <div>Scope creep: {data?.delivery_intelligence?.scope_creep_projects ?? 0}</div>
          <div>Red-zone communication: {data?.delivery_intelligence?.communication_red_zone_projects ?? 0}</div>
        </div>
      </div>
    </div>
  )

  const renderPipelineList = () => (
    <div className="h-full flex gap-3">
      <aside className="w-[280px] shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
        <div className="text-xs text-zinc-400 uppercase tracking-wide">Stages</div>
        <div className="mt-2 flex flex-col gap-1">
          {STAGES.map(stage => {
            const column = pipelineBoard.find(item => item.stage === stage)
            const count = column?.items?.length || 0
            return (
              <button
                key={stage}
                onClick={() => {
                  setStageFilter(stage)
                  setPipelineMode('list')
                  setSelectedOpportunityId('')
                }}
                className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${stageFilter === stage ? 'border-zinc-500 bg-zinc-100 text-zinc-900' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>{STAGE_LABEL[stage]}</span>
                  <span>{count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>
      <div className="min-h-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 overflow-y-auto">
        {showCreateOverlay && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-medium">New Opportunity</div>
                <button onClick={() => setShowCreateOverlay(false)} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">Close</button>
              </div>
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 xl:col-span-2">
                  <span className="text-[11px] text-zinc-400">Job URL</span>
                  <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://www.upwork.com/jobs/..." className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1 xl:col-span-2">
                  <span className="text-[11px] text-zinc-400">Vacancy Text / Brief</span>
                  <textarea value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="Paste vacancy text..." className="h-24 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm resize-none outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">File (Screenshot/PDF)</span>
                  <input type="file" accept="image/*,.pdf,.txt,.md,.doc,.docx" onChange={e => setSourceFile(e.target.files?.[0] ?? null)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">Stage</span>
                  <select value={createStage} onChange={e => setCreateStage(e.target.value as Stage)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500">
                    {STAGES.map(stage => (
                      <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>
                    ))}
                  </select>
                </label>
                <div className="xl:col-span-2 flex flex-wrap items-center gap-2">
                  <button onClick={runAutofill} disabled={autofillBusy} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs disabled:opacity-60">{autofillBusy ? 'Autofill...' : 'Autofill'}</button>
                  <button onClick={createOpportunity} disabled={createBusy || !createTitle.trim()} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-xs disabled:opacity-60">{createBusy ? 'Creating...' : 'Create Card'}</button>
                  {sourceFile && <button onClick={() => setSourceFile(null)} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">Remove File</button>}
                  {sourceFile && <div className="text-[11px] text-zinc-400 truncate max-w-[360px]">{sourceFile.name}</div>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 md:col-span-2"><span className="text-[11px] text-zinc-400">Title</span><input value={createTitle} onChange={e => setCreateTitle(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-400">Client</span><input value={createClient} onChange={e => setCreateClient(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-400">URL (extracted)</span><input value={createJobUrl} onChange={e => setCreateJobUrl(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-400">Expected Revenue USD</span><input value={createExpectedRevenue} onChange={e => setCreateExpectedRevenue(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-400">Estimated Hours</span><input value={createEstimatedHours} onChange={e => setCreateEstimatedHours(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1 md:col-span-2"><span className="text-[11px] text-zinc-400">Summary</span><textarea value={createSummary} onChange={e => setCreateSummary(e.target.value)} className="h-20 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm resize-none outline-none focus:border-zinc-500" /></label>
                <label className="flex flex-col gap-1 md:col-span-2"><span className="text-[11px] text-zinc-400">Notes</span><textarea value={createNotes} onChange={e => setCreateNotes(e.target.value)} className="h-20 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm resize-none outline-none focus:border-zinc-500" /></label>
              </div>
              {autofillHint && <div className="mt-2 text-[11px] text-zinc-400">{autofillHint}</div>}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Список карточек: {STAGE_LABEL[stageFilter]}</h3>
          <div className="flex items-center gap-2">
            <div className="text-xs text-zinc-400">Всего: {stageItems.length}</div>
            <button onClick={() => setShowCreateOverlay(prev => !prev)} className="h-8 w-8 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm" title="Добавить карточку">+</button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {stageItems.map(item => (
            <button key={item.id} onClick={() => openOpportunity(item.id)} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-zinc-700">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{item.title || 'Без названия'}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${scoreBadgeClass(item.score_recommendation)}`}>{item.score_v1 ?? '-'}</span>
              </div>
              <div className="text-xs text-zinc-400 mt-1">{item.client || 'Клиент не указан'} | {usd(item.expected_revenue_usd)} | {item.estimated_hours ?? '-'} ч</div>
              {item.summary && <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{item.summary}</div>}
            </button>
          ))}
          {stageItems.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">В этой категории пока нет карточек.</div>}
        </div>
      </div>
    </div>
  )

  const renderPipelineDetail = () => {
    if (!selectedOpportunity) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
          Карточка не найдена. Вернись к списку.
        </div>
      )
    }

    const atEndOfStage = currentIndex >= stageItems.length - 1
    const DetailRow = ({ label, value }: { label: string; value: string }) => (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
        <div className="text-[11px] text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-200 mt-0.5 whitespace-pre-wrap break-words">{value || '-'}</div>
      </div>
    )

    return (
      <div className="h-full flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setPipelineMode('list')}
            className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
          >
            К списку
          </button>
          <div className="text-xs text-zinc-400">{currentIndex + 1} / {stageItems.length}</div>
        </div>

        <div className="grid grid-cols-[72px_minmax(0,1fr)_72px] gap-3 min-h-0 flex-1">
          <button
            onClick={moveToPrev}
            disabled={currentIndex <= 0}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 disabled:opacity-40 flex items-center justify-center text-zinc-300"
            title="Предыдущая карточка"
          >
            <span className="text-2xl">в†ђ</span>
          </button>

          <div className="min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-zinc-500">Карточка opportunity</div>
                <h3 className="text-xl font-semibold leading-tight mt-1">{detailTitle || 'Без названия'}</h3>
              </div>
              <button
                onClick={() => setIsEditingDetail(prev => !prev)}
                className={`h-8 px-2 rounded-md border text-xs ${isEditingDetail ? 'border-zinc-500 bg-zinc-100 text-zinc-900' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                  }`}
                title="Edit"
              >
                вњЋ
              </button>
            </div>

            {!isEditingDetail ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                <DetailRow label="Клиент" value={detailClient} />
                <DetailRow label="Стадия" value={STAGE_LABEL[detailStage]} />
                <DetailRow label="URL" value={detailJobUrl} />
                <DetailRow label="Ожидаемая выручка" value={detailExpectedRevenue ? `${detailExpectedRevenue} USD` : '-'} />
                <DetailRow label="Оценка часов" value={detailEstimatedHours} />
                <div className="md:col-span-2">
                  <DetailRow label="Summary" value={detailSummary} />
                </div>
                <div className="md:col-span-2">
                  <DetailRow label="Notes" value={detailNotes} />
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] text-zinc-400">Название</span>
                  <input value={detailTitle} onChange={e => setDetailTitle(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">Клиент</span>
                  <input value={detailClient} onChange={e => setDetailClient(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">Стадия</span>
                  <select value={detailStage} onChange={e => setDetailStage(e.target.value as Stage)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                    {STAGES.map(stage => (
                      <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] text-zinc-400">URL вакансии</span>
                  <input value={detailJobUrl} onChange={e => setDetailJobUrl(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">Ожидаемая выручка (USD)</span>
                  <input value={detailExpectedRevenue} onChange={e => setDetailExpectedRevenue(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">Оценка часов</span>
                  <input value={detailEstimatedHours} onChange={e => setDetailEstimatedHours(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] text-zinc-400">Summary</span>
                  <textarea value={detailSummary} onChange={e => setDetailSummary(e.target.value)} className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm resize-none outline-none focus:border-zinc-500" />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] text-zinc-400">Notes</span>
                  <textarea value={detailNotes} onChange={e => setDetailNotes(e.target.value)} className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm resize-none outline-none focus:border-zinc-500" />
                </label>
              </div>
            )}

            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Рекомендация</div>
              <div className="text-sm mt-1">{selectedOpportunity.score_recommendation || '-'}</div>
              {selectedOpportunity.score_rationale && selectedOpportunity.score_rationale.length > 0 && (
                <div className="text-xs text-zinc-500 mt-2">
                  {selectedOpportunity.score_rationale.slice(0, 3).map(line => (
                    <div key={line}>- {line}</div>
                  ))}
                </div>
              )}
            </div>

            {proposalPackText && (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400 mb-2">Proposal Pack</div>
                <pre className="whitespace-pre-wrap text-[11px] text-zinc-300">{proposalPackText}</pre>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">Обновлено: {shortDate(selectedOpportunity.updated_at)}</div>
              <div className="flex items-center gap-2">
                <button onClick={buildProposalPack} disabled={proposalBusy} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs disabled:opacity-60">
                  {proposalBusy ? 'Собираю Pack...' : 'Собрать Proposal Pack'}
                </button>
                {isEditingDetail && (
                  <>
                    <button onClick={deleteOpportunity} disabled={saving} className="h-9 px-3 rounded-md border border-red-900/60 bg-red-950/40 hover:bg-red-900/40 text-xs text-red-200 disabled:opacity-60">Удалить</button>
                    <button onClick={saveOpportunity} disabled={saving || !detailTitle.trim()} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-xs disabled:opacity-60">Сохранить</button>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={moveToNext}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 flex items-center justify-center text-zinc-300"
            title="Следующая карточка"
          >
            <span className="text-2xl">{atEndOfStage ? 'в†¬' : 'в†’'}</span>
          </button>
        </div>
      </div>
    )
  }

  const renderSingleSubjectPage = (tab: 'execution' | 'playbooks' | 'decisions' | 'postmortem' | 'settings') => {
    if (tab === 'postmortem' && (data?.metrics?.closed_opportunity_count || 0) <= 0) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
          Разбор доступен только после завершения opportunities (won/lost/withdrawn/no_response).
        </div>
      )
    }
    return <OpsHubModal embedded apiBase={apiBase} onError={onError} lockTab={tab} compact />
  }

  return (
    <div className="h-full w-full p-3 md:p-4">
      <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-950/92 overflow-hidden">
        <div className="h-full flex">
          <aside className="w-[240px] shrink-0 border-r border-zinc-800 bg-zinc-950/80 p-3 hidden md:block">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Основной поток</div>
            <div className="mt-2 flex flex-col gap-1">
              {(['dashboard', 'pipeline', 'execution'] as OpsSection[]).map(item => (
                <button
                  key={item}
                  onClick={() => setSection(item)}
                  className={`rounded-md border px-3 py-2 text-left text-xs ${section === item ? 'border-zinc-500 bg-zinc-100 text-zinc-900' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'}`}
                >
                  {SECTION_LABEL[item]}
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] uppercase tracking-wider text-zinc-500">Опционально</div>
            <div className="mt-2 flex flex-col gap-1">
              {(['decisions', 'playbooks', 'postmortem'] as OpsSection[]).map(item => (
                <button
                  key={item}
                  onClick={() => setSection(item)}
                  className={`rounded-md border px-3 py-2 text-left text-xs ${section === item ? 'border-zinc-500 bg-zinc-100 text-zinc-900' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'}`}
                >
                  {SECTION_LABEL[item]}
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 flex-1 flex flex-col">
            <header className="h-12 border-b border-zinc-800 px-3 md:px-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">{SECTION_LABEL[section]}</div>
                <button onClick={fetchOps} className="h-7 px-2 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">
                  Обновить
                </button>
              </div>
              <button
                onClick={() => setSection('settings')}
                className={`h-8 w-8 rounded-md border ${section === 'settings' ? 'border-zinc-500 bg-zinc-100 text-zinc-900' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}
                title="Настройки"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.4l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 p-3 overflow-auto">
              {loading && (
                <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-center text-sm text-zinc-400">
                  Загружаю данные...
                </div>
              )}

              {!loading && (
                <>
                  {section === 'dashboard' && renderDashboard()}
                  {section === 'pipeline' && (pipelineMode === 'list' ? renderPipelineList() : renderPipelineDetail())}
                  {section === 'execution' && renderSingleSubjectPage('execution')}
                  {section === 'playbooks' && renderSingleSubjectPage('playbooks')}
                  {section === 'decisions' && renderSingleSubjectPage('decisions')}
                  {section === 'postmortem' && renderSingleSubjectPage('postmortem')}
                  {section === 'settings' && renderSingleSubjectPage('settings')}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
