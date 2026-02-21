import { useState } from 'react'
import type { Message } from '../types'

interface OpsMiniAgentProps {
   isOpen: boolean
   onClose: () => void
   apiBase: string
   onError: (msg: string) => void
   messages: Message[]
   onInjectInteraction: (userText: string, modelText: string) => void
}

export default function OpsMiniAgent({ isOpen, onClose, apiBase, onError, messages, onInjectInteraction }: OpsMiniAgentProps) {
   const [instruction, setInstruction] = useState('')
   const [isBusy, setIsBusy] = useState(false)
   const [contextCount, setContextCount] = useState(5)

   if (!isOpen) return null

   const runAgent = async () => {
      if (!instruction.trim()) return
      setIsBusy(true)

      const recentHistory = messages.slice(-contextCount).map(m => ({
         role: m.role,
         text: m.parts.join('\n')
      }))

      try {
         const res = await fetch(`${apiBase}/api/ops_agent/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               message: instruction,
               history: recentHistory,
            }),
         })
         const data = await res.json().catch(() => null)
         if (!res.ok) {
            onError((data?.detail) || 'Ошибка работы Ops Mini-Agent')
            return
         }

         onInjectInteraction(instruction, data.text || '')
         setInstruction('')
         onClose()
      } catch {
         onError('Сетевая ошибка Ops Mini-Agent')
      } finally {
         setIsBusy(false)
      }
   }

   return (
      <div className="fixed inset-0 z-[140] flex items-end justify-end p-3 md:p-5">
         <div className="absolute inset-0 bg-black/45" onClick={onClose} />

         <div className="relative w-full max-w-[400px] h-[60vh] md:h-[65vh] bg-[#1A1B1C] border border-[#2E2F30] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-[#2E2F30] flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <h2 className="text-sm md:text-base font-semibold text-[#E3E3E3]">Ops Agent</h2>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-[#263321] text-[#CFF0B8] uppercase tracking-wider">Flash preview</span>
               </div>
               <button
                  onClick={onClose}
                  className="p-2 rounded-md hover:bg-[#262728] text-gray-300 transition-colors"
                  title="Закрыть agent"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                     <line x1="18" y1="6" x2="6" y2="18" />
                     <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
               </button>
            </header>

            <div className="p-5 border-b border-[#2E2F30] flex flex-col gap-4 flex-1 overflow-y-auto">
               <div className="text-xs text-zinc-400 bg-black/30 p-3 rounded-lg border border-zinc-800/50 leading-relaxed">
                  Этот агент анализирует последние сообщения и генерирует карточки Ops Hub без отвлечения основнего стратега. Идеально для исправлений и забытых апдейтов.
               </div>

               <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-xs font-medium text-gray-300">Сообщений в контексте: {contextCount}</label>
                  <input
                     type="range"
                     min={1}
                     max={20}
                     step={1}
                     value={contextCount}
                     onChange={e => setContextCount(Number(e.target.value) || 5)}
                     className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-600 focus:outline-none"
                  />
               </div>

               <div className="flex flex-col gap-1.5 mt-4">
                  <label className="text-xs font-medium text-gray-300">Инструкция</label>
                  <textarea
                     value={instruction}
                     onChange={e => setInstruction(e.target.value)}
                     placeholder="Что нужно сделать? (Напр: Измени бюджет в последней пропозали на $500)"
                     className="w-full h-32 bg-[#111213] border border-[#333] rounded-lg p-3 text-sm text-zinc-200 resize-none outline-none focus:border-emerald-700/60 focus:bg-black/50 transition-colors shadow-inner"
                  />
               </div>

               <div className="mt-1 flex flex-wrap gap-2">
                  <button
                     onClick={() => setInstruction('Обнови бюджет в только что созданной карточке согласно истории')}
                     className="px-2.5 py-1 text-xs rounded-md bg-[#2A2B2C] text-zinc-300 hover:bg-[#343536] hover:text-zinc-100 transition-colors"
                  >
                     + Бюджет
                  </button>
                  <button
                     onClick={() => setInstruction('Измени стадию последней карточки на выигранную (won) и учти факты из чата')}
                     className="px-2.5 py-1 text-xs rounded-md bg-[#2A2B2C] text-zinc-300 hover:bg-[#343536] hover:text-zinc-100 transition-colors"
                  >
                     + Win
                  </button>
               </div>
            </div>

            <div className="p-4 bg-[#111213] border-t border-[#2E2F30] flex justify-between items-center">
               <span className="text-[10px] text-zinc-500 max-w-[150px] leading-tight flex-1">
                  Результат будет добавлен в историю чата.
               </span>
               <button
                  onClick={runAgent}
                  disabled={isBusy || !instruction.trim()}
                  className="px-5 py-2 text-sm rounded-lg bg-emerald-800 text-emerald-100 font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-800 transition-colors flex items-center gap-2"
               >
                  {isBusy ? (
                     <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5 text-emerald-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Думает...
                     </span>
                  ) : (
                     <>
                        Выполнить task
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                     </>
                  )}
               </button>
            </div>
         </div>
      </div>
   )
}
