import { useState } from 'react'

interface Model {
  id: string
  name: string
  description: string
}

const MODELS: Model[] = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    description: 'Основная модель для глубокой стратегии, планирования и сложных ответов.',
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    description: 'Сильная reasoning-модель с мультимодальностью и агентскими сценариями.',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    description: 'Быстрая и более дешевая модель для рутинных задач и драфтов.',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Надежная высокопроизводительная модель для сложных задач.',
  },
]

interface ModelSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  selectedModel: string
  onSelect: (id: string) => void
}

export default function ModelSelectorModal({ isOpen, onClose, selectedModel, onSelect }: ModelSelectorModalProps) {
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filteredModels = MODELS.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#1E1F20] border border-[#333] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <header className="px-6 py-4 border-b border-[#333] flex items-center justify-between">
          <h2 className="text-lg font-medium">Выбор модели</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#28292A] rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="p-4 border-b border-[#333]">
          <div className="relative">
            <input
              type="text"
              placeholder="Найти модель"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0D0D0D] border border-[#333] rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-[#A8C7FA]"
            />
            <svg className="absolute left-3 top-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredModels.map(model => (
            <div
              key={model.id}
              onClick={() => {
                onSelect(model.id)
                onClose()
              }}
              className={`p-5 rounded-xl border transition-all cursor-pointer group ${
                selectedModel === model.id ? 'bg-[#28292A] border-[#A8C7FA]' : 'bg-[#131314] border-[#333] hover:border-[#555]'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#A8C7FA]/10 flex items-center justify-center text-[#A8C7FA]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-medium flex items-center gap-2">
                      {model.name}
                      {model.id.includes('preview') && <span className="text-[10px] bg-[#A8C7FA]/20 text-[#A8C7FA] px-1.5 py-0.5 rounded uppercase tracking-wider">Новое</span>}
                    </h3>
                    <p className="text-xs text-gray-500">{model.id}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed pr-8">{model.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
