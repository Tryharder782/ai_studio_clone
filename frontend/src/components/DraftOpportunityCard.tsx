import { useState } from 'react'

interface DraftOpportunityPayload {
   title?: string
   client?: string
   url?: string
   estimated_revenue?: number
   estimated_hours?: number
   actual_revenue?: number
   actual_hours?: number
   summary?: string
   stage?: string
   notes?: string
   platform?: string
}

const STAGE_LABEL: Record<string, string> = {
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

interface DraftOpportunityCardProps {
   payload: DraftOpportunityPayload
   apiBase: string
   onRequestRevision?: (text: string) => void
}

const usd = (v?: number | null) =>
   v === undefined || v === null ? '-' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function DraftOpportunityCard({ payload, apiBase, onRequestRevision }: DraftOpportunityCardProps) {
   const [status, setStatus] = useState<'draft' | 'creating' | 'created' | 'cancelled'>('draft')
   const [error, setError] = useState('')
   const [isRevising, setIsRevising] = useState(false)
   const [revisionText, setRevisionText] = useState('')

   const effHourly =
      payload.estimated_revenue && payload.estimated_hours && payload.estimated_hours > 0
         ? Math.round(payload.estimated_revenue / payload.estimated_hours)
         : null

   const handleConfirm = async () => {
      setStatus('creating')
      setError('')
      try {
         const res = await fetch(`${apiBase}/api/ops/opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               title: payload.title || 'Imported opportunity',
               client: payload.client || '',
               stage: payload.stage || 'discovery',
               job_url: payload.url || '',
               expected_revenue_usd: payload.estimated_revenue || null,
               estimated_hours: payload.estimated_hours || null,
               actual_revenue_usd: payload.actual_revenue || null,
               actual_hours: payload.actual_hours || null,
               summary: payload.summary || '',
               notes: payload.notes || 'Создано через Draft & Confirm из чата',
               platform: payload.platform || 'Upwork',
            }),
         })
         if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.detail || `HTTP ${res.status}`)
         }
         setStatus('created')
         window.dispatchEvent(new Event('ops-data-changed'))
      } catch (e) {
         setError(e instanceof Error ? e.message : 'Ошибка создания')
         setStatus('draft')
      }
   }

   if (status === 'created') {
      return (
         <div className="my-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-300">
               <span className="text-lg">✅</span>
               <span className="text-sm font-medium">Opportunity создана: {payload.title}</span>
            </div>
         </div>
      )
   }

   if (status === 'cancelled') {
      return (
         <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-500">
               <span className="text-lg">❌</span>
               <span className="text-sm">Отменено: {payload.title}</span>
            </div>
         </div>
      )
   }

   return (
      <div className="my-2 rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3">
         <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 text-amber-300">
               <span className="text-lg">📋</span>
               <span className="text-sm font-semibold">Новая opportunity (черновик)</span>
            </div>
            {payload.stage && payload.stage !== 'discovery' && (
               <div className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-900/60 text-amber-200 border border-amber-800">
                  Стадия: {STAGE_LABEL[payload.stage] || payload.stage}
               </div>
            )}
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
               <span className="text-zinc-500 text-[11px]">Название</span>
               <div className="text-zinc-200">{payload.title || '-'}</div>
            </div>
            {payload.client && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Клиент</span>
                  <div className="text-zinc-200">{payload.client}</div>
               </div>
            )}
            <div>
               <span className="text-zinc-500 text-[11px]">Бюджет (план)</span>
               <div className="text-zinc-200">{usd(payload.estimated_revenue)}</div>
            </div>
            <div>
               <span className="text-zinc-500 text-[11px]">Часы</span>
               <div className="text-zinc-200">{payload.estimated_hours ?? '-'} ч</div>
            </div>
            {effHourly !== null && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Eff/H (план)</span>
                  <div className="text-zinc-200">${effHourly}/h</div>
               </div>
            )}
            {payload.actual_revenue !== undefined && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Фактическая выручка</span>
                  <div className="text-emerald-400 font-medium">{usd(payload.actual_revenue)}</div>
               </div>
            )}
            {payload.actual_hours !== undefined && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Факт. часы</span>
                  <div className="text-emerald-400">{payload.actual_hours} ч</div>
               </div>
            )}
            {payload.platform && (
               <div>
                  <span className="text-zinc-500 text-[11px]">Платформа</span>
                  <div className="text-zinc-200">{payload.platform}</div>
               </div>
            )}
            {payload.url && (
               <div className="sm:col-span-2">
                  <span className="text-zinc-500 text-[11px]">URL</span>
                  <div className="text-zinc-200 truncate">
                     <a href={payload.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {payload.url}
                     </a>
                  </div>
               </div>
            )}
            {payload.summary && (
               <div className="sm:col-span-2">
                  <span className="text-zinc-500 text-[11px]">Summary</span>
                  <div className="text-zinc-300 text-xs">{payload.summary}</div>
               </div>
            )}
            {payload.notes && (
               <div className="sm:col-span-2 mt-1">
                  <span className="text-zinc-500 text-[11px]">Заметки (Notes)</span>
                  <div className="text-zinc-400 text-xs italic">{payload.notes}</div>
               </div>
            )}
         </div>

         {error && <div className="mt-2 text-xs text-red-400">{error}</div>}

         <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
               onClick={handleConfirm}
               disabled={status === 'creating'}
               className="h-8 px-4 rounded-md border border-emerald-700 bg-emerald-900/60 hover:bg-emerald-800/60 text-xs text-emerald-200 font-medium disabled:opacity-60"
            >
               {status === 'creating' ? 'Создаю...' : '✓ Добавить в воронку'}
            </button>
            <button
               onClick={() => setStatus('cancelled')}
               disabled={status === 'creating'}
               className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 disabled:opacity-60"
            >
               Отменить
            </button>
            {onRequestRevision && (
               <button
                  onClick={() => setIsRevising(!isRevising)}
                  disabled={status === 'creating'}
                  className="h-8 px-3 rounded-md border border-blue-800 bg-blue-900/40 hover:bg-blue-800/60 text-xs text-blue-300 transition-colors disabled:opacity-60"
               >
                  Внести правки
               </button>
            )}
         </div>

         {isRevising && onRequestRevision && (
            <div className="mt-3 border-t border-amber-800/30 pt-3">
               <textarea
                  value={revisionText}
                  onChange={e => setRevisionText(e.target.value)}
                  placeholder="Что нужно исправить? (Например: Бюджет не 500, а 250)"
                  className="w-full text-xs bg-black/40 border border-zinc-800 rounded-md p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-700 resize-none min-h-[60px]"
               />
               <div className="mt-2 flex justify-end">
                  <button
                     onClick={() => {
                        if (revisionText.trim()) {
                           onRequestRevision(`Правка карточки "${payload.title}": ${revisionText.trim()}`)
                           setIsRevising(false)
                           setRevisionText('')
                        }
                     }}
                     disabled={!revisionText.trim()}
                     className="h-7 px-3 rounded bg-amber-800 hover:bg-amber-700 text-xs font-medium text-amber-100 transition-colors disabled:opacity-50"
                  >
                     Отправить правки
                  </button>
               </div>
            </div>
         )}
      </div>
   )
}
