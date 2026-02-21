import { useEffect, useState } from 'react'
import ModelSelectorModal from './ModelSelectorModal'
import SystemInstructionsModal from './SystemInstructionsModal'
import SyncDriveModal from './SyncDriveModal'

interface SidebarProps {
  className?: string
  apiBase: string
  onChangeApiBase: (value: string) => void
  onCloseMobile?: () => void
  onOpenWriter: () => void
  onOpenOps: () => void
  onOpenOpsAgent: () => void
  onOpenBackendLog: () => void
  onOpenDesktopLog: () => void
  temperature: number
  setTemperature: (v: number) => void
  thinkingLevel: string
  setThinkingLevel: (v: string) => void
  model: string
  setModel: (v: string) => void
  mediaResolution: string
  setMediaResolution: (v: string) => void
  chatContextLimit: number
  setChatContextLimit: (v: number) => void
  systemInstructions: string
  setSystemInstructions: (v: string) => void
  googleSearchEnabled: boolean
  setGoogleSearchEnabled: (v: boolean) => void
  codeExecutionEnabled: boolean
  setCodeExecutionEnabled: (v: boolean) => void
}

export default function Sidebar({
  className = '',
  apiBase,
  onChangeApiBase,
  onCloseMobile,
  onOpenWriter,
  onOpenOps,
  onOpenOpsAgent,
  onOpenBackendLog,
  onOpenDesktopLog,
  temperature,
  setTemperature,
  thinkingLevel,
  setThinkingLevel,
  model,
  setModel,
  mediaResolution,
  setMediaResolution,
  chatContextLimit,
  setChatContextLimit,
  systemInstructions,
  setSystemInstructions,
  googleSearchEnabled,
  setGoogleSearchEnabled,
  codeExecutionEnabled,
  setCodeExecutionEnabled,
}: SidebarProps) {
  const [isModelModalOpen, setIsModelModalOpen] = useState(false)
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [apiBaseInput, setApiBaseInput] = useState(apiBase)

  useEffect(() => {
    setApiBaseInput(apiBase)
  }, [apiBase])

  const getModelName = (id: string) => {
    if (id === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro Preview'
    if (id === 'gemini-3-pro-preview') return 'Gemini 3 Pro Preview'
    if (id === 'gemini-3-flash-preview') return 'Gemini 3 Flash Preview'
    if (id === 'gemini-2.5-pro') return 'Gemini 2.5 Pro'
    return id
  }

  return (
    <div className={`w-[305px] bg-[#1E1F20] border-l border-[#2A2A2A] flex flex-col p-4 gap-6 overflow-y-auto no-scrollbar ${className}`}>
      {onCloseMobile && (
        <div className="lg:hidden flex justify-end">
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-md hover:bg-[#28292A] text-gray-300"
            title="Закрыть настройки"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
        <span>Настройки запуска</span>
        <div className="flex gap-2">
          <button onClick={onOpenOps} className="hover:text-white transition-colors">
            Ops
          </button>
          <button onClick={onOpenWriter} className="hover:text-white transition-colors">
            Writer
          </button>
        </div>
      </div>

      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        selectedModel={model}
        onSelect={setModel}
      />

      <SystemInstructionsModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
        instructions={systemInstructions}
        onSave={setSystemInstructions}
      />

      <SyncDriveModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} apiBase={apiBase} />

      <div
        onClick={() => setIsModelModalOpen(true)}
        className="bg-[#28292A] rounded-xl p-4 flex flex-col gap-1 border border-transparent hover:border-gray-600 transition-colors cursor-pointer"
      >
        <h3 className="text-[#E3E3E3] font-medium">{getModelName(model)}</h3>
        <span className="text-xs text-gray-400 font-mono">{model}</span>
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Основная модель для стратегии и сложных решений.
        </p>
      </div>

      <div
        onClick={() => setIsSystemModalOpen(true)}
        className="bg-[#28292A] rounded-xl p-4 min-h-[100px] border border-transparent hover:border-gray-600 transition-colors cursor-pointer"
      >
        <h3 className="text-[#E3E3E3] font-medium mb-2 text-sm">Системные инструкции</h3>
        <p className="text-xs text-gray-400 line-clamp-4 leading-relaxed italic">
          "{systemInstructions || 'Не заданы'}"
        </p>
      </div>

      <div className="bg-[#28292A] rounded-xl p-4 border border-[#333]">
        <div className="text-xs text-gray-400 mb-2">Backend URL (облако/удалённый)</div>
        <input
          value={apiBaseInput}
          onChange={e => setApiBaseInput(e.target.value)}
          placeholder="https://your-backend.example.com"
          className="w-full bg-[#111213] border border-[#333] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#A8C7FA]"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onChangeApiBase(apiBaseInput)}
            className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-100 text-zinc-900 text-xs hover:bg-white"
          >
            Применить
          </button>
          <button
            onClick={() => {
              setApiBaseInput('')
              onChangeApiBase('')
            }}
            className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs hover:bg-zinc-800"
          >
            Сброс
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-1">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-gray-300">Температура</span>
            <div className="w-12 h-7 bg-[#28292A] rounded-lg border border-[#333] flex items-center justify-center text-xs">
              {temperature}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-[#A8C7FA] h-1.5 bg-[#28292A] rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-300">Качество медиа</span>
          <select
            value={mediaResolution}
            onChange={e => setMediaResolution(e.target.value)}
            className="w-full bg-[#28292A] border border-[#333] rounded-lg p-2.5 text-sm outline-none hover:border-gray-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="Default">По умолчанию</option>
            <option value="Low">Низкое</option>
            <option value="Medium">Среднее</option>
            <option value="High">Высокое</option>
          </select>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-gray-300" title="Сколько последних сообщений отправлять в API контекст">Глубина истории чата</span>
            <div className="w-12 h-7 bg-[#28292A] rounded-lg border border-[#333] flex items-center justify-center text-xs text-gray-400">
              {chatContextLimit === 0 ? 'Все' : chatContextLimit}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={chatContextLimit}
            onChange={e => setChatContextLimit(parseInt(e.target.value, 10))}
            className="w-full accent-[#A8C7FA] h-1.5 bg-[#28292A] rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <span className="text-sm font-medium text-gray-300">Глубина мышления</span>
          <select
            value={thinkingLevel}
            onChange={e => setThinkingLevel(e.target.value)}
            className="w-full bg-[#28292A] border border-[#333] rounded-lg p-2.5 text-sm outline-none hover:border-gray-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="Off">Отключено</option>
            <option value="Low">Низкая</option>
            <option value="High">Высокая</option>
          </select>
        </div>
      </div>

      <div className="pt-2 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1 text-gray-400">
          <span className="text-sm font-medium text-gray-300">Инструменты</span>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-gray-300">Выполнение кода</span>
            <div
              onClick={() => setCodeExecutionEnabled(!codeExecutionEnabled)}
              className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${codeExecutionEnabled ? 'bg-[#A8C7FA]' : 'bg-[#333]'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${codeExecutionEnabled ? 'left-4.5 bg-[#000]' : 'left-0.5 bg-gray-600'}`} />
            </div>
          </div>

          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Поиск Google</span>
              <div
                onClick={() => setGoogleSearchEnabled(!googleSearchEnabled)}
                className={`w-10 h-5 border rounded-full relative transition-colors cursor-pointer ${googleSearchEnabled ? 'bg-[#A8C7FA] border-[#A8C7FA]' : 'bg-[#28292A] border-[#333]'}`}
              >
                <div className={`absolute top-1 w-2.5 h-2.5 rounded-full transition-all ${googleSearchEnabled ? 'left-6.5 bg-[#000]' : 'left-1 bg-gray-500'}`} />
              </div>
            </div>
            {googleSearchEnabled && (
              <span className="text-[10px] text-gray-500 animate-in fade-in slide-in-from-top-1 duration-200">
                Источник: Google Search
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-[#2A2A2A] pt-4">
        <button
          onClick={onOpenWriter}
          className="w-full bg-[#2F3F26] hover:bg-[#3D5032] text-[#D7F3C6] text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Открыть Cover Writer
        </button>
        <button
          onClick={onOpenOpsAgent}
          className="w-full bg-[#1A3A36] hover:bg-[#204944] text-[#A7F3D0] text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          Открыть Ops Agent
        </button>
        <button
          onClick={onOpenOps}
          className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Открыть Ops Hub
        </button>
        <button
          onClick={() => setIsSyncModalOpen(true)}
          className="w-full bg-[#333] hover:bg-[#444] text-[#A8C7FA] text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Синхронизировать историю
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenBackendLog}
            className="bg-[#2C2D2E] hover:bg-[#3A3B3C] text-gray-200 text-xs py-2 rounded-lg transition-colors"
          >
            Лог backend
          </button>
          <button
            onClick={onOpenDesktopLog}
            className="bg-[#2C2D2E] hover:bg-[#3A3B3C] text-gray-200 text-xs py-2 rounded-lg transition-colors"
          >
            Лог desktop
          </button>
        </div>
      </div>
    </div>
  )
}
