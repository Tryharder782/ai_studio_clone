import { useState } from 'react'

interface DraftStageUpdatePayload {
   opportunity_id?: string
   title?: string
   new_stage?: string
   reason?: string
}

interface DraftStageUpdateCardProps {
   payload: DraftStageUpdatePayload
   apiBase: string
   onRequestRevision?: (text: string) => void
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

export default function DraftStageUpdateCard({ payload, apiBase, onRequestRevision }: DraftStageUpdateCardProps) {
   const [status, setStatus] = useState<'draft' | 'saving' | 'done' | 'cancelled'>('draft')
   const [error, setError] = useState('')
   const [isRevising, setIsRevising] = useState(false)
   const [revisionText, setRevisionText] = useState('')

   const handleConfirm = async () => {
      if (!payload.new_stage) {
         setError('Не указана стадия')
         return
      }
      setStatus('saving')
      setError('')
      try {
         const res = await fetch(`${apiBase}/api/ops/opportunity/stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               id: payload.opportunity_id || '',
               title: payload.title || '',
               stage: payload.new_stage,
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
               <span className="text-sm font-medium">
                  {payload.title} → {STAGE_LABEL[payload.new_stage || ''] || payload.new_stage}
               </span>
            </div>
         </div>
      )
   }

   if (status === 'cancelled') {
      return (
         <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-500">
               <span className="text-lg">❌</span>
               <span className="text-sm">Отменено: смена стадии для {payload.title}</span>
            </div>
         </div>
      )
   }

   return (
      <div className="my-2 rounded-lg border border-blue-800/60 bg-blue-950/20 px-4 py-3">
         <div className="flex items-center gap-2 text-blue-300 mb-2">
            <span className="text-lg">🔄</span>
            <span className="text-sm font-semibold">Смена стадии (черновик)</span>
         </div>
         <div className="text-sm text-zinc-200 mb-1">
            <strong>{payload.title}</strong> → <span className="text-blue-300 font-medium">{STAGE_LABEL[payload.new_stage || ''] || payload.new_stage}</span>
         </div>
         {payload.reason && <div className="text-xs text-zinc-400 mb-2">Причина: {payload.reason}</div>}
         {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
         <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleConfirm} disabled={status === 'saving'} className="h-8 px-4 rounded-md border border-blue-700 bg-blue-900/60 hover:bg-blue-800/60 text-xs text-blue-200 font-medium disabled:opacity-60">
               {status === 'saving' ? 'Сохраняю...' : '✓ Подтвердить'}
            </button>
            <button onClick={() => setStatus('cancelled')} disabled={status === 'saving'} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 disabled:opacity-60">
               Отменить
            </button>
            {onRequestRevision && (
               <button
                  onClick={() => setIsRevising(!isRevising)}
                  disabled={status === 'saving'}
                  className="h-8 px-3 rounded-md border border-blue-800 bg-blue-900/40 hover:bg-blue-800/60 text-xs text-blue-300 transition-colors disabled:opacity-60"
               >
                  Внести правки
               </button>
            )}
         </div>

         {isRevising && onRequestRevision && (
            <div className="mt-3 border-t border-blue-800/30 pt-3">
               <textarea
                  value={revisionText}
                  onChange={e => setRevisionText(e.target.value)}
                  placeholder="Что нужно исправить?"
                  className="w-full text-xs bg-black/40 border border-zinc-800 rounded-md p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-700 resize-none min-h-[60px]"
               />
               <div className="mt-2 flex justify-end">
                  <button
                     onClick={() => {
                        if (revisionText.trim()) {
                           onRequestRevision(`Правка смены стадии для "${payload.title}": ${revisionText.trim()}`)
                           setIsRevising(false)
                           setRevisionText('')
                        }
                     }}
                     disabled={!revisionText.trim()}
                     className="h-7 px-3 rounded bg-blue-800 hover:bg-blue-700 text-xs font-medium text-blue-100 transition-colors disabled:opacity-50"
                  >
                     Отправить правки
                  </button>
               </div>
            </div>
         )}
      </div>
   )
}
