import { useEffect, useMemo, useState, type ReactNode } from 'react'

interface OpsHubModalProps {
  isOpen?: boolean
  onClose?: () => void
  apiBase: string
  onError: (message: string) => void
  embedded?: boolean
}

type OpsTab = 'pipeline' | 'decisions' | 'postmortem' | 'playbooks' | 'delivery' | 'settings'
type Stage = 'discovery' | 'qualified' | 'proposal' | 'interview' | 'negotiation' | 'won' | 'lost'
type DecisionStatus = 'active' | 'validated' | 'superseded' | 'discarded'
type PostOutcome = 'won' | 'lost' | 'withdrawn' | 'no_response'
type ExecutionStatus = 'planning' | 'active' | 'at_risk' | 'blocked' | 'done' | 'archived'

type Milestone = {
  id?: string
  title: string
  status?: 'todo' | 'in_progress' | 'blocked' | 'done'
  due_date?: string
  completed_at?: string
  estimate_hours?: number | null
  actual_hours?: number | null
}

type Opportunity = {
  id: string
  title: string
  client?: string
  platform?: string
  stage: Stage
  job_url?: string
  summary?: string
  notes?: string
  expected_revenue_usd?: number | null
  estimated_hours?: number | null
  actual_revenue_usd?: number | null
  actual_hours?: number | null
  score_v1?: number | null
  score_band?: 'high' | 'medium' | 'low'
  score_recommendation?: 'prioritize' | 'consider' | 'deprioritize'
  score_rationale?: string[]
  estimated_hourly_usd?: number | null
  score_version?: string
  intake_gate_status?: 'allow' | 'reject'
  intake_gate_reasons?: string[]
  intake_score?: number | null
  hard_reject_hits?: string[]
  heavy_penalty_hits?: string[]
  risk_marker_hits?: string[]
  toxicity_hits?: string[]
  updated_at?: string
}

type Decision = {
  id: string
  summary: string
  options_considered?: string[]
  chosen_option?: string
  rationale?: string
  expected_impact?: string
  confidence_percent?: number | null
  status?: DecisionStatus
  updated_at?: string
}

type Postmortem = {
  id: string
  opportunity_id?: string
  outcome: PostOutcome
  findings: string
  root_causes?: string[]
  taxonomy_tags?: string[]
  action_items?: string[]
  what_worked?: string
  updated_at?: string
}

type ExecutionProject = {
  id: string
  opportunity_id?: string
  title: string
  client?: string
  status: ExecutionStatus
  summary?: string
  job_url?: string
  start_date?: string
  due_date?: string
  completed_at?: string
  planned_value_usd?: number | null
  actual_value_usd?: number | null
  planned_hours?: number | null
  actual_hours?: number | null
  risks?: string[]
  next_actions?: string[]
  milestones?: Milestone[]
  progress_percent?: number | null
  updated_at?: string
}

type WeeklyReview = {
  id: string
  week_start_date: string
  wins?: string[]
  misses?: string[]
  bottlenecks?: string[]
  experiments?: string[]
  focus_next_week?: string[]
  confidence_percent?: number | null
  linked_project_ids?: string[]
  updated_at?: string
}

type Playbook = {
  id: string
  title: string
  objective?: string
  trigger_keywords?: string[]
  actions?: string[]
  offer_template?: string
  tags?: string[]
  active?: boolean
  priority?: number | null
  usage_count?: number | null
  last_used_at?: string
  updated_at?: string
}

type PlaybookSuggestion = {
  playbook_id: string
  title: string
  objective?: string
  score?: number
  base_score?: number
  adaptive_delta?: number
  matched_triggers?: string[]
  actions?: string[]
  offer_template?: string
  tags?: string[]
  usage_count?: number
  historical_win_rate_percent?: number | null
  historical_effective_hourly_usd?: number | null
  historical_resolved_events?: number
  historical_feedback_score?: number | null
  historical_feedback_positive?: number
  historical_feedback_negative?: number
}

type PlaybookUsageEvent = {
  id: string
  playbook_id: string
  opportunity_id?: string
  project_id?: string
  source?: string
  notes?: string
  matched_triggers?: string[]
  outcome?: 'в ожидании' | 'won' | 'lost' | 'withdrawn' | 'no_response'
  outcome_linked_at?: string
  realized_revenue_usd?: number | null
  realized_hours?: number | null
  effective_hourly_usd?: number | null
  feedback_score?: number | null
  feedback_label?: 'helpful' | 'neutral' | 'not_helpful' | ''
  feedback_note?: string
  feedback_updated_at?: string
  updated_at?: string
  created_at?: string
}

type WeeklyReviewSuggestion = {
  week_start_date?: string
  wins?: string[]
  misses?: string[]
  bottlenecks?: string[]
  experiments?: string[]
  focus_next_week?: string[]
  confidence_percent?: number | null
  linked_project_ids?: string[]
  source_signals?: {
    projects_considered?: number
    done_projects_this_week?: number
    done_milestones_this_week?: number
    overdue_milestones?: number
    blocked_projects?: number
    at_risk_projects?: number
  }
}

type OpsData = {
  metrics: {
    open_opportunity_count: number
    closed_opportunity_count: number
    win_rate_percent: number
    effective_hourly_realized_usd?: number | null
    effective_hourly_estimated_pipeline_usd?: number | null
    target_checks: {
      win_rate_target_percent: number
      effective_hourly_target_usd: number
    }
  }
  success_targets: {
    effective_hourly_min_usd: number
    win_rate_min_percent: number
  }
  scoring_profile?: {
    version?: number
    preferred_keywords?: string[]
    risk_keywords?: string[]
    heavy_penalty_keywords?: string[]
    risk_marker_keywords?: string[]
    toxicity_keywords?: string[]
    hard_reject_keywords?: string[]
    intake_guardrails?: {
      min_budget_usd?: number
      min_hourly_usd?: number
      min_hourly_exception_usd?: number
      reject_score_threshold?: number
      skip_model_on_reject?: boolean
      hard_reject_on_low_budget?: boolean
    }
  }
  outcome_taxonomy_summary?: {
    total_postmortems?: number
    tagged_postmortems?: number
    coverage_percent?: number
    top_tags?: Array<{
      tag: string
      name: string
      count: number
      won_count: number
      lost_count: number
      withdrawn_count: number
      no_response_count: number
    }>
  }
  delivery_intelligence?: {
    total_projects?: number
    active_projects?: number
    blocked_projects?: number
    at_risk_projects?: number
    done_projects?: number
    overdue_milestones?: number
    milestone_completion_rate_percent?: number
    delivery_effective_hourly_usd?: number | null
    planned_effective_hourly_usd?: number | null
    avg_cycle_days?: number | null
    target_hourly_usd?: number
    effective_hourly_alert?: boolean
    scope_creep_projects?: number
    under_target_hourly_projects?: number
    communication_red_zone_projects?: number
    top_risks?: Array<{ risk: string; count: number }>
    top_toxicity_markers?: Array<{ marker: string; count: number }>
  }
  weekly_feedback_summary?: {
    total_reviews?: number
    last_week_start_date?: string
    average_confidence_percent?: number | null
    momentum_delta_percent?: number | null
    top_bottlenecks?: Array<{ label: string; count: number }>
  }
  playbooks?: Playbook[]
  playbook_summary?: {
    total_playbooks?: number
    active_playbooks?: number
    total_usage_count?: number
    usage_events_count?: number
    feedback_events_count?: number
    feedback_positive_count?: number
    feedback_negative_count?: number
    feedback_avg_score?: number | null
    triggered_now_count?: number
    top_triggered_playbooks?: Array<{
      id: string
      title: string
      hits: number
    }>
    top_performing_playbooks?: Array<{
      id: string
      title: string
      usage_events: number
      resolved_events: number
      pending_events: number
      won_events: number
      lost_events: number
      win_rate_percent?: number | null
      effective_hourly_usd?: number | null
      revenue_total_usd?: number | null
      avg_feedback_score?: number | null
      positive_feedback?: number
      negative_feedback?: number
    }>
  }
  playbook_usage_events?: PlaybookUsageEvent[]
  backup_summary?: {
    total_backups?: number
    latest_backup_at?: string
    backup_dir?: string
    items?: Array<{
      filename: string
      path: string
      size_bytes: number
      updated_at: string
    }>
  }
  pipeline_board: Array<{ stage: Stage; count: number; expected_revenue_usd: number; items: Opportunity[] }>
  opportunities: Opportunity[]
  decisions: Decision[]
  postmortems: Postmortem[]
  execution_projects?: ExecutionProject[]
  weekly_reviews?: WeeklyReview[]
}

type ProposalPack = {
  opportunity_id: string
  generated_at: string
  version?: string
  opportunity: {
    id: string
    title: string
    client?: string
    stage?: string
    summary?: string
    expected_revenue_usd?: number | null
    estimated_hours?: number | null
  }
  score_summary?: {
    score_v1?: number | null
    recommendation?: string
    estimated_hourly_usd?: number | null
    rationale?: string[]
  }
  why_this_project?: string[]
  proof_points?: string[]
  risk_flags?: string[]
  questions_for_client?: string[]
  scope_assumptions?: string[]
  negotiation_plan?: string[]
  playbook_recommendations?: Array<{
    playbook_id?: string
    title?: string
    score?: number
    matched_triggers?: string[]
    actions?: string[]
    offer_template?: string
    historical_win_rate_percent?: number | null
    historical_effective_hourly_usd?: number | null
    historical_feedback_score?: number | null
  }>
  cover_letter_draft?: string
  draft_error?: string
}

type OpportunityAutofill = {
  title?: string
  client?: string
  stage?: Stage
  expected_revenue_usd?: number | null
  estimated_hours?: number | null
  summary?: string
  notes?: string
  job_url?: string
  confidence_percent?: number | null
  missing_fields?: string[]
  signals?: string[]
}

type OpportunityAutofillResponse = {
  status?: string
  autofill?: OpportunityAutofill
  intake_gate?: {
    status?: string
    reasons?: string[]
  }
  source_meta?: {
    skipped_model_call?: boolean
    fallback_applied?: boolean
  }
}

const STAGES: Stage[] = ['discovery', 'qualified', 'proposal', 'interview', 'negotiation', 'won', 'lost']
const DECISION_STATUSES: DecisionStatus[] = ['active', 'validated', 'superseded', 'discarded']
const OUTCOMES: PostOutcome[] = ['won', 'lost', 'withdrawn', 'no_response']
const EXECUTION_STATUSES: ExecutionStatus[] = ['planning', 'active', 'at_risk', 'blocked', 'done', 'archived']
const LABEL_STAGE: Record<Stage, string> = {
  discovery: 'Разведка',
  qualified: 'Квалифицировано',
  proposal: 'Предложение',
  interview: 'Интервью',
  negotiation: 'Переговоры',
  won: 'Выиграно',
  lost: 'Проиграно',
}
const LABEL_DECISION: Record<DecisionStatus, string> = {
  active: 'Активно',
  validated: 'Подтверждено',
  superseded: 'Заменено',
  discarded: 'Отброшено',
}
const LABEL_OUTCOME: Record<PostOutcome, string> = {
  won: 'Выиграно',
  lost: 'Проиграно',
  withdrawn: 'Снято',
  no_response: 'Без ответа',
}
const LABEL_EXECUTION_STATUS: Record<ExecutionStatus, string> = {
  planning: 'Планирование',
  active: 'Активно',
  at_risk: 'Под риском',
  blocked: 'Блокер',
  done: 'Готово',
  archived: 'Архив',
}

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = (value as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

const usd = (value?: number | null) => (value === undefined || value === null ? '-' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
const bytesLabel = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-'
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}
const asInput = (value?: number | null) => (value === undefined || value === null ? '' : String(value))
const shortDate = (value?: string) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}
const splitList = (value: string) => value.split(/[,\n;]+/).map(item => item.trim()).filter(Boolean)
const splitLines = (value: string) => value.split(/\n+/).map(item => item.trim()).filter(Boolean)
const FieldLabel = ({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className="text-[11px] text-zinc-400">{label}</span>
    {children}
  </label>
)

const parseMilestonesInput = (value: string): Milestone[] => {
  return splitLines(value).map(line => {
    const [titlePart, statusPart, duePart] = line.split('|').map(item => item.trim())
    const allowed: Milestone['status'][] = ['todo', 'in_progress', 'blocked', 'done']
    const status = allowed.includes(statusPart as Milestone['status']) ? (statusPart as Milestone['status']) : 'todo'
    const due_date = /^\d{4}-\d{2}-\d{2}$/.test(duePart || '') ? duePart : undefined
    return {
      title: titlePart || line,
      status,
      due_date,
    }
  })
}
const milestoneToLine = (milestone: Milestone) => {
  const title = (milestone.title || '').trim()
  const status = milestone.status || 'todo'
  const due = milestone.due_date || ''
  return due ? `${title} | ${status} | ${due}` : `${title} | ${status}`
}
const scoreBadgeClass = (recommendation?: Opportunity['score_recommendation']) => {
  if (recommendation === 'prioritize') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (recommendation === 'consider') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}
const scoreLabel = (recommendation?: Opportunity['score_recommendation']) => {
  if (recommendation === 'prioritize') return 'Prioritize'
  if (recommendation === 'consider') return 'Consider'
  return 'Deprioritize'
}
const executionStatusClass = (status?: ExecutionStatus) => {
  if (status === 'done') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (status === 'blocked') return 'border-red-700 bg-red-950/40 text-red-200'
  if (status === 'at_risk') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  if (status === 'active') return 'border-blue-700 bg-blue-950/40 text-blue-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}
const playbookOutcomeBadgeClass = (outcome?: PlaybookUsageEvent['outcome']) => {
  if (outcome === 'won') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (outcome === 'lost' || outcome === 'withdrawn' || outcome === 'no_response') return 'border-red-700 bg-red-950/40 text-red-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}
const playbookFeedbackBadgeClass = (label?: PlaybookUsageEvent['feedback_label']) => {
  if (label === 'helpful') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (label === 'not_helpful') return 'border-red-700 bg-red-950/40 text-red-200'
  if (label === 'neutral') return 'border-zinc-600 bg-zinc-900 text-zinc-300'
  return 'border-zinc-800 bg-zinc-950 text-zinc-500'
}

export default function OpsHubModal({ isOpen = false, onClose, apiBase, onError, embedded = false }: OpsHubModalProps) {
  const [tab, setTab] = useState<OpsTab>('pipeline')
  const [data, setData] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [proposalBusy, setProposalBusy] = useState(false)
  const [proposalUseAiDraft, setProposalUseAiDraft] = useState(true)
  const [proposalPack, setProposalPack] = useState<ProposalPack | null>(null)
  const [proposalForTitle, setProposalForTitle] = useState('')

  const [pipelineFilter, setPipelineFilter] = useState<'all' | Stage>('all')
  const [decisionFilter, setDecisionFilter] = useState<'all' | DecisionStatus>('all')
  const [postFilter, setPostFilter] = useState<'all' | PostOutcome>('all')
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | ExecutionStatus>('all')

  const [targetWinRate, setTargetWinRate] = useState('25')
  const [targetHourly, setTargetHourly] = useState('85')
  const [scoreMinBudget, setScoreMinBudget] = useState('1000')
  const [scoreMinHourly, setScoreMinHourly] = useState('45')
  const [scoreMinHourlyException, setScoreMinHourlyException] = useState('50')
  const [scoreRejectThreshold, setScoreRejectThreshold] = useState('50')
  const [scorePreferredKeywords, setScorePreferredKeywords] = useState('')
  const [scoreRiskKeywords, setScoreRiskKeywords] = useState('')
  const [scoreHeavyPenaltyKeywords, setScoreHeavyPenaltyKeywords] = useState('')
  const [scoreRiskMarkerKeywords, setScoreRiskMarkerKeywords] = useState('')
  const [scoreToxicityKeywords, setScoreToxicityKeywords] = useState('')
  const [scoreHardRejectKeywords, setScoreHardRejectKeywords] = useState('')
  const [scoreSkipModelOnReject, setScoreSkipModelOnReject] = useState(true)
  const [scoreHardRejectOnLowBudget, setScoreHardRejectOnLowBudget] = useState(true)

  const [oppId, setOppId] = useState('')
  const [oppTitle, setOppTitle] = useState('')
  const [oppClient, setOppClient] = useState('')
  const [oppStage, setOppStage] = useState<Stage>('discovery')
  const [oppJobUrl, setOppJobUrl] = useState('')
  const [oppExpected, setOppExpected] = useState('')
  const [oppHours, setOppHours] = useState('')
  const [oppActual, setOppActual] = useState('')
  const [oppActualHours, setOppActualHours] = useState('')
  const [oppSummary, setOppSummary] = useState('')
  const [oppNotes, setOppNotes] = useState('')
  const [autofillText, setAutofillText] = useState('')
  const [autofillUrl, setAutofillUrl] = useState('')
  const [autofillBusy, setAutofillBusy] = useState(false)
  const [autofillFile, setAutofillFile] = useState<File | null>(null)
  const [autofillFileInputKey, setAutofillFileInputKey] = useState(0)
  const [autofillResult, setAutofillResult] = useState<OpportunityAutofill | null>(null)
  const [autofillGateSummary, setAutofillGateSummary] = useState('')

  const [decisionId, setDecisionId] = useState('')
  const [decisionSummary, setDecisionSummary] = useState('')
  const [decisionOptions, setDecisionOptions] = useState('')
  const [decisionChosen, setDecisionChosen] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')
  const [decisionImpact, setDecisionImpact] = useState('')
  const [decisionConfidence, setDecisionConfidence] = useState('70')
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatus>('active')

  const [postId, setPostId] = useState('')
  const [postOppId, setPostOppId] = useState('')
  const [postOutcome, setPostOutcome] = useState<PostOutcome>('lost')
  const [postFindings, setPostFindings] = useState('')
  const [postRoot, setPostRoot] = useState('')
  const [postTaxonomy, setPostTaxonomy] = useState('')
  const [postActions, setPostActions] = useState('')
  const [postWorked, setPostWorked] = useState('')

  const [bridgeOpportunityId, setBridgeOpportunityId] = useState('')

  const [projectId, setProjectId] = useState('')
  const [projectOpportunityId, setProjectOpportunityId] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [projectClient, setProjectClient] = useState('')
  const [projectStatus, setProjectStatus] = useState<ExecutionStatus>('planning')
  const [projectStartDate, setProjectStartDate] = useState('')
  const [projectDueDate, setProjectDueDate] = useState('')
  const [projectPlannedValue, setProjectPlannedValue] = useState('')
  const [projectActualValue, setProjectActualValue] = useState('')
  const [projectPlannedHours, setProjectPlannedHours] = useState('')
  const [projectActualHours, setProjectActualHours] = useState('')
  const [projectSummary, setProjectSummary] = useState('')
  const [projectRisks, setProjectRisks] = useState('')
  const [projectNextActions, setProjectNextActions] = useState('')
  const [projectMilestones, setProjectMilestones] = useState('')
  const [projectJobUrl, setProjectJobUrl] = useState('')

  const [reviewId, setReviewId] = useState('')
  const [reviewWeekStart, setReviewWeekStart] = useState('')
  const [reviewWins, setReviewWins] = useState('')
  const [reviewMisses, setReviewMisses] = useState('')
  const [reviewBottlenecks, setReviewBottlenecks] = useState('')
  const [reviewExperiments, setReviewExperiments] = useState('')
  const [reviewFocus, setReviewFocus] = useState('')
  const [reviewConfidence, setReviewConfidence] = useState('70')
  const [reviewLinkedProjects, setReviewLinkedProjects] = useState('')
  const [reviewSuggestBusy, setReviewSuggestBusy] = useState(false)
  const [reviewSuggestInfo, setReviewSuggestInfo] = useState('')

  const [playbookId, setPlaybookId] = useState('')
  const [playbookTitle, setPlaybookTitle] = useState('')
  const [playbookObjective, setPlaybookObjective] = useState('')
  const [playbookTriggers, setPlaybookTriggers] = useState('')
  const [playbookActions, setPlaybookActions] = useState('')
  const [playbookOfferTemplate, setPlaybookOfferTemplate] = useState('')
  const [playbookTags, setPlaybookTags] = useState('')
  const [playbookPriority, setPlaybookPriority] = useState('50')
  const [playbookActive, setPlaybookActive] = useState(true)
  const [playbookSuggestContext, setPlaybookSuggestContext] = useState('')
  const [playbookSuggestBusy, setPlaybookSuggestBusy] = useState(false)
  const [playbookSuggestions, setPlaybookSuggestions] = useState<PlaybookSuggestion[]>([])
  const [playbookSuggestMeta, setPlaybookSuggestMeta] = useState('')
  const [playbookUsageOpportunityId, setPlaybookUsageOpportunityId] = useState('')
  const [playbookUsageProjectId, setPlaybookUsageProjectId] = useState('')
  const [playbookUsageNotes, setPlaybookUsageNotes] = useState('')

  const applyData = (payload: OpsData) => {
    setData(payload)
    setTargetWinRate(String(payload.success_targets?.win_rate_min_percent ?? 25))
    setTargetHourly(String(payload.success_targets?.effective_hourly_min_usd ?? 85))
    const profile = payload.scoring_profile || {}
    const guardrails = profile.intake_guardrails || {}
    setScoreMinBudget(asInput(guardrails.min_budget_usd) || '1000')
    setScoreMinHourly(asInput(guardrails.min_hourly_usd) || '45')
    setScoreMinHourlyException(asInput(guardrails.min_hourly_exception_usd) || '50')
    setScoreRejectThreshold(asInput(guardrails.reject_score_threshold) || '50')
    setScorePreferredKeywords((profile.preferred_keywords || []).join(', '))
    setScoreRiskKeywords((profile.risk_keywords || []).join(', '))
    setScoreHeavyPenaltyKeywords((profile.heavy_penalty_keywords || []).join(', '))
    setScoreRiskMarkerKeywords((profile.risk_marker_keywords || []).join(', '))
    setScoreToxicityKeywords((profile.toxicity_keywords || []).join(', '))
    setScoreHardRejectKeywords((profile.hard_reject_keywords || []).join(', '))
    setScoreSkipModelOnReject(guardrails.skip_model_on_reject ?? true)
    setScoreHardRejectOnLowBudget(guardrails.hard_reject_on_low_budget ?? true)
  }

  const fetchOps = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/phase1`)
      const payload = (await res.json().catch(() => null)) as OpsData | null
      if (!res.ok || !payload) {
        onError(toErrorMessage(payload, 'Failed to load Ops Hub data'))
        return
      }
      applyData(payload)
      onError('')
    } catch {
      onError('Network error while loading Ops Hub data.')
    } finally {
      setLoading(false)
    }
  }

  const postJSON = async (path: string, body: Record<string, unknown>, fallback: string) => {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => null)) as OpsData | null
      if (!res.ok || !payload) {
        onError(toErrorMessage(payload, fallback))
        return false
      }
      applyData(payload)
      onError('')
      return true
    } catch {
      onError('Network error while saving Ops Hub data.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const resetOpportunity = () => {
    setOppId('')
    setOppTitle('')
    setOppClient('')
    setOppStage('discovery')
    setOppJobUrl('')
    setOppExpected('')
    setOppHours('')
    setOppActual('')
    setOppActualHours('')
    setOppSummary('')
    setOppNotes('')
    setAutofillFile(null)
    setAutofillFileInputKey(value => value + 1)
    setAutofillResult(null)
    setAutofillGateSummary('')
  }
  const resetDecision = () => {
    setDecisionId('')
    setDecisionSummary('')
    setDecisionOptions('')
    setDecisionChosen('')
    setDecisionRationale('')
    setDecisionImpact('')
    setDecisionConfidence('70')
    setDecisionStatus('active')
  }
  const resetPostmortem = () => {
    setPostId('')
    setPostOppId('')
    setPostOutcome('lost')
    setPostFindings('')
    setPostRoot('')
    setPostTaxonomy('')
    setPostActions('')
    setPostWorked('')
  }
  const resetExecutionProject = () => {
    setProjectId('')
    setProjectOpportunityId('')
    setProjectTitle('')
    setProjectClient('')
    setProjectStatus('planning')
    setProjectStartDate('')
    setProjectDueDate('')
    setProjectPlannedValue('')
    setProjectActualValue('')
    setProjectPlannedHours('')
    setProjectActualHours('')
    setProjectSummary('')
    setProjectRisks('')
    setProjectNextActions('')
    setProjectMilestones('')
    setProjectJobUrl('')
  }
  const resetWeeklyReview = () => {
    setReviewId('')
    setReviewWeekStart('')
    setReviewWins('')
    setReviewMisses('')
    setReviewBottlenecks('')
    setReviewExperiments('')
    setReviewFocus('')
    setReviewConfidence('70')
    setReviewLinkedProjects('')
    setReviewSuggestInfo('')
  }
  const resetPlaybook = () => {
    setPlaybookId('')
    setPlaybookTitle('')
    setPlaybookObjective('')
    setPlaybookTriggers('')
    setPlaybookActions('')
    setPlaybookOfferTemplate('')
    setPlaybookTags('')
    setPlaybookPriority('50')
    setPlaybookActive(true)
  }

  useEffect(() => {
    if (!embedded && !isOpen) return
    void fetchOps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, isOpen])

  const closedOps = useMemo(() => (data?.opportunities || []).filter(item => item.stage === 'won' || item.stage === 'lost'), [data])
  const wonOps = useMemo(() => (data?.opportunities || []).filter(item => item.stage === 'won'), [data])
  const pipelineBoard = useMemo(() => {
    if (!data?.pipeline_board) return []
    if (pipelineFilter === 'all') return data.pipeline_board
    return data.pipeline_board.filter(col => col.stage === pipelineFilter)
  }, [data, pipelineFilter])
  const decisions = useMemo(() => {
    if (!data?.decisions) return []
    if (decisionFilter === 'all') return data.decisions
    return data.decisions.filter(item => (item.status || 'active') === decisionFilter)
  }, [data, decisionFilter])
  const postmortems = useMemo(() => {
    if (!data?.postmortems) return []
    if (postFilter === 'all') return data.postmortems
    return data.postmortems.filter(item => item.outcome === postFilter)
  }, [data, postFilter])
  const executionProjects = useMemo(() => {
    const items = data?.execution_projects || []
    if (deliveryFilter === 'all') return items
    return items.filter(item => (item.status || 'planning') === deliveryFilter)
  }, [data, deliveryFilter])
  const weeklyReviews = useMemo(() => data?.weekly_reviews || [], [data])
  const playbooks = useMemo(() => data?.playbooks || [], [data])
  const playbookUsageEvents = useMemo(() => data?.playbook_usage_events || [], [data])
  const allOpportunities = useMemo(() => data?.opportunities || [], [data])
  const allExecutionProjects = useMemo(() => data?.execution_projects || [], [data])
  const topPerformingPlaybooks = useMemo(() => data?.playbook_summary?.top_performing_playbooks || [], [data])
  const playbookById = useMemo(() => {
    const map = new Map<string, Playbook>()
    playbooks.forEach(item => map.set(item.id, item))
    return map
  }, [playbooks])
  const opportunityById = useMemo(() => {
    const map = new Map<string, Opportunity>()
    allOpportunities.forEach(item => map.set(item.id, item))
    return map
  }, [allOpportunities])
  const projectById = useMemo(() => {
    const map = new Map<string, ExecutionProject>()
    allExecutionProjects.forEach(item => map.set(item.id, item))
    return map
  }, [allExecutionProjects])

  const saveTargets = async () => {
    void postJSON('/api/ops/targets', { effective_hourly_min_usd: targetHourly, win_rate_min_percent: targetWinRate }, 'Failed to update targets')
  }

  const createOpsBackup = async () => {
    setBackupBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/backup/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = (await res.json().catch(() => null)) as (OpsData & { created_backup?: { filename?: string } }) | null
      if (!res.ok || !payload) {
        onError(toErrorMessage(payload, 'Failed to create ops backup'))
        return
      }
      applyData(payload)
      const filename = payload.created_backup?.filename
      onError(filename ? `Backup created: ${filename}` : '')
    } catch {
      onError('Network error while creating backup.')
    } finally {
      setBackupBusy(false)
    }
  }

  const openBackupDir = async () => {
    try {
      const res = await fetch(`${apiBase}/api/ops/backup/open_dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(payload, 'Failed to open backup directory'))
        return
      }
      onError('')
    } catch {
      onError('Network error while opening backup directory.')
    }
  }

  const saveScoringProfile = async () => {
    void postJSON(
      '/api/ops/scoring/profile',
      {
        preferred_keywords: splitList(scorePreferredKeywords),
        risk_keywords: splitList(scoreRiskKeywords),
        heavy_penalty_keywords: splitList(scoreHeavyPenaltyKeywords),
        risk_marker_keywords: splitList(scoreRiskMarkerKeywords),
        toxicity_keywords: splitList(scoreToxicityKeywords),
        hard_reject_keywords: splitList(scoreHardRejectKeywords),
        intake_guardrails: {
          min_budget_usd: scoreMinBudget,
          min_hourly_usd: scoreMinHourly,
          min_hourly_exception_usd: scoreMinHourlyException,
          reject_score_threshold: scoreRejectThreshold,
          skip_model_on_reject: scoreSkipModelOnReject,
          hard_reject_on_low_budget: scoreHardRejectOnLowBudget,
        },
      },
      'Failed to update scoring profile',
    )
  }

  const saveOpportunity = async () => {
    if (!oppTitle.trim()) return
    const ok = await postJSON(
      '/api/ops/opportunity',
      {
        id: oppId || undefined,
        title: oppTitle,
        client: oppClient,
        stage: oppStage,
        job_url: oppJobUrl,
        expected_revenue_usd: oppExpected,
        estimated_hours: oppHours,
        actual_revenue_usd: oppActual,
        actual_hours: oppActualHours,
        summary: oppSummary,
        notes: oppNotes,
        platform: 'Upwork',
      },
      oppId ? 'Failed to update opportunity' : 'Failed to add opportunity',
    )
    if (ok) resetOpportunity()
  }

  const clearAutofillFile = () => {
    setAutofillFile(null)
    setAutofillFileInputKey(value => value + 1)
  }

  const applyOpportunityAutofill = (draft: OpportunityAutofill) => {
    if (draft.title) setOppTitle(draft.title)
    if (draft.client) setOppClient(draft.client)
    const stage = draft.stage as Stage | undefined
    if (stage && STAGES.includes(stage)) setOppStage(stage)
    if (draft.job_url) setOppJobUrl(draft.job_url)
    if (draft.expected_revenue_usd !== undefined && draft.expected_revenue_usd !== null) {
      setOppExpected(String(draft.expected_revenue_usd))
    }
    if (draft.estimated_hours !== undefined && draft.estimated_hours !== null) {
      setOppHours(String(draft.estimated_hours))
    }
    if (draft.summary) setOppSummary(draft.summary)
    if (draft.notes) setOppNotes(draft.notes)
  }

  const runOpportunityAutofill = async () => {
    if (!autofillText.trim() && !autofillUrl.trim() && !autofillFile) {
      onError('Provide text, URL, or file before auto-fill.')
      return
    }
    setAutofillBusy(true)
    setAutofillGateSummary('')
    try {
      const formData = new FormData()
      formData.append('source_text', autofillText)
      formData.append('source_url', autofillUrl)
      formData.append('stage_hint', oppStage)
      if (autofillFile) {
        formData.append('file', autofillFile)
      }
      const res = await fetch(`${apiBase}/api/ops/opportunity/autofill`, {
        method: 'POST',
        body: formData,
      })
      const payload = (await res.json().catch(() => null)) as OpportunityAutofillResponse | null
      if (!res.ok || !payload?.autofill) {
        onError(toErrorMessage(payload, 'Failed to auto-fill opportunity'))
        return
      }
      const draft = payload.autofill as OpportunityAutofill
      applyOpportunityAutofill(draft)
      if (!draft.job_url && autofillUrl.trim()) {
        setOppJobUrl(autofillUrl.trim())
      }
      setAutofillResult(draft)
      const gateStatus = payload.intake_gate?.status
      const gateReasons = payload.intake_gate?.reasons || []
      const skippedModelCall = payload.source_meta?.skipped_model_call
      const fallbackApplied = payload.source_meta?.fallback_applied
      if (gateStatus || gateReasons.length > 0 || skippedModelCall || fallbackApplied) {
        const statusText = gateStatus ? `Intake gate: ${gateStatus}` : 'Intake gate evaluated'
        const skippedText = skippedModelCall ? 'AI skipped' : 'AI used'
        const fallbackText = fallbackApplied ? ' | deterministic fallback used' : ''
        const reasonsText = gateReasons.length > 0 ? ` | ${gateReasons.slice(0, 2).join(' | ')}` : ''
        setAutofillGateSummary(`${statusText} (${skippedText})${fallbackText}${reasonsText}`)
      } else {
        setAutofillGateSummary('')
      }
      onError('')
    } catch {
      onError('Network error while auto-filling opportunity.')
    } finally {
      setAutofillBusy(false)
    }
  }

  const editOpportunity = (item: Opportunity) => {
    setOppId(item.id)
    setOppTitle(item.title || '')
    setOppClient(item.client || '')
    setOppStage(item.stage || 'discovery')
    setOppJobUrl(item.job_url || '')
    setOppExpected(asInput(item.expected_revenue_usd))
    setOppHours(asInput(item.estimated_hours))
    setOppActual(asInput(item.actual_revenue_usd))
    setOppActualHours(asInput(item.actual_hours))
    setOppSummary(item.summary || '')
    setOppNotes(item.notes || '')
    setAutofillResult(null)
  }

  const deleteOpportunity = async (id: string, title: string) => {
    if (!window.confirm(`Delete opportunity "${title}"?`)) return
    const ok = await postJSON('/api/ops/opportunity/delete', { id }, 'Failed to delete opportunity')
    if (ok && oppId === id) resetOpportunity()
  }

  const saveDecision = async () => {
    if (!decisionSummary.trim()) return
    const ok = await postJSON(
      '/api/ops/decision',
      {
        id: decisionId || undefined,
        summary: decisionSummary,
        options_considered: splitList(decisionOptions),
        chosen_option: decisionChosen,
        rationale: decisionRationale,
        expected_impact: decisionImpact,
        confidence_percent: decisionConfidence,
        status: decisionStatus,
      },
      decisionId ? 'Failed to update decision' : 'Failed to add decision',
    )
    if (ok) resetDecision()
  }

  const editDecision = (item: Decision) => {
    setDecisionId(item.id)
    setDecisionSummary(item.summary || '')
    setDecisionOptions((item.options_considered || []).join(', '))
    setDecisionChosen(item.chosen_option || '')
    setDecisionRationale(item.rationale || '')
    setDecisionImpact(item.expected_impact || '')
    setDecisionConfidence(asInput(item.confidence_percent) || '70')
    setDecisionStatus(item.status || 'active')
  }

  const deleteDecision = async (id: string, summary: string) => {
    if (!window.confirm(`Delete decision "${summary}"?`)) return
    const ok = await postJSON('/api/ops/decision/delete', { id }, 'Failed to delete decision')
    if (ok && decisionId === id) resetDecision()
  }

  const savePostmortem = async () => {
    if (!postFindings.trim()) return
    const ok = await postJSON(
      '/api/ops/postmortem',
      {
        id: postId || undefined,
        opportunity_id: postOppId,
        outcome: postOutcome,
        findings: postFindings,
        root_causes: splitList(postRoot),
        taxonomy_tags: splitList(postTaxonomy),
        action_items: splitList(postActions),
        what_worked: postWorked,
      },
      postId ? 'Failed to update postmortem' : 'Failed to add postmortem',
    )
    if (ok) resetPostmortem()
  }

  const editPostmortem = (item: Postmortem) => {
    setPostId(item.id)
    setPostOppId(item.opportunity_id || '')
    setPostOutcome(item.outcome || 'lost')
    setPostFindings(item.findings || '')
    setPostRoot((item.root_causes || []).join(', '))
    setPostTaxonomy((item.taxonomy_tags || []).join(', '))
    setPostActions((item.action_items || []).join(', '))
    setPostWorked(item.what_worked || '')
  }

  const deletePostmortem = async (id: string) => {
    if (!window.confirm('Delete this postmortem?')) return
    const ok = await postJSON('/api/ops/postmortem/delete', { id }, 'Failed to delete postmortem')
    if (ok && postId === id) resetPostmortem()
  }

  const bridgeWonOpportunity = async () => {
    if (!bridgeOpportunityId) return
    const ok = await postJSON(
      '/api/ops/execution_bridge/from_opportunity',
      { opportunity_id: bridgeOpportunityId },
      'Failed to bridge won opportunity into execution',
    )
    if (ok) {
      setBridgeOpportunityId('')
    }
  }

  const saveExecutionProject = async () => {
    if (!projectTitle.trim()) return
    const ok = await postJSON(
      '/api/ops/execution_project',
      {
        id: projectId || undefined,
        opportunity_id: projectOpportunityId,
        title: projectTitle,
        client: projectClient,
        status: projectStatus,
        start_date: projectStartDate,
        due_date: projectDueDate,
        planned_value_usd: projectPlannedValue,
        actual_value_usd: projectActualValue,
        planned_hours: projectPlannedHours,
        actual_hours: projectActualHours,
        summary: projectSummary,
        job_url: projectJobUrl,
        risks: splitList(projectRisks),
        next_actions: splitList(projectNextActions),
        milestones: parseMilestonesInput(projectMilestones),
      },
      projectId ? 'Failed to update execution project' : 'Failed to add execution project',
    )
    if (ok) resetExecutionProject()
  }

  const editExecutionProject = (item: ExecutionProject) => {
    setProjectId(item.id)
    setProjectOpportunityId(item.opportunity_id || '')
    setProjectTitle(item.title || '')
    setProjectClient(item.client || '')
    setProjectStatus(item.status || 'planning')
    setProjectStartDate(item.start_date || '')
    setProjectDueDate(item.due_date || '')
    setProjectPlannedValue(asInput(item.planned_value_usd))
    setProjectActualValue(asInput(item.actual_value_usd))
    setProjectPlannedHours(asInput(item.planned_hours))
    setProjectActualHours(asInput(item.actual_hours))
    setProjectSummary(item.summary || '')
    setProjectJobUrl(item.job_url || '')
    setProjectRisks((item.risks || []).join(', '))
    setProjectNextActions((item.next_actions || []).join(', '))
    setProjectMilestones((item.milestones || []).map(milestoneToLine).join('\n'))
  }

  const deleteExecutionProject = async (id: string, title: string) => {
    if (!window.confirm(`Delete execution project "${title}"?`)) return
    const ok = await postJSON('/api/ops/execution_project/delete', { id }, 'Failed to delete execution project')
    if (ok && projectId === id) resetExecutionProject()
  }

  const saveWeeklyReview = async () => {
    const ok = await postJSON(
      '/api/ops/weekly_review',
      {
        id: reviewId || undefined,
        week_start_date: reviewWeekStart,
        wins: splitList(reviewWins),
        misses: splitList(reviewMisses),
        bottlenecks: splitList(reviewBottlenecks),
        experiments: splitList(reviewExperiments),
        focus_next_week: splitList(reviewFocus),
        confidence_percent: reviewConfidence,
        linked_project_ids: splitList(reviewLinkedProjects),
      },
      reviewId ? 'Failed to update weekly review' : 'Failed to save weekly review',
    )
    if (ok) resetWeeklyReview()
  }

  const suggestWeeklyReview = async () => {
    setReviewSuggestBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/weekly_review/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: reviewWeekStart || undefined,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.suggestion) {
        onError(toErrorMessage(payload, 'Failed to auto-generate weekly review'))
        return
      }

      const suggestion = payload.suggestion as WeeklyReviewSuggestion
      if (suggestion.week_start_date) setReviewWeekStart(suggestion.week_start_date)
      setReviewWins((suggestion.wins || []).join(', '))
      setReviewMisses((suggestion.misses || []).join(', '))
      setReviewBottlenecks((suggestion.bottlenecks || []).join(', '))
      setReviewExperiments((suggestion.experiments || []).join(', '))
      setReviewFocus((suggestion.focus_next_week || []).join(', '))
      if (suggestion.confidence_percent !== undefined && suggestion.confidence_percent !== null) {
        setReviewConfidence(String(suggestion.confidence_percent))
      }
      setReviewLinkedProjects((suggestion.linked_project_ids || []).join(', '))

      const signals = suggestion.source_signals || {}
      setReviewSuggestInfo(
        `Projects: ${signals.projects_considered ?? 0}, blocked: ${signals.blocked_projects ?? 0}, at-risk: ${signals.at_risk_projects ?? 0}, overdue milestones: ${signals.overdue_milestones ?? 0}`,
      )
      onError('')
    } catch {
      onError('Network error while generating weekly review.')
    } finally {
      setReviewSuggestBusy(false)
    }
  }

  const editWeeklyReview = (item: WeeklyReview) => {
    setReviewId(item.id)
    setReviewWeekStart(item.week_start_date || '')
    setReviewWins((item.wins || []).join(', '))
    setReviewMisses((item.misses || []).join(', '))
    setReviewBottlenecks((item.bottlenecks || []).join(', '))
    setReviewExperiments((item.experiments || []).join(', '))
    setReviewFocus((item.focus_next_week || []).join(', '))
    setReviewConfidence(asInput(item.confidence_percent) || '70')
    setReviewLinkedProjects((item.linked_project_ids || []).join(', '))
    setReviewSuggestInfo('')
  }

  const deleteWeeklyReview = async (id: string) => {
    if (!window.confirm('Delete this weekly review?')) return
    const ok = await postJSON('/api/ops/weekly_review/delete', { id }, 'Failed to delete weekly review')
    if (ok && reviewId === id) resetWeeklyReview()
  }

  const savePlaybook = async () => {
    if (!playbookTitle.trim()) {
      onError('Название playbook is required.')
      return
    }
    const ok = await postJSON(
      '/api/ops/playbook',
      {
        id: playbookId || undefined,
        title: playbookTitle,
        objective: playbookObjective,
        trigger_keywords: splitList(playbookTriggers),
        actions: splitLines(playbookActions),
        offer_template: playbookOfferTemplate,
        tags: splitList(playbookTags),
        priority: playbookPriority,
        active: playbookActive,
      },
      playbookId ? 'Failed to update playbook' : 'Failed to save playbook',
    )
    if (ok) resetPlaybook()
  }

  const editPlaybook = (item: Playbook) => {
    setPlaybookId(item.id)
    setPlaybookTitle(item.title || '')
    setPlaybookObjective(item.objective || '')
    setPlaybookTriggers((item.trigger_keywords || []).join(', '))
    setPlaybookActions((item.actions || []).join('\n'))
    setPlaybookOfferTemplate(item.offer_template || '')
    setPlaybookTags((item.tags || []).join(', '))
    setPlaybookPriority(asInput(item.priority) || '50')
    setPlaybookActive(item.active ?? true)
  }

  const deletePlaybook = async (id: string, title: string) => {
    if (!window.confirm(`Delete playbook "${title}"?`)) return
    const ok = await postJSON('/api/ops/playbook/delete', { id }, 'Failed to delete playbook')
    if (ok && playbookId === id) resetPlaybook()
  }

  const deletePlaybookUsageEvent = async (id: string) => {
    if (!window.confirm('Delete this usage event?')) return
    await postJSON('/api/ops/playbook/usage/delete', { id }, 'Failed to delete playbook usage event')
  }

  const updatePlaybookUsageFeedback = async (id: string, feedbackScore: -1 | 0 | 1) => {
    const note = window.prompt('Optional feedback note (why this was helpful/not helpful):', '') ?? ''
    await postJSON(
      '/api/ops/playbook/usage/feedback',
      {
        id,
        feedback_score: feedbackScore,
        feedback_note: note,
      },
      'Failed to update playbook feedback',
    )
  }

  const markPlaybookUsed = async (id: string, matchedTriggers: string[] = []) => {
    await postJSON(
      '/api/ops/playbook/mark_used',
      {
        id,
        opportunity_id: playbookUsageOpportunityId || undefined,
        project_id: playbookUsageProjectId || undefined,
        notes: playbookUsageNotes || undefined,
        matched_triggers: matchedTriggers,
        source: 'ops_hub',
      },
      'Failed to mark playbook usage',
    )
  }

  const suggestPlaybooks = async () => {
    setPlaybookSuggestBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/playbook/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_text: playbookSuggestContext,
          opportunity_id: playbookUsageOpportunityId || undefined,
          project_id: playbookUsageProjectId || undefined,
          limit: 8,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.suggestions) {
        onError(toErrorMessage(payload, 'Failed to suggest playbooks'))
        return
      }
      setPlaybookSuggestions(payload.suggestions as PlaybookSuggestion[])
      const meta = payload.context_meta || {}
      setPlaybookSuggestMeta(
        `Playbooks checked: ${meta.playbooks_considered ?? 0}, adaptive profiles: ${meta.adaptive_profiles ?? 0}, context chars: ${meta.context_chars ?? 0}, scoped context: ${meta.used_context_text ? 'yes' : 'no'}`,
      )
      onError('')
    } catch {
      onError('Network error while suggesting playbooks.')
    } finally {
      setPlaybookSuggestBusy(false)
    }
  }

  const buildProposalPack = async (opportunity: Opportunity) => {
    setProposalBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/ops/proposal_pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opportunity.id,
          include_ai_draft: proposalUseAiDraft,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.pack) {
        onError(toErrorMessage(payload, 'Failed to build proposal pack'))
        return
      }
      setProposalPack(payload.pack as ProposalPack)
      setProposalForTitle(opportunity.title || '')
      onError('')
    } catch {
      onError('Network error while building proposal pack.')
    } finally {
      setProposalBusy(false)
    }
  }

  const copyProposalPack = async () => {
    if (!proposalPack) return
    const playbookLines = (proposalPack.playbook_recommendations || []).flatMap(item => {
      const head = item.title || 'Playbook'
      const score = item.score !== undefined && item.score !== null ? `score ${item.score}` : 'score -'
      const triggers = (item.matched_triggers || []).join(', ') || 'n/a'
      const firstAction = (item.actions || [])[0] || 'n/a'
      return [`- ${head} (${score})`, `  triggers: ${triggers}`, `  action: ${firstAction}`]
    })
    const output = [
      `Proposal Pack v2: ${proposalForTitle || proposalPack.opportunity?.title || ''}`,
      '',
      `Score: ${proposalPack.score_summary?.score_v1 ?? '-'} (${proposalPack.score_summary?.recommendation || '-'})`,
      `Estimated hourly: ${usd(proposalPack.score_summary?.estimated_hourly_usd)}`,
      '',
      'Why this project:',
      ...(proposalPack.why_this_project || []).map(item => `- ${item}`),
      '',
      'Proof points:',
      ...(proposalPack.proof_points || []).map(item => `- ${item}`),
      '',
      'Risk flags:',
      ...(proposalPack.risk_flags || []).map(item => `- ${item}`),
      '',
      'Questions for client:',
      ...(proposalPack.questions_for_client || []).map(item => `- ${item}`),
      '',
      'Scope assumptions:',
      ...(proposalPack.scope_assumptions || []).map(item => `- ${item}`),
      '',
      'Negotiation plan:',
      ...(proposalPack.negotiation_plan || []).map(item => `- ${item}`),
      '',
      'Playbook recommendations:',
      ...(playbookLines.length > 0 ? playbookLines : ['- (none)']),
      '',
      'Cover letter draft:',
      proposalPack.cover_letter_draft || '(not generated)',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(output)
      onError('')
    } catch {
      onError('Failed to copy proposal pack to clipboard.')
    }
  }

  if (!embedded && !isOpen) return null

  const shell = (
      <div className={`relative w-full ${embedded ? 'h-full rounded-none border-0 shadow-none' : 'h-[90vh] max-w-[1500px] rounded-2xl border border-zinc-800 shadow-2xl'} bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden`}>
        <header className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/95">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm md:text-base font-semibold tracking-tight">Операционный Центр</h2>
            <div className="flex gap-2">
              <button onClick={fetchOps} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs md:text-sm">Обновить</button>
              {!embedded && (
                <button onClick={() => onClose?.()} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs md:text-sm">Закрыть</button>
              )}
            </div>
          </div>
        </header>
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/70">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Открытые</div>
              <div className="text-lg font-semibold mt-1">{data?.metrics?.open_opportunity_count ?? '-'}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Закрытые</div>
              <div className="text-lg font-semibold mt-1">{data?.metrics?.closed_opportunity_count ?? '-'}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Процент Побед</div>
              <div className="text-lg font-semibold mt-1">{data?.metrics ? `${data.metrics.win_rate_percent}%` : '-'}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Эфф./Ч Реализ.</div>
              <div className="text-lg font-semibold mt-1">{usd(data?.metrics?.effective_hourly_realized_usd)}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Эфф./Ч Воронка</div>
              <div className="text-lg font-semibold mt-1">{usd(data?.metrics?.effective_hourly_estimated_pipeline_usd)}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">Цели</div>
              <div className="mt-1 text-xs text-zinc-300">Цель Win rate: {data?.metrics?.target_checks?.win_rate_target_percent ?? '-'}%</div>
              <div className="text-xs text-zinc-300">Цель Эфф./Ч: {usd(data?.metrics?.target_checks?.effective_hourly_target_usd ?? null)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-zinc-200">Главный Воркфлоу</div>
                  <div className="text-[11px] text-zinc-500">Воронка - Proposal - Playbooks - Delivery. Продвинутые настройки вынесены во вкладку «Настройки».</div>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setTab('pipeline')} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">Открыть Воронку</button>
                <button onClick={() => setTab('playbooks')} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">Открыть Playbooks</button>
                <button onClick={() => setTab('delivery')} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">Открыть Delivery</button>
                <button onClick={() => setTab('settings')} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-xs">Настройки</button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-3 border-b border-zinc-800 bg-zinc-950">
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 gap-1">
            <button onClick={() => setTab('pipeline')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'pipeline' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Воронка</button>
            <button onClick={() => setTab('decisions')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'decisions' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Решения</button>
            <button onClick={() => setTab('postmortem')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'postmortem' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Разбор</button>
            <button onClick={() => setTab('playbooks')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'playbooks' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Playbooks</button>
            <button onClick={() => setTab('delivery')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'delivery' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Исполнение</button>
            <button onClick={() => setTab('settings')} className={`px-3 py-1.5 text-xs md:text-sm rounded-md ${tab === 'settings' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}>Настройки</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-center text-sm text-zinc-400">Загружаю данные Ops Hub...</div>
          )}

          {!loading && !data && (
            <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <div>Не удалось загрузить данные Ops Hub.</div>
              <button
                onClick={fetchOps}
                className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs md:text-sm"
              >
                Повторить загрузку
              </button>
            </div>
          )}

          {!loading && data && tab === 'pipeline' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{oppId ? 'Редактировать opportunity' : 'Новая opportunity'}</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={proposalUseAiDraft}
                        onChange={e => setProposalUseAiDraft(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900"
                      />
                      AI-черновик
                    </label>
                    <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value as 'all' | Stage)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                      <option value="all">Все стадии</option>
                      {STAGES.map(stage => (
                        <option key={stage} value={stage}>{LABEL_STAGE[stage]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">Автозаполнение из вакансии</div>
                      <div className="text-[11px] text-zinc-500">Вставь текст вакансии, URL или приложи скриншот/PDF.</div>
                    </div>
                    <button
                      onClick={runOpportunityAutofill}
                      disabled={autofillBusy || (!autofillText.trim() && !autofillUrl.trim() && !autofillFile)}
                      className="h-8 px-3 rounded-md border border-blue-900/40 bg-blue-950/30 hover:bg-blue-900/30 text-blue-200 text-xs disabled:opacity-60"
                    >
                      {autofillBusy ? 'Заполняю...' : 'Автозаполнить карточку'}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <FieldLabel label="URL вакансии">
                      <input
                        value={autofillUrl}
                        onChange={e => setAutofillUrl(e.target.value)}
                        placeholder="URL вакансии (опционально)"
                        className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500"
                      />
                    </FieldLabel>
                    <FieldLabel label="Вложение" className="md:col-span-2">
                      <div className="flex items-center gap-2">
                        <input
                          key={autofillFileInputKey}
                          type="file"
                          onChange={e => setAutofillFile(e.target.files?.[0] || null)}
                          className="flex-1 text-xs text-zinc-300 file:mr-2 file:h-8 file:px-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 file:text-xs hover:file:bg-zinc-800"
                        />
                        {autofillFile && (
                          <button onClick={clearAutofillFile} className="h-8 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">
                            Убрать
                          </button>
                        )}
                      </div>
                    </FieldLabel>
                    <FieldLabel label="Текст вакансии / бриф" className="md:col-span-3">
                      <textarea
                        value={autofillText}
                        onChange={e => setAutofillText(e.target.value)}
                        placeholder="Вставь текст вакансии / бриф клиента..."
                        className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-zinc-500 resize-none"
                      />
                    </FieldLabel>
                  </div>
                  {autofillResult && (
                    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[11px] text-zinc-400">
                      <span className="text-zinc-300">Уверенность:</span> {autofillResult.confidence_percent ?? '-'}%
                      <span className="ml-3 text-zinc-300">Пустые поля:</span> {autofillResult.missing_fields?.join(', ') || 'нет'}
                      <span className="ml-3 text-zinc-300">Сигналы:</span> {autofillResult.signals?.join(', ') || 'н/д'}
                      {autofillGateSummary && <div className="mt-1 text-zinc-500">{autofillGateSummary}</div>}
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FieldLabel label="Название вакансии">
                    <input value={oppTitle} onChange={e => setOppTitle(e.target.value)} placeholder="Название / заголовок вакансии" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Клиент">
                    <input value={oppClient} onChange={e => setOppClient(e.target.value)} placeholder="Клиент" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Стадия">
                    <select value={oppStage} onChange={e => setOppStage(e.target.value as Stage)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                      {STAGES.map(stage => (
                        <option key={stage} value={stage}>{LABEL_STAGE[stage]}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="URL вакансии">
                    <input value={oppJobUrl} onChange={e => setOppJobUrl(e.target.value)} placeholder="URL вакансии" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Ожидаемая выручка (USD)">
                    <input value={oppExpected} onChange={e => setOppExpected(e.target.value)} placeholder="Ожидаемая выручка (USD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Оценка часов">
                    <input value={oppHours} onChange={e => setOppHours(e.target.value)} placeholder="Оценка часов" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Краткое описание">
                    <input value={oppSummary} onChange={e => setOppSummary(e.target.value)} placeholder="Краткое описание" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Фактическая выручка (USD)">
                    <input value={oppActual} onChange={e => setOppActual(e.target.value)} placeholder="Фактическая выручка (USD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Фактические часы">
                    <input value={oppActualHours} onChange={e => setOppActualHours(e.target.value)} placeholder="Фактические часы" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Заметки" className="md:col-span-2">
                    <input value={oppNotes} onChange={e => setOppNotes(e.target.value)} placeholder="Заметки" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <div className="md:col-span-1 flex justify-end gap-2 items-end">
                    {oppId && <button onClick={resetOpportunity} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                    <button onClick={saveOpportunity} disabled={saving || !oppTitle.trim()} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{oppId ? 'Обновить opportunity' : 'Добавить opportunity'}</button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="flex gap-3 min-w-max pb-2">
                  {pipelineBoard.map(column => (
                    <div key={column.stage} className="w-[320px] rounded-xl border border-zinc-800 bg-zinc-900/60">
                      <div className="px-3 py-2 border-b border-zinc-800">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold">{LABEL_STAGE[column.stage]}</h4>
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{column.count}</span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">Ожидаемо: {usd(column.expected_revenue_usd)}</div>
                      </div>
                      <div className="p-2 flex flex-col gap-2 max-h-[460px] overflow-y-auto">
                        {column.items.map(item => (
                          <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-medium">{item.title}</div>
                              <div className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${scoreBadgeClass(item.score_recommendation)}`}>
                                {item.score_v1 ?? '-'} | {scoreLabel(item.score_recommendation)}
                              </div>
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">{item.client || 'Неизвестный клиент'} | {item.platform || 'Upwork'}</div>
                            <div className="text-xs text-zinc-400 mt-1">Ожидаемо: {usd(item.expected_revenue_usd)} | Оцен. {item.estimated_hours ?? '-'}h</div>
                            {(item.estimated_hourly_usd !== undefined && item.estimated_hourly_usd !== null) && (
                              <div className="text-xs text-zinc-500 mt-1">Оцен. ставка: {usd(item.estimated_hourly_usd)}</div>
                            )}
                            {(item.actual_revenue_usd !== undefined && item.actual_revenue_usd !== null) && (
                              <div className="text-xs text-zinc-500 mt-1">Факт: {usd(item.actual_revenue_usd)} | {item.actual_hours ?? '-'}h</div>
                            )}
                            {item.summary && <div className="text-xs text-zinc-300 mt-2">{item.summary}</div>}
                            {item.score_rationale && item.score_rationale.length > 0 && (
                              <div className="text-[11px] text-zinc-500 mt-2 leading-snug">
                                {item.score_rationale.slice(0, 2).map((line, idx) => (
                                  <div key={idx}>{line}</div>
                                ))}
                              </div>
                            )}
                            {item.intake_gate_status === 'reject' && (
                              <div className="mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1 text-[11px] text-red-200">
                                Intake Gate: отклонено
                                {item.intake_gate_reasons && item.intake_gate_reasons.length > 0
                                  ? ` | ${item.intake_gate_reasons.slice(0, 2).join(' | ')}`
                                  : ''}
                              </div>
                            )}
                            {(item.intake_score !== undefined && item.intake_score !== null) && (
                              <div className="mt-1 text-[11px] text-zinc-400">
                                Оценка intake: {item.intake_score}
                              </div>
                            )}
                            {(item.hard_reject_hits && item.hard_reject_hits.length > 0) && (
                              <div className="mt-1 text-[11px] text-red-300">
                                Маркеры жёсткого отказа: {item.hard_reject_hits.slice(0, 3).join(', ')}
                              </div>
                            )}
                            {(item.heavy_penalty_hits && item.heavy_penalty_hits.length > 0) && (
                              <div className="mt-1 text-[11px] text-amber-300">
                                Маркеры сильного штрафа: {item.heavy_penalty_hits.slice(0, 3).join(', ')}
                              </div>
                            )}
                            {(item.risk_marker_hits && item.risk_marker_hits.length > 0) && (
                              <div className="mt-1 text-[11px] text-zinc-400">
                                Маркеры риска: {item.risk_marker_hits.slice(0, 3).join(', ')}
                              </div>
                            )}
                            {(item.toxicity_hits && item.toxicity_hits.length > 0) && (
                              <div className="mt-1 text-[11px] text-amber-300">
                                Маркеры токсичности: {item.toxicity_hits.slice(0, 3).join(', ')}
                              </div>
                            )}
                            <div className="mt-2">
                              <select
                                value={item.stage}
                                onChange={e => void postJSON('/api/ops/opportunity/stage', { id: item.id, stage: e.target.value }, 'Failed to move opportunity')}
                                className="w-full h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs outline-none focus:border-zinc-500"
                              >
                                {STAGES.map(stage => (
                                  <option key={stage} value={stage}>{LABEL_STAGE[stage]}</option>
                                ))}
                              </select>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button onClick={() => editOpportunity(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                              <button onClick={() => void deleteOpportunity(item.id, item.title)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                            </div>
                            <div className="mt-2">
                              <button
                                onClick={() => void buildProposalPack(item)}
                                disabled={proposalBusy}
                                className="h-7 w-full rounded border border-blue-900/40 bg-blue-950/30 hover:bg-blue-900/30 text-blue-200 text-[11px] disabled:opacity-60"
                              >
                                {proposalBusy && proposalPack?.opportunity_id === item.id ? 'Собираю Pack...' : 'Собрать Pack v2'}
                              </button>
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-2">Обновлено: {shortDate(item.updated_at)}</div>
                          </div>
                        ))}
                        {column.items.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">Нет карточек на этой стадии</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Proposal Pack v2</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={copyProposalPack} disabled={!proposalPack} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs disabled:opacity-50">Копировать</button>
                    <button onClick={() => setProposalPack(null)} disabled={!proposalPack} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs disabled:opacity-50">Очистить</button>
                  </div>
                </div>
                {!proposalPack && (
                  <div className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center text-xs text-zinc-500">
                    Выбери opportunity и нажми <span className="text-zinc-300">Собрать Pack v2</span>.
                  </div>
                )}
                {proposalPack && (
                  <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Opportunity</div>
                      <div className="text-sm text-zinc-200 mt-1">{proposalPack.opportunity?.title || proposalForTitle}</div>
                      <div className="text-zinc-400 mt-1">{proposalPack.opportunity?.client || 'Неизвестный клиент'} | {proposalPack.opportunity?.stage || '-'}</div>
                      <div className="text-zinc-500 mt-1">Score: {proposalPack.score_summary?.score_v1 ?? '-'} ({proposalPack.score_summary?.recommendation || '-'})</div>
                      <div className="text-zinc-500">Оцен. ставка: {usd(proposalPack.score_summary?.estimated_hourly_usd)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Почему этот проект</div>
                      <div className="mt-1 flex flex-col gap-1">
                        {(proposalPack.why_this_project || []).map((item, idx) => (
                          <div key={idx} className="text-zinc-300">- {item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Доказательства</div>
                      <div className="mt-1 flex flex-col gap-1">
                        {(proposalPack.proof_points || []).map((item, idx) => (
                          <div key={idx} className="text-zinc-300">- {item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Риски и вопросы</div>
                      <div className="mt-1 text-zinc-300">
                        {(proposalPack.risk_flags || []).slice(0, 3).map((item, idx) => (
                          <div key={`risk-${idx}`}>- {item}</div>
                        ))}
                      </div>
                      <div className="mt-2 text-zinc-400 uppercase tracking-wide text-[10px]">Вопросы клиенту</div>
                      <div className="mt-1 text-zinc-300">
                        {(proposalPack.questions_for_client || []).slice(0, 4).map((item, idx) => (
                          <div key={`q-${idx}`}>- {item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Рекомендации playbook</div>
                      <div className="mt-1 flex flex-col gap-2">
                        {(proposalPack.playbook_recommendations || []).slice(0, 3).map((item, idx) => (
                          <div key={`pb-rec-${idx}`} className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                            <div className="text-zinc-200">{item.title || 'Playbook'}</div>
                            <div className="text-zinc-500 text-[11px]">
                              балл {item.score ?? '-'} | WR {item.historical_win_rate_percent ?? '-'}% | Eff/H {usd(item.historical_effective_hourly_usd)}
                            </div>
                            {(item.matched_triggers || []).length > 0 && (
                              <div className="text-zinc-400 text-[11px] mt-1">
                                Триггеры: {(item.matched_triggers || []).join(', ')}
                              </div>
                            )}
                            {(item.actions || []).length > 0 && (
                              <div className="text-zinc-300 text-[11px] mt-1">Действие: {(item.actions || [])[0]}</div>
                            )}
                          </div>
                        ))}
                        {(proposalPack.playbook_recommendations || []).length === 0 && (
                          <div className="text-zinc-500">Для этого контекста рекомендаций playbook нет.</div>
                        )}
                      </div>
                    </div>
                    <div className="xl:col-span-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="text-zinc-400 uppercase tracking-wide text-[10px]">Черновик cover letter</div>
                      {proposalPack.draft_error && <div className="text-amber-300 mt-1">{proposalPack.draft_error}</div>}
                      <div className="mt-2 whitespace-pre-wrap text-zinc-200 leading-relaxed">
                        {proposalPack.cover_letter_draft || 'Draft not generated. Enable AI-черновик and build again.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && data && tab === 'decisions' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{decisionId ? 'Редактировать решение' : 'Новое решение'}</h3>
                  <select value={decisionFilter} onChange={e => setDecisionFilter(e.target.value as 'all' | DecisionStatus)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                    <option value="all">Все статусы</option>
                    {DECISION_STATUSES.map(status => (
                      <option key={status} value={status}>{LABEL_DECISION[status]}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <FieldLabel label="Краткое описание решения">
                    <input value={decisionSummary} onChange={e => setDecisionSummary(e.target.value)} placeholder="Суть решения" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Рассмотренные варианты">
                    <textarea value={decisionOptions} onChange={e => setDecisionOptions(e.target.value)} placeholder="Рассмотренные варианты (запятая/новая строка)" className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <FieldLabel label="Выбранный вариант">
                    <input value={decisionChosen} onChange={e => setDecisionChosen(e.target.value)} placeholder="Выбранный вариант" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Обоснование">
                    <textarea value={decisionRationale} onChange={e => setDecisionRationale(e.target.value)} placeholder="Обоснование" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <FieldLabel label="Ожидаемый эффект">
                    <input value={decisionImpact} onChange={e => setDecisionImpact(e.target.value)} placeholder="Ожидаемый эффект" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Уверенность (%)">
                    <input value={decisionConfidence} onChange={e => setDecisionConfidence(e.target.value)} placeholder="Уверенность %" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Статус решения">
                    <select value={decisionStatus} onChange={e => setDecisionStatus(e.target.value as DecisionStatus)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                      {DECISION_STATUSES.map(status => (
                        <option key={status} value={status}>{LABEL_DECISION[status]}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  <div className="flex justify-end gap-2">
                    {decisionId && <button onClick={resetDecision} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                    <button onClick={saveDecision} disabled={saving || !decisionSummary.trim()} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{decisionId ? 'Обновить решение' : 'Сохранить решение'}</button>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-medium mb-3">Журнал решений</h3>
                <div className="max-h-[560px] overflow-y-auto flex flex-col gap-2 pr-1">
                  {decisions.map(item => (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{item.summary}</div>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{LABEL_DECISION[item.status || 'active']}</span>
                      </div>
                      {item.chosen_option && <div className="text-xs text-zinc-300 mt-2">Выбрано: {item.chosen_option}</div>}
                      {item.rationale && <div className="text-xs text-zinc-400 mt-1">{item.rationale}</div>}
                      {item.expected_impact && <div className="text-xs text-zinc-400 mt-1">Эффект: {item.expected_impact}</div>}
                      {item.options_considered && item.options_considered.length > 0 && <div className="text-xs text-zinc-500 mt-2">Варианты: {item.options_considered.join(' | ')}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button onClick={() => editDecision(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                        <button onClick={() => void deleteDecision(item.id, item.summary)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-2">Обновлено: {shortDate(item.updated_at)}</div>
                    </div>
                  ))}
                  {decisions.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">Нет решений для этого фильтра</div>}
                </div>
              </div>
            </div>
          )}

          {!loading && data && tab === 'postmortem' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{postId ? 'Редактировать postmortem' : 'Ручной postmortem'}</h3>
                  <select value={postFilter} onChange={e => setPostFilter(e.target.value as 'all' | PostOutcome)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                    <option value="all">Все исходы</option>
                    {OUTCOMES.map(outcome => (
                      <option key={outcome} value={outcome}>{LABEL_OUTCOME[outcome]}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <FieldLabel label="Связанная opportunity">
                    <select value={postOppId} onChange={e => setPostOppId(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                      <option value="">Выбери закрытую opportunity (опционально)</option>
                      {closedOps.map(item => (
                        <option key={item.id} value={item.id}>{item.title}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Исход">
                    <select value={postOutcome} onChange={e => setPostOutcome(e.target.value as PostOutcome)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                      {OUTCOMES.map(outcome => (
                        <option key={outcome} value={outcome}>{LABEL_OUTCOME[outcome]}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Ключевые выводы">
                    <textarea value={postFindings} onChange={e => setPostFindings(e.target.value)} placeholder="Ключевые выводы" className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <FieldLabel label="Корневые причины">
                    <textarea value={postRoot} onChange={e => setPostRoot(e.target.value)} placeholder="Корневые причины (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <FieldLabel label="Теги таксономии">
                    <input value={postTaxonomy} onChange={e => setPostTaxonomy(e.target.value)} placeholder="Теги таксономии (запятая/новая строка)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </FieldLabel>
                  <FieldLabel label="Action items">
                    <textarea value={postActions} onChange={e => setPostActions(e.target.value)} placeholder="Следующие действия (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <FieldLabel label="Что сработало">
                    <textarea value={postWorked} onChange={e => setPostWorked(e.target.value)} placeholder="Что сработало" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  <div className="flex justify-end gap-2">
                    {postId && <button onClick={resetPostmortem} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                    <button onClick={savePostmortem} disabled={saving || !postFindings.trim()} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{postId ? 'Обновить postmortem' : 'Сохранить postmortem'}</button>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-medium mb-3">Журнал postmortem</h3>
                <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                  <div className="text-zinc-400">Покрытие таксономии: {data?.outcome_taxonomy_summary?.coverage_percent ?? 0}% ({data?.outcome_taxonomy_summary?.tagged_postmortems ?? 0}/{data?.outcome_taxonomy_summary?.total_postmortems ?? 0})</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(data?.outcome_taxonomy_summary?.top_tags || []).slice(0, 6).map(tag => (
                      <span key={tag.tag} className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300">
                        {tag.name}: {tag.count}
                      </span>
                    ))}
                    {(!data?.outcome_taxonomy_summary?.top_tags || data.outcome_taxonomy_summary.top_tags.length === 0) && (
                      <span className="text-zinc-500">Пока нет данных таксономии</span>
                    )}
                  </div>
                </div>
                <div className="max-h-[560px] overflow-y-auto flex flex-col gap-2 pr-1">
                  {postmortems.map(item => (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{LABEL_OUTCOME[item.outcome]}</span>
                        <span className="text-[11px] text-zinc-500">{shortDate(item.updated_at)}</span>
                      </div>
                      <div className="text-sm text-zinc-200 mt-2">{item.findings}</div>
                      {item.root_causes && item.root_causes.length > 0 && <div className="text-xs text-zinc-400 mt-2">Корневые причины: {item.root_causes.join(' | ')}</div>}
                      {item.taxonomy_tags && item.taxonomy_tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.taxonomy_tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.action_items && item.action_items.length > 0 && <div className="text-xs text-zinc-400 mt-1">Действия: {item.action_items.join(' | ')}</div>}
                      {item.what_worked && <div className="text-xs text-zinc-500 mt-1">Сработало: {item.what_worked}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button onClick={() => editPostmortem(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                        <button onClick={() => void deletePostmortem(item.id)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                      </div>
                    </div>
                  ))}
                  {postmortems.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">Нет postmortem для этого фильтра</div>}
                </div>
              </div>
            </div>
          )}

          {!loading && data && tab === 'playbooks' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Всего playbook</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.total_playbooks ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Активные</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.active_playbooks ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Сработали сейчас</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.triggered_now_count ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Использования</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.total_usage_count ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">События использования</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.usage_events_count ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Позитивный фидбек</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.feedback_positive_count ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Негативный фидбек</div>
                  <div className="text-lg font-semibold mt-1">{data.playbook_summary?.feedback_negative_count ?? 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="text-sm font-medium">{playbookId ? 'Редактировать playbook' : 'Новый playbook'}</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <FieldLabel label="Название playbook">
                      <input value={playbookTitle} onChange={e => setPlaybookTitle(e.target.value)} placeholder="Название playbook" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Цель">
                      <input value={playbookObjective} onChange={e => setPlaybookObjective(e.target.value)} placeholder="Цель" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Ключевые триггеры">
                      <textarea value={playbookTriggers} onChange={e => setPlaybookTriggers(e.target.value)} placeholder="Ключевые триггеры (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Действия">
                      <textarea value={playbookActions} onChange={e => setPlaybookActions(e.target.value)} placeholder="Действия (по одному в строке)" className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Шаблон оффера / скрипт переговоров">
                      <textarea value={playbookOfferTemplate} onChange={e => setPlaybookOfferTemplate(e.target.value)} placeholder="Шаблон оффера / скрипт переговоров" className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Теги">
                      <input value={playbookTags} onChange={e => setPlaybookTags(e.target.value)} placeholder="Теги (запятая/новая строка)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FieldLabel label="Приоритет">
                        <input value={playbookPriority} onChange={e => setPlaybookPriority(e.target.value)} placeholder="Приоритет (0-100)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                      </FieldLabel>
                      <FieldLabel label="Статус">
                        <label className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300 flex items-center gap-2">
                          <input type="checkbox" checked={playbookActive} onChange={e => setPlaybookActive(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900" />
                          Активен
                        </label>
                      </FieldLabel>
                    </div>
                    <div className="flex justify-end gap-2">
                      {playbookId && <button onClick={resetPlaybook} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                      <button onClick={savePlaybook} disabled={saving || !playbookTitle.trim()} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{playbookId ? 'Обновить playbook' : 'Сохранить playbook'}</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">Триггерный слой</h3>
                    <button onClick={suggestPlaybooks} disabled={playbookSuggestBusy} className="h-8 px-3 rounded-md border border-blue-900/40 bg-blue-950/30 hover:bg-blue-900/30 text-blue-200 text-xs disabled:opacity-60">
                      {playbookSuggestBusy ? 'Анализирую...' : 'Подобрать playbook'}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <FieldLabel label="Связанная opportunity">
                      <select value={playbookUsageOpportunityId} onChange={e => setPlaybookUsageOpportunityId(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                        <option value="">Связать с opportunity (опционально)</option>
                        {allOpportunities.map(item => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label="Связанный проект">
                      <select value={playbookUsageProjectId} onChange={e => setPlaybookUsageProjectId(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                        <option value="">Связать с проектом (опционально)</option>
                        {allExecutionProjects.map(item => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </FieldLabel>
                  </div>
                  <FieldLabel label="Заметка по использованию" className="mt-2">
                    <input
                      value={playbookUsageNotes}
                      onChange={e => setPlaybookUsageNotes(e.target.value)}
                      placeholder="Заметка по использованию (опционально)"
                      className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500"
                    />
                  </FieldLabel>
                  <FieldLabel label="Контекст для рекомендаций" className="mt-3">
                    <textarea value={playbookSuggestContext} onChange={e => setPlaybookSuggestContext(e.target.value)} placeholder="Доп. контекст (сообщение клиента, фрагмент вакансии, текущая проблема)." className="h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                  </FieldLabel>
                  {playbookSuggestMeta && (
                    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
                      {playbookSuggestMeta}
                    </div>
                  )}
                  <div className="mt-3 max-h-[460px] overflow-y-auto flex flex-col gap-2 pr-1">
                    {playbookSuggestions.map(item => (
                      <div key={`${item.playbook_id}-${item.score}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-zinc-200">{item.title}</div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-900/40 bg-blue-950/30 text-blue-200">
                            балл {item.score ?? '-'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          База: {item.base_score ?? '-'} | Адаптив: {item.adaptive_delta ?? 0} | Истор. Win rate: {item.historical_win_rate_percent ?? '-'}% | Истор. Eff/H: {usd(item.historical_effective_hourly_usd)} | Истор. FB: {item.historical_feedback_score ?? '-'}
                        </div>
                        {item.objective && <div className="text-xs text-zinc-400 mt-1">{item.objective}</div>}
                        {(item.matched_triggers || []).length > 0 && (
                          <div className="text-xs text-amber-300 mt-2">Триггеры: {(item.matched_triggers || []).join(' | ')}</div>
                        )}
                        {(item.actions || []).length > 0 && (
                          <div className="text-xs text-zinc-300 mt-2">
                            {(item.actions || []).slice(0, 3).map((action, idx) => (
                              <div key={`${item.playbook_id}-a-${idx}`}>- {action}</div>
                            ))}
                          </div>
                        )}
                        {item.offer_template && <div className="text-xs text-zinc-500 mt-2">{item.offer_template}</div>}
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => void markPlaybookUsed(item.playbook_id, item.matched_triggers || [])} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">
                            Отметить использованным
                          </button>
                        </div>
                      </div>
                    ))}
                    {playbookSuggestions.length === 0 && (
                      <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">
                        Нажми «Подобрать playbook», чтобы получить рекомендации.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="text-sm font-medium mb-3">Лучшие playbook</h3>
                  <div className="max-h-[320px] overflow-y-auto flex flex-col gap-2 pr-1">
                    {topPerformingPlaybooks.map(item => (
                      <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-zinc-200">{item.title}</div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300">
                            {item.usage_events ?? 0} событий
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">
                          Win rate: {item.win_rate_percent ?? '-'}% | Eff/H: {usd(item.effective_hourly_usd)} | Выручка: {usd(item.revenue_total_usd)}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Выиграно: {item.won_events ?? 0} | Проиграно: {item.lost_events ?? 0} | В ожидании: {item.pending_events ?? 0} | FB: {item.avg_feedback_score ?? '-'}
                        </div>
                      </div>
                    ))}
                    {topPerformingPlaybooks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">
                        Пока нет данных по эффективности.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="text-sm font-medium mb-3">События использования</h3>
                  <div className="max-h-[320px] overflow-y-auto flex flex-col gap-2 pr-1">
                    {playbookUsageEvents.map(event => {
                      const playbook = playbookById.get(event.playbook_id)
                      const opp = opportunityById.get(event.opportunity_id || '')
                      const project = projectById.get(event.project_id || '')
                      return (
                        <div key={event.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-zinc-200">{playbook?.title || event.playbook_id}</div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${playbookOutcomeBadgeClass(event.outcome)}`}>
                                {event.outcome || 'в ожидании'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${playbookFeedbackBadgeClass(event.feedback_label)}`}>
                                {event.feedback_label || 'без фидбека'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-400">
                            Opportunity: {opp?.title || '-'} | Проект: {project?.title || '-'}
                          </div>
                          {(event.matched_triggers || []).length > 0 && (
                            <div className="mt-1 text-[11px] text-amber-300">
                              Триггеры: {(event.matched_triggers || []).slice(0, 6).join(' | ')}
                            </div>
                          )}
                          {event.notes && <div className="mt-1 text-[11px] text-zinc-300">{event.notes}</div>}
                          {event.feedback_note && <div className="mt-1 text-[11px] text-zinc-400">Фидбек: {event.feedback_note}</div>}
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Выручка: {usd(event.realized_revenue_usd)} | Часы: {event.realized_hours ?? '-'} | Eff/H: {usd(event.effective_hourly_usd)}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-zinc-500">Обновлено: {shortDate(event.updated_at || event.created_at)}</div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => void updatePlaybookUsageFeedback(event.id, 1)} className="h-7 px-2 rounded border border-emerald-900/50 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-200 text-[11px]">
                                Полезно
                              </button>
                              <button onClick={() => void updatePlaybookUsageFeedback(event.id, -1)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">
                                Не полезно
                              </button>
                              <button onClick={() => void deletePlaybookUsageEvent(event.id)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px]">
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {playbookUsageEvents.length === 0 && (
                      <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">
                        No usage событий yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-medium mb-3">Библиотека playbook</h3>
                <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2 pr-1">
                  {playbooks.map(item => (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{item.title}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${item.active ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>
                          {item.active ? 'active' : 'paused'}
                        </span>
                      </div>
                      {item.objective && <div className="text-xs text-zinc-400 mt-1">{item.objective}</div>}
                      <div className="text-xs text-zinc-500 mt-1">
                        Приоритет: {item.priority ?? '-'} | Использований: {item.usage_count ?? 0}
                      </div>
                      {(item.trigger_keywords || []).length > 0 && (
                        <div className="text-xs text-amber-300 mt-1">
                          Триггеры: {(item.trigger_keywords || []).slice(0, 6).join(', ')}
                        </div>
                      )}
                      {(item.actions || []).length > 0 && (
                        <div className="text-xs text-zinc-300 mt-2">
                          {(item.actions || []).slice(0, 3).map((action, idx) => (
                            <div key={`${item.id}-act-${idx}`}>- {action}</div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button onClick={() => editPlaybook(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                        <button onClick={() => void deletePlaybook(item.id, item.title)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-2">Обновлено: {shortDate(item.updated_at)} | Последнее использование: {shortDate(item.last_used_at)}</div>
                    </div>
                  ))}
                  {playbooks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">
                      Пока нет playbook.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && data && tab === 'settings' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Целевые Пороги</h3>
                    <div className="text-xs text-zinc-500 mt-1">Базовые пороги эффективности. Лучше менять не чаще раза в неделю.</div>
                  </div>
                  <button onClick={saveTargets} disabled={saving} className="h-9 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">
                    Сохранить Цели
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Цель Win Rate (%)</span>
                    <input value={targetWinRate} onChange={e => setTargetWinRate(e.target.value)} placeholder="Целевой Win rate %" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Цель Эффективной Ставки ($/ч)</span>
                    <input value={targetHourly} onChange={e => setTargetHourly(e.target.value)} placeholder="Целевой Eff/H (USD)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Резервные Копии</h3>
                    <div className="text-xs text-zinc-500 mt-1">
                      Всего бэкапов: {data.backup_summary?.total_backups ?? 0} | Последний: {shortDate(data.backup_summary?.latest_backup_at)}
                    </div>
                    {(data.backup_summary?.items || []).length > 0 && (
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Последний файл: {(data.backup_summary?.items || [])[0]?.filename} ({bytesLabel((data.backup_summary?.items || [])[0]?.size_bytes ?? 0)})
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={openBackupDir} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">
                      Открыть Папку
                    </button>
                    <button onClick={createOpsBackup} disabled={backupBusy} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-xs disabled:opacity-60">
                      {backupBusy ? 'Создание...' : 'Создать Бэкап'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Скоринг-движок v{data.scoring_profile?.version ?? 2}</h3>
                    <div className="text-xs text-zinc-500 mt-1">Основные intake-пороги. Продвинутые ключевые слова спрятаны в раскрывающемся блоке.</div>
                  </div>
                  <button onClick={saveScoringProfile} disabled={saving} className="h-9 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">
                    Сохранить Скоринг v2
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Мин. фиксированный бюджет ($)</span>
                    <input value={scoreMinBudget} onChange={e => setScoreMinBudget(e.target.value)} placeholder="Мин. фиксированный бюджет (USD)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Мин. почасовая ставка ($/ч)</span>
                    <input value={scoreMinHourly} onChange={e => setScoreMinHourly(e.target.value)} placeholder="Мин. ставка (USD/ч)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Порог исключения по ставке ($/ч)</span>
                    <input value={scoreMinHourlyException} onChange={e => setScoreMinHourlyException(e.target.value)} placeholder="Исключение ставки (USD/ч)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-zinc-400">Порог отклонения (score)</span>
                    <input value={scoreRejectThreshold} onChange={e => setScoreRejectThreshold(e.target.value)} placeholder="Порог отклонения (score)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                  </label>
                  <label className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300 flex items-center gap-2">
                    <input type="checkbox" checked={scoreSkipModelOnReject} onChange={e => setScoreSkipModelOnReject(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900" />
                    Пропускать AI при reject
                  </label>
                  <label className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300 flex items-center gap-2">
                    <input type="checkbox" checked={scoreHardRejectOnLowBudget} onChange={e => setScoreHardRejectOnLowBudget(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900" />
                    Жесткий reject low-budget
                  </label>
                </div>
                <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <summary className="cursor-pointer text-xs text-zinc-300">Продвинутые Ключевые Правила</summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Предпочтительные ключевые слова</span>
                      <input value={scorePreferredKeywords} onChange={e => setScorePreferredKeywords(e.target.value)} placeholder="Предпочтительные ключевые слова (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Ключевые слова риска</span>
                      <input value={scoreRiskKeywords} onChange={e => setScoreRiskKeywords(e.target.value)} placeholder="Ключевые слова риска (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Слова сильного штрафа</span>
                      <input value={scoreHeavyPenaltyKeywords} onChange={e => setScoreHeavyPenaltyKeywords(e.target.value)} placeholder="Слова сильного штрафа (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Слова риск-маркеров</span>
                      <input value={scoreRiskMarkerKeywords} onChange={e => setScoreRiskMarkerKeywords(e.target.value)} placeholder="Слова риск-маркеров (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Маркеры токсичности</span>
                      <input value={scoreToxicityKeywords} onChange={e => setScoreToxicityKeywords(e.target.value)} placeholder="Маркеры токсичности (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-zinc-400">Маркеры жёсткого отказа</span>
                      <input value={scoreHardRejectKeywords} onChange={e => setScoreHardRejectKeywords(e.target.value)} placeholder="Маркеры жёсткого отказа (comma/new line)" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500" />
                    </label>
                  </div>
                </details>
              </div>
            </div>
          )}

          {!loading && data && tab === 'delivery' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Активные проекты</div>
                  <div className="text-lg font-semibold mt-1">{data.delivery_intelligence?.active_projects ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Блокеры</div>
                  <div className="text-lg font-semibold mt-1">{data.delivery_intelligence?.blocked_projects ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Просроченные майлстоуны</div>
                  <div className="text-lg font-semibold mt-1">{data.delivery_intelligence?.overdue_milestones ?? 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Выполнение майлстоунов</div>
                  <div className="text-lg font-semibold mt-1">{data.delivery_intelligence?.milestone_completion_rate_percent ?? 0}%</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Delivery Eff/H</div>
                  <div className="text-lg font-semibold mt-1">{usd(data.delivery_intelligence?.delivery_effective_hourly_usd)}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Недельная уверенность</div>
                  <div className="text-lg font-semibold mt-1">{data.weekly_feedback_summary?.average_confidence_percent ?? '-'}%</div>
                </div>
              </div>
              <div className={`rounded-xl border p-3 text-xs ${data.delivery_intelligence?.effective_hourly_alert ? 'border-red-900/50 bg-red-950/30 text-red-200' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300'}`}>
                <div>
                  Целевой Delivery Eff/H: {usd(data.delivery_intelligence?.target_hourly_usd ?? null)} | Проекты со scope creep: {data.delivery_intelligence?.scope_creep_projects ?? 0} | Проекты в красной зоне коммуникации: {data.delivery_intelligence?.communication_red_zone_projects ?? 0}
                </div>
                {(data.delivery_intelligence?.top_toxicity_markers || []).length > 0 && (
                  <div className="mt-1 text-zinc-400">
                    Топ маркеров токсичности: {(data.delivery_intelligence?.top_toxicity_markers || []).slice(0, 4).map(item => `${item.marker} (${item.count})`).join(', ')}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Мост к исполнению</h3>
                    <div className="text-xs text-zinc-500 mt-1">Создай delivery-карточку напрямую из выигранной opportunity.</div>
                  </div>
                  <div className="flex items-end gap-2">
                    <FieldLabel label="Выигранная opportunity" className="min-w-[280px]">
                      <select value={bridgeOpportunityId} onChange={e => setBridgeOpportunityId(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                        <option value="">Выбери выигранную opportunity</option>
                        {wonOps.map(item => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <button onClick={bridgeWonOpportunity} disabled={saving || !bridgeOpportunityId} className="h-9 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-xs disabled:opacity-60">Создать bridge</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">{projectId ? 'Редактировать проект исполнения' : 'Новый проект исполнения'}</h3>
                    <select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value as 'all' | ExecutionStatus)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-500">
                      <option value="all">Все статусы</option>
                      {EXECUTION_STATUSES.map(status => (
                        <option key={status} value={status}>{LABEL_EXECUTION_STATUS[status]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FieldLabel label="Связанная opportunity">
                      <select value={projectOpportunityId} onChange={e => setProjectOpportunityId(e.target.value)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                        <option value="">Связать с выигранной opportunity (опционально)</option>
                        {wonOps.map(item => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label="Статус проекта">
                      <select value={projectStatus} onChange={e => setProjectStatus(e.target.value as ExecutionStatus)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500">
                        {EXECUTION_STATUSES.map(status => (
                          <option key={status} value={status}>{LABEL_EXECUTION_STATUS[status]}</option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label="Название проекта" className="md:col-span-2">
                      <input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="Название проекта" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Клиент">
                      <input value={projectClient} onChange={e => setProjectClient(e.target.value)} placeholder="Клиент" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="URL вакансии">
                      <input value={projectJobUrl} onChange={e => setProjectJobUrl(e.target.value)} placeholder="URL вакансии" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Дата старта">
                      <input value={projectStartDate} onChange={e => setProjectStartDate(e.target.value)} placeholder="Дата старта (YYYY-MM-DD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Дедлайн">
                      <input value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} placeholder="Дедлайн (YYYY-MM-DD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Плановая стоимость (USD)">
                      <input value={projectPlannedValue} onChange={e => setProjectPlannedValue(e.target.value)} placeholder="Плановая стоимость (USD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Фактическая стоимость (USD)">
                      <input value={projectActualValue} onChange={e => setProjectActualValue(e.target.value)} placeholder="Фактическая стоимость (USD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Плановые часы">
                      <input value={projectPlannedHours} onChange={e => setProjectPlannedHours(e.target.value)} placeholder="Плановые часы" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Фактические часы">
                      <input value={projectActualHours} onChange={e => setProjectActualHours(e.target.value)} placeholder="Фактические часы" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Краткое описание" className="md:col-span-2">
                      <textarea value={projectSummary} onChange={e => setProjectSummary(e.target.value)} placeholder="Краткое описание / delivery context" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Риски">
                      <textarea value={projectRisks} onChange={e => setProjectRisks(e.target.value)} placeholder="Риски (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Следующие шаги">
                      <textarea value={projectNextActions} onChange={e => setProjectNextActions(e.target.value)} placeholder="Следующие шаги (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Майлстоуны" className="md:col-span-2">
                      <textarea value={projectMilestones} onChange={e => setProjectMilestones(e.target.value)} placeholder={'Майлстоуны (по одному в строке)\nФормат: title | status | YYYY-MM-DD'} className="h-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <div className="md:col-span-2 flex justify-end gap-2">
                      {projectId && <button onClick={resetExecutionProject} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                      <button onClick={saveExecutionProject} disabled={saving || !projectTitle.trim()} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{projectId ? 'Обновить проект' : 'Сохранить проект'}</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="text-sm font-medium mb-3">Проекты исполнения</h3>
                  <div className="max-h-[680px] overflow-y-auto flex flex-col gap-2 pr-1">
                    {executionProjects.map(item => (
                      <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{item.title}</div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${executionStatusClass(item.status)}`}>
                            {LABEL_EXECUTION_STATUS[item.status || 'planning']}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">{item.client || 'Неизвестный клиент'} | Прогресс: {item.progress_percent ?? 0}%</div>
                        <div className="text-xs text-zinc-500 mt-1">Дедлайн: {item.due_date || '-'} | Eff/H: {usd((item.actual_value_usd && item.actual_hours && item.actual_hours > 0) ? (item.actual_value_usd / item.actual_hours) : null)}</div>
                        {item.summary && <div className="text-xs text-zinc-300 mt-2">{item.summary}</div>}
                        {item.risks && item.risks.length > 0 && <div className="text-xs text-zinc-500 mt-2">Риски: {item.risks.join(' | ')}</div>}
                        {item.next_actions && item.next_actions.length > 0 && <div className="text-xs text-zinc-400 mt-1">Дальше: {item.next_actions.join(' | ')}</div>}
                        {item.milestones && item.milestones.length > 0 && (
                          <div className="mt-2 text-[11px] text-zinc-500">
                            {item.milestones.slice(0, 4).map(ms => (
                              <div key={ms.id || `${item.id}-${ms.title}`}>- {ms.title} [{ms.status || 'todo'}]{ms.due_date ? ` @ ${ms.due_date}` : ''}</div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button onClick={() => editExecutionProject(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                          <button onClick={() => void deleteExecutionProject(item.id, item.title)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-2">Обновлено: {shortDate(item.updated_at)}</div>
                      </div>
                    ))}
                    {executionProjects.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">Нет проектов исполнения для этого фильтра</div>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">Еженедельный feedback loop</h3>
                    <button
                      onClick={suggestWeeklyReview}
                      disabled={reviewSuggestBusy}
                      className="h-8 px-3 rounded-md border border-blue-900/40 bg-blue-950/30 hover:bg-blue-900/30 text-blue-200 text-xs disabled:opacity-60"
                    >
                      {reviewSuggestBusy ? 'Генерирую...' : 'Автогенерация'}
                    </button>
                  </div>
                  {reviewSuggestInfo && (
                    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
                      {reviewSuggestInfo}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <FieldLabel label="Дата начала недели">
                      <input value={reviewWeekStart} onChange={e => setReviewWeekStart(e.target.value)} placeholder="Дата начала недели (YYYY-MM-DD)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="Победы">
                      <textarea value={reviewWins} onChange={e => setReviewWins(e.target.value)} placeholder="Победы (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Промахи">
                      <textarea value={reviewMisses} onChange={e => setReviewMisses(e.target.value)} placeholder="Промахи (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Бутылочные горлышки">
                      <textarea value={reviewBottlenecks} onChange={e => setReviewBottlenecks(e.target.value)} placeholder="Бутылочные горлышки (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Эксперименты">
                      <textarea value={reviewExperiments} onChange={e => setReviewExperiments(e.target.value)} placeholder="Эксперименты (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Фокус следующей недели">
                      <textarea value={reviewFocus} onChange={e => setReviewFocus(e.target.value)} placeholder="Фокус на следующую неделю (запятая/новая строка)" className="h-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 resize-none" />
                    </FieldLabel>
                    <FieldLabel label="Уверенность (%)">
                      <input value={reviewConfidence} onChange={e => setReviewConfidence(e.target.value)} placeholder="Уверенность %" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <FieldLabel label="ID связанных проектов">
                      <input value={reviewLinkedProjects} onChange={e => setReviewLinkedProjects(e.target.value)} placeholder="ID связанных проектов (запятая/новая строка)" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-zinc-500" />
                    </FieldLabel>
                    <div className="flex justify-end gap-2">
                      {reviewId && <button onClick={resetWeeklyReview} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm">Отмена редактирования</button>}
                      <button onClick={saveWeeklyReview} disabled={saving} className="h-10 px-4 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 hover:bg-white text-sm disabled:opacity-60">{reviewId ? 'Обновить weekly review' : 'Сохранить weekly review'}</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="text-sm font-medium mb-3">Журнал weekly review</h3>
                  <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                    <div className="text-zinc-400">Обзоров: {data.weekly_feedback_summary?.total_reviews ?? 0}</div>
                    <div className="text-zinc-400 mt-1">Средняя уверенность: {data.weekly_feedback_summary?.average_confidence_percent ?? '-'}%</div>
                    <div className="text-zinc-400 mt-1">Дельта импульса: {data.weekly_feedback_summary?.momentum_delta_percent ?? '-'}%</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(data.weekly_feedback_summary?.top_bottlenecks || []).slice(0, 5).map(item => (
                        <span key={item.label} className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300">
                          {item.label}: {item.count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto flex flex-col gap-2 pr-1">
                    {weeklyReviews.map(item => (
                      <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{item.week_start_date || 'Еженедельный обзор'}</div>
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{item.confidence_percent ?? '-'}%</span>
                        </div>
                        {item.wins && item.wins.length > 0 && <div className="text-xs text-zinc-300 mt-2">Победы: {item.wins.join(' | ')}</div>}
                        {item.misses && item.misses.length > 0 && <div className="text-xs text-zinc-400 mt-1">Промахи: {item.misses.join(' | ')}</div>}
                        {item.bottlenecks && item.bottlenecks.length > 0 && <div className="text-xs text-zinc-500 mt-1">Бутылочные горлышки: {item.bottlenecks.join(' | ')}</div>}
                        {item.focus_next_week && item.focus_next_week.length > 0 && <div className="text-xs text-zinc-400 mt-1">Следующий фокус: {item.focus_next_week.join(' | ')}</div>}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button onClick={() => editWeeklyReview(item)} className="h-7 px-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px]">Изменить</button>
                          <button onClick={() => void deleteWeeklyReview(item.id)} className="h-7 px-2 rounded border border-red-900/50 bg-red-950/40 hover:bg-red-900/40 text-red-200 text-[11px]">Удалить</button>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-2">Обновлено: {shortDate(item.updated_at)}</div>
                      </div>
                    ))}
                    {weeklyReviews.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-500 text-center">Пока нет weekly review</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  )

  if (embedded) {
    return <div className="h-full w-full">{shell}</div>
  }

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center p-3 md:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onClose?.()} />
      {shell}
    </div>
  )
}































