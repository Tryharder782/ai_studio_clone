import React, { useRef, useState } from 'react'
import type { Message } from '../types.ts'
import ThoughtProcess from './ThoughtProcess.tsx'
import AttachmentCard from './AttachmentCard.tsx'
import LightboxPreview from './LightboxPreview.tsx'
import MessageAttachment from './MessageAttachment.tsx'
import DraftOpportunityCard from './DraftOpportunityCard.tsx'
import DraftStageUpdateCard from './DraftStageUpdateCard.tsx'
import DraftOpportunityUpdateCard from './DraftOpportunityUpdateCard.tsx'
import DraftPostmortemCard from './DraftPostmortemCard.tsx'
import DraftExecutionProjectCard from './DraftExecutionProjectCard.tsx'
import ReactMarkdown from 'react-markdown'

interface ChatProps {
  messages: Message[]
  onSend: (text: string, files: File[]) => void
  isLoading: boolean
  historyLoaded: boolean
  onLoadHistory: () => void
  onLoadMore: () => void
  hasMore: boolean
  missingApiKey?: boolean
  apiBase?: string
}

export default function ChatInterface({
  messages,
  onSend,
  isLoading,
  historyLoaded,
  onLoadHistory,
  onLoadMore,
  hasMore,
  missingApiKey = false,
  apiBase,
}: ChatProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [previewData, setPreviewData] = useState<{ name: string; type: string; url: string; size: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [executorStatus, setExecutorStatus] = useState<'idle' | 'working' | 'report_ready'>('idle')

  React.useEffect(() => {
    if (!apiBase || !historyLoaded) return
    let isMounted = true

    const checkStatus = async () => {
      try {
        const res = await fetch(`${apiBase}/api/workspace/status?project_id=default`)
        if (!res.ok) return
        const data = await res.json()
        if (isMounted) {
          if (data.status === 'report_ready') {
            setExecutorStatus('report_ready')
          } else if (data.status === 'working') {
            setExecutorStatus('working')
          } else {
            setExecutorStatus('idle')
          }
        }
      } catch (e) {
        // ignore
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [apiBase, historyLoaded])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isAtTop = Math.abs(target.scrollTop) + target.clientHeight >= target.scrollHeight - 5

    if (isAtTop && hasMore && !isLoading && messages.length > 0) {
      onLoadMore()
    }
  }

  const handleSend = () => {
    if (!input.trim() && attachments.length === 0) return
    onSend(input, attachments)
    setInput('')
    setAttachments([])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setAttachments(prev => [...prev, ...files])
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const files: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      setAttachments(prev => [...prev, ...files])
    }
  }

  if (!historyLoaded) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Добро пожаловать обратно, стратег.</h1>
        <p className="text-gray-400 mb-8 max-w-md">
          {missingApiKey
            ? 'API-ключ не найден. Добавь GOOGLE_API_KEY (или GEMINI_API_KEY) в .env и перезапусти backend.'
            : 'Готов восстановить контекст чата из локальной истории?'}
        </p>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <button
            onClick={onLoadHistory}
            disabled={isLoading || missingApiKey}
            className="bg-[#A8C7FA] text-[#041E49] font-medium p-3 rounded-full hover:bg-[#D3E3FD] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Восстанавливаю контекст...' : 'Восстановить чат'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <LightboxPreview data={previewData} onClose={() => setPreviewData(null)} />

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col-reverse gap-6">
        {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-4 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0 animate-pulse" />
            <div className="text-[#A8C7FA] self-center font-medium animate-thinking tracking-wide">
              Думаю...
            </div>
          </div>
        )}

        {[...messages].reverse().map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0" />
            )}
            <div className={`group/msg flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[80%]`}>
              <div className={`w-full ${msg.role === 'user' ? 'bg-[#28292A] rounded-2xl rounded-tr-sm p-4' : ''}`}>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-col gap-3 mb-3">
                    {msg.attachments.map((att, attIdx) => (
                      <MessageAttachment
                        key={attIdx}
                        name={att.name}
                        type={att.type}
                        size={att.size}
                        url={att.url}
                        onClick={() => setPreviewData(att)}
                      />
                    ))}
                  </div>
                )}

                {(() => {
                  const fullText = msg.parts.join('')
                  // Extract TOOL_DRAFT blocks
                  const toolDraftRegex = /\[TOOL_DRAFT\](.*?)\[\/TOOL_DRAFT\]/gs
                  const drafts: Array<{ type: string; tool: string; payload: Record<string, unknown> }> = []
                  let match: RegExpExecArray | null
                  while ((match = toolDraftRegex.exec(fullText)) !== null) {
                    try {
                      drafts.push(JSON.parse(match[1]))
                    } catch { /* skip malformed */ }
                  }
                  // Strip TOOL_DRAFT blocks from text for normal rendering
                  const cleanText = fullText.replace(toolDraftRegex, '').trim()
                  return (
                    <>
                      {cleanText && (
                        <div
                          className="prose prose-invert prose-sm max-w-none text-left leading-snug
                          break-words whitespace-pre-wrap
                          prose-blockquote:border-l-2 prose-blockquote:border-gray-500 prose-blockquote:pl-4 prose-blockquote:my-1 prose-blockquote:not-italic
                          prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-p:pl-4 prose-p:-indent-4
                          prose-strong:font-bold prose-strong:text-white"
                          style={{ wordBreak: 'normal', overflowWrap: 'anywhere' }}
                        >
                          {cleanText.split('[THOUGHT_BLOCK]').map((segment, sIdx) => {
                            if (segment.includes('[/THOUGHT_BLOCK]')) {
                              const [thought, ...rest] = segment.split('[/THOUGHT_BLOCK]')
                              const response = rest.join('')
                              return (
                                <React.Fragment key={sIdx}>
                                  <ThoughtProcess content={thought} />
                                  <ReactMarkdown>{response}</ReactMarkdown>
                                </React.Fragment>
                              )
                            }
                            if (!segment.trim()) return null
                            return <ReactMarkdown key={sIdx}>{segment}</ReactMarkdown>
                          })}
                        </div>
                      )}
                      {drafts.map((draft, dIdx) => {
                        const base = apiBase || ''
                        const handleRevision = (text: string) => onSend(text, [])
                        if (draft.tool === 'propose_opportunity') {
                          return <DraftOpportunityCard key={`draft-${dIdx}`} payload={draft.payload as never} apiBase={base} onRequestRevision={handleRevision} />
                        }
                        if (draft.tool === 'propose_stage_update') {
                          return <DraftStageUpdateCard key={`draft-${dIdx}`} payload={draft.payload as never} apiBase={base} onRequestRevision={handleRevision} />
                        }
                        if (draft.tool === 'propose_opportunity_update') {
                          return <DraftOpportunityUpdateCard key={`draft-${dIdx}`} payload={draft.payload as never} apiBase={base} onRequestRevision={handleRevision} />
                        }
                        if (draft.tool === 'propose_postmortem') {
                          return <DraftPostmortemCard key={`draft-${dIdx}`} payload={draft.payload as never} apiBase={base} onRequestRevision={handleRevision} />
                        }
                        if (draft.tool === 'propose_execution_project') {
                          return <DraftExecutionProjectCard key={`draft-${dIdx}`} payload={draft.payload as never} apiBase={base} onRequestRevision={handleRevision} />
                        }
                        return null
                      })}
                    </>
                  )
                })()}
              </div>
              {msg.role === 'user' && (
                <button
                  onClick={() => onSend(msg.parts.join('').trim(), [])}
                  disabled={isLoading}
                  title="Try again"
                  className="mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && hasMore && (
          <div className="flex justify-center py-2 text-gray-500 text-xs italic">
            Загружаю предыдущие сообщения...
          </div>
        )}
      </div>

      {executorStatus !== 'idle' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 backdrop-blur-md shadow-lg">
          {executorStatus === 'working' && (
            <>
              <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
              <span>Executor is working...</span>
            </>
          )}
          {executorStatus === 'report_ready' && (
            <>
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-300">Execution Report Ready</span>
            </>
          )}
        </div>
      )}

      <div
        className="p-3 md:p-4 bg-[#131314] relative pb-safe"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-2 rounded-3xl border-2 border-dashed border-blue-400 bg-blue-400/10 z-10 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-blue-400 bg-white rounded-lg px-4 py-2 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span className="font-medium text-black">Отпусти файлы здесь</span>
            </div>
          </div>
        )}

        <div className={`bg-[#1E1F20] rounded-3xl p-2 flex flex-col border transition-colors ${isDragging ? 'border-blue-400' : 'border-[#2A2A2A] focus-within:border-gray-500'}`}>
          <textarea
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Введите запрос"
            className="bg-transparent outline-none text-[#E3E3E3] p-3 resize-none h-[56px] md:h-[80px] w-full"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />

          {attachments.length > 0 && (
            <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
              {attachments.map((file, idx) => (
                <AttachmentCard
                  key={idx}
                  file={file}
                  onRemove={() => removeAttachment(idx)}
                  onClick={() =>
                    setPreviewData({
                      name: file.name,
                      type: file.type,
                      url: URL.createObjectURL(file),
                      size: file.size,
                    })
                  }
                />
              ))}
            </div>
          )}

          <div className="flex justify-between items-center px-2 pb-1">
            <div className="flex gap-1 text-gray-400">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-[#2A2A2A] rounded-full"
                title="Прикрепить файл"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.json,.csv,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.md"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              className="px-4 py-2 bg-[#E3E3E3] text-black rounded-full hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              Отправить
              <span className="text-gray-500 hidden md:inline">Ctrl + Enter</span>
            </button>
          </div>
        </div>
        <div className="text-center text-xs text-gray-500 mt-2 px-2">
          Проверяй факты: модель может ошибаться в деталях.
        </div>
      </div>
    </div>
  )
}
