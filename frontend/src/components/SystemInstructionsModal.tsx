import { useEffect, useState } from 'react'

interface SystemInstructionsModalProps {
  isOpen: boolean
  onClose: () => void
  instructions: string
  onSave: (val: string) => void
}

export default function SystemInstructionsModal({ isOpen, onClose, instructions, onSave }: SystemInstructionsModalProps) {
  const [tempValue, setTempValue] = useState(instructions)

  useEffect(() => {
    setTempValue(instructions)
  }, [instructions, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-[#1E1F20] border border-[#333] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <header className="px-6 py-4 border-b border-[#333] flex items-center justify-between">
          <h2 className="text-lg font-medium">Системные инструкции</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#28292A] rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Профиль</label>
            <select className="bg-[#28292A] border border-[#333] rounded-lg px-3 py-2 text-sm outline-none w-full max-w-[220px]">
              <option>Пользовательский</option>
            </select>
          </div>

          <div className="relative flex-1 min-h-[400px]">
            <label className="text-xs text-gray-400 mb-2 block">Текст системных инструкций</label>
            <textarea
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              placeholder="Введи системные инструкции..."
              className="w-full h-full bg-[#131314] border border-[#333] rounded-xl p-6 text-sm leading-relaxed resize-none focus:outline-none focus:border-[#A8C7FA] transition-colors"
            />
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-[#333] flex items-center justify-between">
          <div className="text-xs text-gray-500 italic">Инструкции применяются к текущей сессии.</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2 text-sm font-medium hover:bg-[#28292A] rounded-full transition-colors">
              Отмена
            </button>
            <button
              onClick={() => {
                onSave(tempValue)
                onClose()
              }}
              className="px-6 py-2 text-sm font-medium bg-[#A8C7FA] text-[#041E49] hover:bg-[#D3E3FD] rounded-full transition-colors"
            >
              Сохранить
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
