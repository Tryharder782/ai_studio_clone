import { useState } from 'react'

interface DraftPostmortemPayload {
   opportunity_id?: string
   title?: string
   outcome?: string
   findings?: string
   what_worked?: string
   root_causes?: string[]
   lessons?: string[]
}

interface DraftPostmortemCardProps {
   payload: DraftPostmortemPayload
   apiBase: string
   onRequestRevision?: (text: string) => void
}

const OUTCOME_LABEL: Record<string, string> = {
   won: '🏆 Выиграно',
   lost: '❌ Проиграно',
   withdrawn: '↩️ Отозвано',
   no_response: '🔇 Нет ответа',
}

export default function DraftPostmortemCard({ payload, apiBase, onRequestRevision }: DraftPostmortemCardProps) {
   const [status, setStatus] = useState<'draft' | 'saving' | 'done' | 'cancelled'>('draft')
   const [error, setError] = useState('')
   const [isRevising, setIsRevising] = useState(false)
   const [revisionText, setRevisionText] = useState('')

   const handleConfirm = async () => {
      setStatus('saving')
      setError('')
      try {
         const res = await fetch(`${apiBase}/api/ops/postmortem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               opportunity_id: payload.opportunity_id || '',
               title: payload.title || 'Postmortem',
               outcome: payload.outcome || 'lost',
               findings: payload.findings || '',
               what_worked: payload.what_worked || '',
               root_causes: payload.root_causes || [],
               lessons: payload.lessons || [],
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
               <span className="text-sm font-medium">Postmortem создан: {payload.title}</span>
            </div>
         </div>
      )
   }

   if (status === 'cancelled') {
      return (
         <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-500">
               <span className="text-lg">❌</span>
               <span className="text-sm">Отменено: postmortem для {payload.title}</span>
            </div>
         </div>
      )
   }

   return (
      <div className="my-2 rounded-lg border border-orange-800/60 bg-orange-950/20 px-4 py-3">
         <div className="flex items-center gap-2 text-orange-300 mb-2">
            <span className="text-lg">📊</span>
            <span className="text-sm font-semibold">Postmortem (черновик)</span>
         </div>
         <div className="text-sm mb-2">
            <span className="text-zinc-200 font-medium">{payload.title}</span>
            <span className="ml-2 text-xs">{OUTCOME_LABEL[payload.outcome || ''] || payload.outcome}</span>
         </div>
         {payload.findings && (
            <div className="mb-2">
               <div className="text-[11px] text-zinc-500">Выводы</div>
               <div className="text-xs text-zinc-300 whitespace-pre-wrap">{payload.findings}</div>
            </div>
         )}
         {payload.what_worked && (
            <div className="mb-2">
               <div className="text-[11px] text-zinc-500">Что сработало</div>
               <div className="text-xs text-zinc-300">{payload.what_worked}</div>
            </div>
         )}
         {payload.root_causes && payload.root_causes.length > 0 && (
            <div className="mb-2">
               <div className="text-[11px] text-zinc-500">Причины</div>
               <ul className="list-disc list-inside text-xs text-zinc-300">
                  {payload.root_causes.map((c, i) => <li key={i}>{c}</li>)}
               </ul>
            </div>
         )}
         {payload.lessons && payload.lessons.length > 0 && (
            <div className="mb-2">
               <div className="text-[11px] text-zinc-500">Уроки</div>
               <ul className="list-disc list-inside text-xs text-zinc-300">
                  {payload.lessons.map((l, i) => <li key={i}>{l}</li>)}
               </ul>
            </div>
         )}
         {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
         <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={handleConfirm} disabled={status === 'saving'} className="h-8 px-4 rounded-md border border-fuchsia-700 bg-fuchsia-900/60 hover:bg-fuchsia-800/60 text-xs text-fuchsia-200 font-medium disabled:opacity-60">
               {status === 'saving' ? 'Сохраняю...' : '✓ Добавить Postmortem'}
            </button>
            <button onClick={() => setStatus('cancelled')} disabled={status === 'saving'} className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 disabled:opacity-60">
               Отменить
            </button>
            {onRequestRevision && (
               <button
                  onClick={() => setIsRevising(!isRevising)}
                  disabled={status === 'saving'}
                  className="h-8 px-3 rounded-md border border-fuchsia-800 bg-fuchsia-900/40 hover:bg-fuchsia-800/60 text-xs text-fuchsia-300 transition-colors disabled:opacity-60"
               >
                  Внести правки
               </button>
            )}
         </div>

         {isRevising && onRequestRevision && (
            <div className="mt-3 border-t border-fuchsia-800/30 pt-3">
               <textarea
                  value={revisionText}
                  onChange={e => setRevisionText(e.target.value)}
                  placeholder="Что нужно исправить в постмортеме?"
                  className="w-full text-xs bg-black/40 border border-zinc-800 rounded-md p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-700 resize-none min-h-[60px]"
               />
               <div className="mt-2 flex justify-end">
                  <button
                     onClick={() => {
                        if (revisionText.trim()) {
                           onRequestRevision(`Правка постмортема для "${payload.title}": ${revisionText.trim()}`)
                           setIsRevising(false)
                           setRevisionText('')
                        }
                     }}
                     disabled={!revisionText.trim()}
                     className="h-7 px-3 rounded bg-fuchsia-800 hover:bg-fuchsia-700 text-xs font-medium text-fuchsia-100 transition-colors disabled:opacity-50"
                  >
                     Отправить правки
                  </button>
               </div>
            </div>
         )}
      </div>
   )
}
