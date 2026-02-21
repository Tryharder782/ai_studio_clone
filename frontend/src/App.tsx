import { useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.tsx'
import ChatInterface from './components/ChatInterface.tsx'
import CoverWriterMini from './components/CoverWriterMini.tsx'
import OpsMiniAgent from './components/OpsMiniAgent.tsx'
import MobileOpsCompanion from './components/MobileOpsCompanion.tsx'
import OpsCommandCenter from './components/OpsCommandCenter.tsx'
import CommandWelcome from './components/CommandWelcome.tsx'
import DotWaveBackground from './components/DotWaveBackground.tsx'
import type { Message } from './types.ts'
import { clearSavedApiBase, resolveApiBase, resolveWsBase, saveApiBase } from './lib/apiBase.ts'

type TabType = 'main' | 'chat2' | 'hongkong'
type PageType = 'ops' | 'chat'
type OpsMobileMode = 'companion' | 'full'

type ChatBundle = {
  historyLoaded: boolean
  messages: Message[]
  isLoading: boolean
  offset: number
  hasMore: boolean
  tokens: number
}

const HISTORY_FILES: Record<TabType, string> = {
  main: 'Работа над собой 3.json',
  chat2: 'Работа над собой 2.json',
  hongkong: 'Гонконг_ Советы по поступлению 2026_ 2.json',
}

const TAB_LABEL: Record<TabType, string> = {
  main: 'Главный',
  chat2: 'Работа над собой 2',
  hongkong: 'Hong Kong',
}

const EMPTY_CHAT: ChatBundle = {
  historyLoaded: false,
  messages: [],
  isLoading: false,
  offset: 0,
  hasMore: true,
  tokens: 0,
}

const getOrCreateClientId = (): string => {
  const storageKey = 'ai_studio_client_id'
  const existing = localStorage.getItem(storageKey)
  if (existing) return existing
  const generated = `client_${Math.random().toString(36).slice(2)}_${Date.now()}`
  localStorage.setItem(storageKey, generated)
  return generated
}

const normalizeMessages = (messages: Message[], apiBase: string): Message[] => {
  return messages.map(msg => ({
    ...msg,
    attachments: (msg.attachments || []).map(att => {
      let normalizedUrl = att.url
      if (normalizedUrl.startsWith('/attachments/')) {
        normalizedUrl = `${apiBase}${normalizedUrl}`
      } else if (normalizedUrl.startsWith('http://localhost:8000/attachments/')) {
        normalizedUrl = normalizedUrl.replace('http://localhost:8000', apiBase)
      }
      return { ...att, url: normalizedUrl }
    }),
  }))
}

const resolveTabByFile = (filePath: string): TabType | null => {
  if (!filePath) return null
  const normalizedPath = filePath.toLowerCase()
  const entries = Object.entries(HISTORY_FILES) as Array<[TabType, string]>

  for (const [tab, fileName] of entries) {
    const lowName = fileName.toLowerCase()
    if (normalizedPath.endsWith(lowName)) return tab
    if (normalizedPath.includes(lowName)) return tab
    if (normalizedPath.includes(`${lowName}.synced`)) return tab
  }

  return null
}

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = (value as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (detail) return JSON.stringify(detail)
  }
  return fallback
}

function App() {
  const clientIdRef = useRef<string>(getOrCreateClientId())
  const initialPhoneViewport = typeof window !== 'undefined' ? window.innerWidth < 1024 : false

  const [apiBase, setApiBase] = useState(resolveApiBase())
  const [activePage, setActivePage] = useState<PageType>('ops')
  const [showWelcome, setShowWelcome] = useState(true)
  const [isPhoneViewport, setIsPhoneViewport] = useState(initialPhoneViewport)
  const [opsMobileMode, setOpsMobileMode] = useState<OpsMobileMode>(initialPhoneViewport ? 'companion' : 'full')

  const [activeTab, setActiveTab] = useState<TabType>('main')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isWriterOpen, setIsWriterOpen] = useState(false)
  const [isOpsAgentOpen, setIsOpsAgentOpen] = useState(false)

  const [mainChat, setMainChat] = useState<ChatBundle>(EMPTY_CHAT)
  const [chat2, setChat2] = useState<ChatBundle>(EMPTY_CHAT)
  const [hongKongChat, setHongKongChat] = useState<ChatBundle>(EMPTY_CHAT)

  const [apiKeyAvailable, setApiKeyAvailable] = useState(true)
  const [appError, setAppError] = useState('')

  const [temperature, setTemperature] = useState(1.0)
  const [thinkingLevel, setThinkingLevel] = useState('High')
  const [model, setModel] = useState('gemini-3.1-pro-preview')
  const [mediaResolution, setMediaResolution] = useState('Default')
  const [googleSearchEnabled, setGoogleSearchEnabled] = useState(false)
  const [codeExecutionEnabled, setCodeExecutionEnabled] = useState(false)
  const [systemInstructions, setSystemInstructions] = useState(() => localStorage.getItem('ai_studio_system_instructions') || '')
  const [chatContextLimit, setChatContextLimit] = useState(() => parseInt(localStorage.getItem('ai_studio_chat_context_limit') || '10', 10))

  useEffect(() => {
    localStorage.setItem('ai_studio_system_instructions', systemInstructions)
  }, [systemInstructions])

  useEffect(() => {
    localStorage.setItem('ai_studio_chat_context_limit', chatContextLimit.toString())
  }, [chatContextLimit])

  const wsBase = useMemo(() => resolveWsBase(apiBase), [apiBase])

  const activeState = useMemo(() => {
    if (activeTab === 'main') return mainChat
    if (activeTab === 'chat2') return chat2
    return hongKongChat
  }, [activeTab, mainChat, chat2, hongKongChat])

  const setTabState = (tab: TabType, updater: (prev: ChatBundle) => ChatBundle) => {
    if (tab === 'main') {
      setMainChat(prev => updater(prev))
      return
    }
    if (tab === 'chat2') {
      setChat2(prev => updater(prev))
      return
    }
    setHongKongChat(prev => updater(prev))
  }

  const injectOpsAgentInteraction = (userText: string, modelText: string) => {
    const userMsg: Message = {
      role: 'user',
      parts: [`*(Ops Agent Command)*:\n${userText}`],
    }
    const modelMsg: Message = {
      role: 'model',
      parts: [modelText],
    }
    setTabState(activeTab, prev => ({
      ...prev,
      messages: [...prev.messages, userMsg, modelMsg],
      tokens: prev.tokens + Math.round((userText.length + modelText.length) / 4),
    }))
  }

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${apiBase}/api/config`)
        const data = await res.json().catch(() => null)
        if (res.ok) {
          setApiKeyAvailable(Boolean(data.api_key_available))
          setAppError('')
        } else {
          setApiKeyAvailable(false)
          setAppError(toErrorMessage(data, 'Не удалось загрузить конфиг backend'))
        }
      } catch {
        setApiKeyAvailable(false)
        setAppError('Нет подключения к backend. Проверь, что desktop backend запущен.')
      }
    }

    void loadConfig()
  }, [apiBase])

  useEffect(() => {
    const handleResize = () => {
      const phone = window.innerWidth < 1024
      setIsPhoneViewport(phone)
      if (!phone) {
        setOpsMobileMode('full')
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(wsBase)

    ws.onmessage = event => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type !== 'chat_appended') return
        if (payload.source_client_id && payload.source_client_id === clientIdRef.current) return

        const tab = resolveTabByFile(payload.file || '')
        if (!tab) return

        const incomingMessages = normalizeMessages((payload.messages || []) as Message[], apiBase)
        if (incomingMessages.length === 0) return

        setTabState(tab, prev => ({
          ...prev,
          messages: [...prev.messages, ...incomingMessages],
          tokens: payload.total_tokens ?? prev.tokens,
        }))
      } catch {
        // Ignore malformed payloads.
      }
    }

    ws.onerror = () => {
      setAppError('Сбой realtime-синхронизации. Чат продолжит работу без live-обновлений.')
    }

    return () => {
      ws.close()
    }
  }, [apiBase, wsBase])

  const loadHistory = async (tab: TabType) => {
    if (!apiKeyAvailable) return

    setTabState(tab, prev => ({ ...prev, isLoading: true }))

    try {
      const res = await fetch(`${apiBase}/api/load_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_file_path: HISTORY_FILES[tab],
          model,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setAppError(toErrorMessage(data, 'Ошибка при загрузке истории'))
        setTabState(tab, prev => ({ ...prev, isLoading: false }))
        return
      }

      setTabState(tab, prev => ({
        ...prev,
        historyLoaded: true,
        messages: [],
        offset: 0,
        hasMore: true,
        tokens: data.total_tokens ?? prev.tokens,
      }))

      await fetchHistory(tab, 0)
      setAppError('')
    } catch (e) {
      setAppError(`Ошибка подключения при загрузке истории: ${String(e)}`)
      setTabState(tab, prev => ({ ...prev, isLoading: false }))
    }
  }

  const fetchHistory = async (tab: TabType, offset = 0) => {
    setTabState(tab, prev => ({ ...prev, isLoading: true }))

    try {
      const res = await fetch(`${apiBase}/api/history?offset=${offset}&limit=20`)
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setTabState(tab, prev => ({ ...prev, isLoading: false }))
        setAppError(toErrorMessage(data, 'Ошибка при загрузке сообщений'))
        return
      }

      setTabState(tab, prev => ({
        ...prev,
        messages: data.messages && data.messages.length > 0 ? [...normalizeMessages(data.messages, apiBase), ...prev.messages] : prev.messages,
        offset: data.messages && data.messages.length > 0 ? prev.offset + data.messages.length : prev.offset,
        hasMore: Boolean(data.has_more),
        tokens: data.total_tokens ?? prev.tokens,
        isLoading: false,
      }))
      setAppError('')
    } catch {
      setTabState(tab, prev => ({ ...prev, isLoading: false }))
      setAppError('Сетевая ошибка при загрузке истории.')
    }
  }

  const sendMessage = async (tab: TabType, text: string, files: File[]) => {
    const formData = new FormData()
    formData.append('message', text)
    formData.append('model', model)
    formData.append('temperature', temperature.toString())
    formData.append('media_resolution', mediaResolution)
    formData.append('thinking_level', thinkingLevel)
    formData.append('system_instructions', systemInstructions)
    formData.append('google_search', googleSearchEnabled.toString())
    formData.append('code_execution', codeExecutionEnabled.toString())
    formData.append('chat_context_limit', chatContextLimit.toString())
    formData.append('client_id', clientIdRef.current)

    files.forEach(file => {
      formData.append('files', file)
    })

    const attachmentObjects = files.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    }))

    const newMsg: Message = {
      role: 'user',
      parts: [text],
      attachments: attachmentObjects,
    }

    setTabState(tab, prev => ({ ...prev, messages: [...prev.messages, newMsg], isLoading: true }))

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setTabState(tab, prev => ({ ...prev, isLoading: false }))
        setAppError(toErrorMessage(data, 'Ошибка запроса чата'))
        return
      }

      setTabState(tab, prev => ({
        ...prev,
        messages: [...prev.messages, { role: 'model', parts: [data.text] } as Message],
        tokens: data.total_tokens ?? (prev.tokens + Math.round((text.length + (data.text || '').length) / 4)),
        isLoading: false,
      }))
      setAppError('')
    } catch {
      setTabState(tab, prev => ({ ...prev, isLoading: false }))
      setAppError('Сетевая ошибка при отправке сообщения.')
    }
  }

  const openLog = async (target: 'backend' | 'desktop') => {
    try {
      const res = await fetch(`${apiBase}/api/open_log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setAppError(toErrorMessage(data, `Не удалось открыть лог: ${target}`))
        return
      }
      setAppError('')
    } catch {
      setAppError(`Сетевая ошибка при открытии лога: ${target}.`)
    }
  }

  const applyApiBase = (value: string) => {
    const next = saveApiBase(value)
    if (!next) {
      clearSavedApiBase()
      const fallback = resolveApiBase()
      setApiBase(fallback)
      setAppError(`URL backend сброшен. Текущий: ${fallback}`)
      return
    }

    setApiBase(next)
    setAppError(`URL backend обновлён: ${next}`)
  }

  const formatTokens = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`
    return count.toString()
  }

  return (
    <>
      {showWelcome && <CommandWelcome onContinue={() => setShowWelcome(false)} />}
      <div className="relative h-screen overflow-hidden bg-black text-zinc-100">
        <DotWaveBackground className="pointer-events-none absolute inset-0 h-full w-full opacity-35" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.08),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,255,255,0.06),transparent_40%)]" />

        <div className="relative z-10 flex h-full flex-col">
          <header className="flex h-14 items-center justify-between border-b border-zinc-800/80 bg-black/60 px-3 md:px-5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-zinc-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-300">
                Work Boost OS
              </div>
              <div className="hidden text-xs text-zinc-500 md:block">Операционная система фриланса</div>
            </div>

            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-1">
              <button
                onClick={() => setActivePage('ops')}
                className={`rounded-md px-3 py-1.5 text-xs md:text-sm ${activePage === 'ops' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}
              >
                Ops Hub
              </button>
              <button
                onClick={() => setActivePage('chat')}
                className={`rounded-md px-3 py-1.5 text-xs md:text-sm ${activePage === 'chat' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}
              >
                Чат
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activePage === 'ops' && isPhoneViewport && (
                <button
                  onClick={() => setOpsMobileMode(prev => (prev === 'companion' ? 'full' : 'companion'))}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  title="Переключить мобильный режим Ops Hub"
                >
                  {opsMobileMode === 'companion' ? 'Полный' : 'Моб. режим'}
                </button>
              )}
              <button
                onClick={() => setIsOpsAgentOpen(true)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 md:text-sm"
                title="Открыть Ops Agent"
              >
                Ops Agent
              </button>
              <button
                onClick={() => setIsWriterOpen(true)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 md:text-sm"
                title="Открыть Cover Writer"
              >
                Writer
              </button>
              {activePage === 'chat' && (
                <>
                  <div className="hidden whitespace-nowrap text-xs text-zinc-400 md:block">{formatTokens(activeState.tokens)} токенов</div>
                  <button
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-gray-200 lg:hidden"
                    title="Открыть настройки чата"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </header>

          {appError && (
            <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200 md:mx-5 md:text-sm">
              <span>{appError}</span>
              <button
                onClick={() => setAppError('')}
                className="shrink-0 rounded px-2 py-0.5 text-red-100 hover:bg-red-500/20"
                title="Скрыть"
              >
                x
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1">
            {/* Both views stay mounted to preserve React state (draft card statuses) */}
            <div className={`h-full p-2 md:p-4 ${activePage !== 'ops' ? 'hidden' : ''}`}>
              <div className="h-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/92">
                {isPhoneViewport && opsMobileMode === 'companion' ? (
                  <MobileOpsCompanion
                    apiBase={apiBase}
                    onError={setAppError}
                    onOpenWriter={() => setIsWriterOpen(true)}
                    onOpenChat={() => setActivePage('chat')}
                    onOpenFullOps={() => setOpsMobileMode('full')}
                  />
                ) : (
                  <OpsCommandCenter apiBase={apiBase} onError={setAppError} />
                )}
              </div>
            </div>
            <div className={`flex h-full min-h-0 ${activePage !== 'chat' ? 'hidden' : ''}`}>
              <div className="m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/92 md:m-4 md:mr-2">
                <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-3">
                  <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {(Object.keys(TAB_LABEL) as TabType[]).map(tabKey => (
                      <button
                        key={tabKey}
                        onClick={() => setActiveTab(tabKey)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${activeTab === tabKey ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                      >
                        {TAB_LABEL[tabKey]}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-400">{formatTokens(activeState.tokens)} токенов</div>
                </header>
                <ChatInterface
                  messages={activeState.messages}
                  onSend={(text, files) => sendMessage(activeTab, text, files)}
                  isLoading={activeState.isLoading}
                  historyLoaded={activeState.historyLoaded}
                  onLoadHistory={() => loadHistory(activeTab)}
                  onLoadMore={() => fetchHistory(activeTab, activeState.offset)}
                  hasMore={activeState.hasMore}
                  missingApiKey={!apiKeyAvailable}
                  apiBase={apiBase}
                />
              </div>

              <div className="mr-4 hidden lg:block">
                <Sidebar
                  className="h-full rounded-2xl border border-zinc-800"
                  apiBase={apiBase}
                  onChangeApiBase={applyApiBase}
                  onOpenWriter={() => setIsWriterOpen(true)}
                  onOpenOps={() => setActivePage('ops')}
                  onOpenOpsAgent={() => setIsOpsAgentOpen(true)}
                  onOpenBackendLog={() => openLog('backend')}
                  onOpenDesktopLog={() => openLog('desktop')}
                  temperature={temperature}
                  setTemperature={setTemperature}
                  thinkingLevel={thinkingLevel}
                  setThinkingLevel={setThinkingLevel}
                  model={model}
                  setModel={setModel}
                  mediaResolution={mediaResolution}
                  setMediaResolution={setMediaResolution}
                  systemInstructions={systemInstructions}
                  setSystemInstructions={setSystemInstructions}
                  chatContextLimit={chatContextLimit}
                  setChatContextLimit={setChatContextLimit}
                  googleSearchEnabled={googleSearchEnabled}
                  setGoogleSearchEnabled={setGoogleSearchEnabled}
                  codeExecutionEnabled={codeExecutionEnabled}
                  setCodeExecutionEnabled={setCodeExecutionEnabled}
                />
              </div>
            </div>

          </div>
        </div>

        {activePage === 'chat' && isMobileSidebarOpen && (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <div className="absolute inset-0 bg-black/70" onClick={() => setIsMobileSidebarOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-[88vw] max-w-[360px]">
              <Sidebar
                className="h-full w-full border-l border-zinc-800"
                apiBase={apiBase}
                onChangeApiBase={applyApiBase}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
                onOpenWriter={() => {
                  setIsMobileSidebarOpen(false)
                  setIsWriterOpen(true)
                }}
                onOpenOps={() => {
                  setIsMobileSidebarOpen(false)
                  setActivePage('ops')
                }}
                onOpenOpsAgent={() => {
                  setIsMobileSidebarOpen(false)
                  setIsOpsAgentOpen(true)
                }}
                onOpenBackendLog={() => openLog('backend')}
                onOpenDesktopLog={() => openLog('desktop')}
                temperature={temperature}
                setTemperature={setTemperature}
                thinkingLevel={thinkingLevel}
                setThinkingLevel={setThinkingLevel}
                model={model}
                setModel={setModel}
                mediaResolution={mediaResolution}
                setMediaResolution={setMediaResolution}
                systemInstructions={systemInstructions}
                setSystemInstructions={setSystemInstructions}
                chatContextLimit={chatContextLimit}
                setChatContextLimit={setChatContextLimit}
                googleSearchEnabled={googleSearchEnabled}
                setGoogleSearchEnabled={setGoogleSearchEnabled}
                codeExecutionEnabled={codeExecutionEnabled}
                setCodeExecutionEnabled={setCodeExecutionEnabled}
              />
            </div>
          </div>
        )}

        <CoverWriterMini
          isOpen={isWriterOpen}
          onClose={() => setIsWriterOpen(false)}
          apiBase={apiBase}
          onError={msg => setAppError(msg)}
        />

        <OpsMiniAgent
          isOpen={isOpsAgentOpen}
          onClose={() => setIsOpsAgentOpen(false)}
          apiBase={apiBase}
          onError={msg => setAppError(msg)}
          messages={activeState.messages}
          onInjectInteraction={injectOpsAgentInteraction}
        />
      </div>
    </>
  )
}

export default App
