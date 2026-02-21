import { useState } from 'react'

interface DraftOpportunityUpdatePayload {
   opportunity_id?: string
   title?: string
   updates?: {
      summary?: string
      notes?: string
      expected_revenue_usd?: number
      estimated_hours?: number
      client?: string
   }
}

interface DraftOpportunityUpdateCardProps {
   payload: DraftOpportunityUpdatePayload
   apiBase: string
   onRequestRevision?: (text: string) => void
}

const usd = (v?: number | null) =>
   v === undefined || v === null ? '-' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const FIELD_LABEL: Record<string, string> = {
   summary: 'Summary',
   notes: 'Заметки',
   expected_revenue_usd: 'Ожидаемая выручка',
   estimated_hours: 'Оценка часов',
   client: 'Клиент',
}

export default function DraftOpportunityUpdateCard({ payload, apiBase, onRequestRevision }: DraftOpportunityUpdateCardProps) {
   const [status, setStatus] = useState<'draft' | 'saving' | 'done' | 'cancelled'>('draft')
   const [error, setError] = useState('')
   const [isRevising, setIsRevising] = useState(false)
   const [revisionText, setRevisionText] = useState('')

   const updates = payload.updates || {}
   const fieldEntries = Object.entries(updates).filter(([, v]) => v !== undefined && v !== null && v !== '')

   const handleConfirm = async () => {
      if (!fieldEntries.length) {
         setError('Нет изменений для сохранения')
         return
      }
      setStatus('saving')
      setError('')
      try {
         const body: Record<string, unknown> = { id: payload.opportunity_id || '', title: payload.title || '' }
         for (const [k, v] of fieldEntries) body[k] = v
         const res = await fetch(`${apiBase}/api/ops/opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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

   const formatValue = (key: string, value: unknown) => {
      if (key === 'expected_revenue_usd') return usd(value as number)
      if (key === 'estimated_hours') return `${value} ч`
      return String(value)
   }

   if (status === 'done') {
      return (
         <div className="my-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-300">
               <span className="text-lg">✅</span>
               <span className="text-sm font-medium">Обновлено: {payload.title}</span>
            </div>
         </div>
      )
   }

   if (status === 'cancelled') {
      return (
         <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-500">
               <span className="text-lg">❌</span>
               <span className="text-sm">Отменено: обновление {payload.title}</span>
            </div>
         </div>
      )
   }

   return (
      <div className="my-2 rounded-lg border border-violet-800/60 bg-violet-950/20 px-4 py-3">
         <div className="flex items-center gap-2 text-violet-300 mb-2">
            <span className="text-lg">✏️</span>
            <span className="text-sm font-semibold">Обновление карточки (черновик)</span>
         </div>
         <div className="text-sm text-zinc-200 mb-2 font-medium">{payload.title}</div>
         <div className="grid grid-cols-1 gap-1 text-sm">
            {fieldEntries.map(([key, value]) => (
               <div key={key} className="flex items-baseline gap-2">
                  <span className="text-zinc-500 text-[11px] min-w-[120px]">{FIELD_LABEL[key] || key}:</span>
                  <span className="text-zinc-200">{formatValue(key, value)}</span>
               </div>
            ))}
         </div>
         {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
         <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={handleConfirm} disabled={status === 'saving'} className="h-8 px-4 rounded-md border border-violet-700 bg-violet-900/60 hover:bg-violet-800/60 text-xs text-violet-200 font-medium disabled:opacity-60">
               {status === 'saving' ? 'Сохраняю...' : '✓ Сохранить'}
            </button>
            <button onClick={() => setStatus('cancelled')} disabled={status === 'saving'} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 disabled:opacity-60">
               Отменить
            </button>
            {onRequestRevision && (
               <button
                  onClick={() => setIsRevising(!isRevising)}
                  disabled={status === 'saving'}
                  className="h-8 px-3 rounded-md border border-violet-800 bg-violet-900/40 hover:bg-violet-800/60 text-xs text-violet-300 transition-colors disabled:opacity-60"
               >
                  Внести правки
               </button>
            )}
         </div>

         {isRevising && onRequestRevision && (
            <div className="mt-3 border-t border-violet-800/30 pt-3">
               <textarea
                  value={revisionText}
                  onChange={e => setRevisionText(e.target.value)}
                  placeholder="Что нужно исправить?"
                  className="w-full text-xs bg-black/40 border border-zinc-800 rounded-md p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-700 resize-none min-h-[60px]"
               />
               <div className="mt-2 flex justify-end">
                  <button
                     onClick={() => {
                        if (revisionText.trim()) {
                           onRequestRevision(`Правка обновления для "${payload.title}": ${revisionText.trim()}`)
                           setIsRevising(false)
                           setRevisionText('')
                        }
                     }}
                     disabled={!revisionText.trim()}
                     className="h-7 px-3 rounded bg-violet-800 hover:bg-violet-700 text-xs font-medium text-violet-100 transition-colors disabled:opacity-50"
                  >
                     Отправить правки
                  </button>
               </div>
            </div>
         )}
      </div>
   )
}
