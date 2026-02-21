import { useState } from 'react'

interface Milestone {
   label?: string
   due_date?: string
}

interface DraftExecutionProjectPayload {
   opportunity_id?: string
   title?: string
   client?: string
   milestones?: Milestone[]
   planned_hours?: number
   planned_revenue_usd?: number
}

interface DraftExecutionProjectCardProps {
   payload: DraftExecutionProjectPayload
   apiBase: string
   onRequestRevision?: (text: string) => void
}

const usd = (v?: number | null) =>
   v === undefined || v === null ? '-' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function DraftExecutionProjectCard({ payload, apiBase, onRequestRevision }: DraftExecutionProjectCardProps) {
   const [status, setStatus] = useState<'draft' | 'saving' | 'done' | 'cancelled'>('draft')
   const [error, setError] = useState('')
   const [isRevising, setIsRevising] = useState(false)
   const [revisionText, setRevisionText] = useState('')

   const handleConfirm = async () => {
      setStatus('saving')
      setError('')
      try {
         const res = await fetch(`${apiBase}/api/ops/execution_project`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               title: payload.title || 'New Project',
               client: payload.client || '',
               opportunity_id: payload.opportunity_id || '',
               status: 'active',
               milestones: (payload.milestones || []).map((m, i) => ({
                  id: `ms-${i + 1}`,
                  label: m.label || `Milestone ${i + 1}`,
                  due_date: m.due_date || '',
                  status: 'pending',
               })),
               planned_hours: payload.planned_hours || null,
               planned_revenue_usd: payload.planned_revenue_usd || null,
            }),
         })
         if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.detail || `HTTP ${res.status}`)
         }
         setStatus('done')
         window.dispatchEvent(new Event('ops-data-changed'))
      } catch (e) {
         setError(e instanceof Error ? e.message : 'Ошибка')
         setStatus('draft')
      }
   }

   if (status === 'done') {
      return (
         <div className="my-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-300">
               <span className="text-lg">✅</span>
               <span className="text-sm font-medium">Проект создан: {payload.title}</span>
            </div>
         </div>
      )
   }

   if (status === 'cancelled') {
      return (
         <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-500">
               <span className="text-lg">❌</span>
               <span className="text-sm">Отменено: проект {payload.title}</span>
            </div>
         </div>
      )
   }

   return (
      <div className="my-2 rounded-lg border border-cyan-800/60 bg-cyan-950/20 px-4 py-3">
         <div className="flex items-center gap-2 text-cyan-300 mb-2">
            <span className="text-lg">🚀</span>
            <span className="text-sm font-semibold">Новый проект (черновик)</span>
         </div>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-2">
            <div>
               <span className="text-zinc-500 text-[11px]">Проект</span>
               <div className="text-zinc-200 font-medium">{payload.title || '-'}</div>
            </div>
            {payload.client && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Клиент</span>
                  <div className="text-zinc-200">{payload.client}</div>
               </div>
            )}
            <div>
               <span className="text-zinc-500 text-[11px]">Бюджет</span>
               <div className="text-zinc-200">{usd(payload.planned_revenue_usd)}</div>
            </div>
            <div>
               <span className="text-zinc-500 text-[11px]">Часы</span>
               <div className="text-zinc-200">{payload.planned_hours ?? '-'} ч</div>
            </div>
         </div>
         {payload.milestones && payload.milestones.length > 0 && (
            <div className="mb-2">
               <div className="text-[11px] text-zinc-500 mb-1">Майлстоуны</div>
               <div className="flex flex-col gap-1">
                  {payload.milestones.map((m, i) => (
                     <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-200">{m.label}</span>
                        {m.due_date && <span className="text-zinc-500">до {m.due_date}</span>}
                     </div>
                  ))}
               </div>
            </div>
         )}
         {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
         <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={handleConfirm} disabled={status === 'saving'} className="h-8 px-4 rounded-md border border-sky-700 bg-sky-900/60 hover:bg-sky-800/60 text-xs text-sky-200 font-medium disabled:opacity-60">
               {status === 'saving' ? 'Создаю...' : '✓ Создать проект'}
            </button>
            <button onClick={() => setStatus('cancelled')} disabled={status === 'saving'} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 disabled:opacity-60">
               Отменить
            </button>
            {onRequestRevision && (
               <button
                  onClick={() => setIsRevising(!isRevising)}
                  disabled={status === 'saving'}
                  className="h-8 px-3 rounded-md border border-sky-800 bg-sky-900/40 hover:bg-sky-800/60 text-xs text-sky-300 transition-colors disabled:opacity-60"
               >
                  Внести правки
               </button>
            )}
         </div>

         {isRevising && onRequestRevision && (
            <div className="mt-3 border-t border-sky-800/30 pt-3">
               <textarea
                  value={revisionText}
                  onChange={e => setRevisionText(e.target.value)}
                  placeholder="Что нужно исправить в проекте?"
                  className="w-full text-xs bg-black/40 border border-zinc-800 rounded-md p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-700 resize-none min-h-[60px]"
               />
               <div className="mt-2 flex justify-end">
                  <button
                     onClick={() => {
                        if (revisionText.trim()) {
                           onRequestRevision(`Правка execution-проекта для "${payload.title}": ${revisionText.trim()}`)
                           setIsRevising(false)
                           setRevisionText('')
                        }
                     }}
                     disabled={!revisionText.trim()}
                     className="h-7 px-3 rounded bg-sky-800 hover:bg-sky-700 text-xs font-medium text-sky-100 transition-colors disabled:opacity-50"
                  >
                     Отправить правки
                  </button>
               </div>
            </div>
         )}
      </div>
   )
}
