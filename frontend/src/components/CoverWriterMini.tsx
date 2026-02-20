import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface CoverWriterMiniProps {
  isOpen: boolean
  onClose: () => void
  apiBase: string
  onError: (message: string) => void
}

type WriterMode = 'draft' | 'rewrite' | 'polish'

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = (value as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (detail) return JSON.stringify(detail)
  }
  return fallback
}

export default function CoverWriterMini({ isOpen, onClose, apiBase, onError }: CoverWriterMiniProps) {
  const [mode, setMode] = useState<WriterMode>('draft')
  const [instruction, setInstruction] = useState('Напиши короткое cover letter под мою текущую целевую вакансию.')
  const [tokenBudget, setTokenBudget] = useState(1000)
  const [latestTurnsCount, setLatestTurnsCount] = useState(5)
  const [output, setOutput] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isSyncingMemory, setIsSyncingMemory] = useState(false)
  const [memoryVersion, setMemoryVersion] = useState<number | null>(null)
  const [contextTokens, setContextTokens] = useState<number | null>(null)

  const modeLabel = useMemo(() => {
    if (mode === 'rewrite') return 'Переписывание'
    if (mode === 'polish') return 'Полировка'
    return 'Черновик'
  }, [mode])

  useEffect(() => {
    if (!isOpen) return
    void refreshContextPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const refreshContextPreview = async () => {
    try {
      const res = await fetch(`${apiBase}/api/memory/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'draft_cover_letter',
          token_budget: tokenBudget,
          latest_turns_count: latestTurnsCount,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(data, 'Не удалось собрать контекст для writer'))
        return
      }
      setMemoryVersion(data.memory_version ?? null)
      setContextTokens(data.input_token_estimate ?? null)
    } catch {
      onError('Сетевая ошибка при обновлении контекста writer.')
    }
  }

  const rebuildMemory = async () => {
    setIsSyncingMemory(true)
    try {
      const res = await fetch(`${apiBase}/api/memory/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_size: 40,
          overlap: 4,
          include_attachments: true,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(data, 'Не удалось пересобрать память'))
        return
      }
      setMemoryVersion(data.version ?? null)
      await refreshContextPreview()
      onError('')
    } catch {
      onError('Сетевая ошибка при пересборке памяти.')
    } finally {
      setIsSyncingMemory(false)
    }
  }

  const runWriter = async () => {
    if (!instruction.trim()) return
    setIsBusy(true)
    try {
      const res = await fetch(`${apiBase}/api/cover_writer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          mode,
          token_budget: tokenBudget,
          latest_turns_count: latestTurnsCount,
          task: 'draft_cover_letter',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        onError(toErrorMessage(data, 'Ошибка запроса к writer'))
        return
      }
      setOutput(data.text || '')
      setMemoryVersion(data.memory_version ?? null)
      setContextTokens(data.input_token_estimate ?? null)
      onError('')
    } catch {
      onError('Сетевая ошибка при генерации cover letter.')
    } finally {
      setIsBusy(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-end p-3 md:p-5">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="relative w-full max-w-[640px] h-[80vh] md:h-[84vh] bg-[#1A1B1C] border border-[#2E2F30] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b border-[#2E2F30] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm md:text-base font-semibold text-[#E3E3E3]">Cover Writer</h2>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#263321] text-[#CFF0B8] uppercase tracking-wider">Flash model</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-[#262728] text-gray-300"
            title="Закрыть writer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="p-4 border-b border-[#2E2F30] grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400">Режим</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as WriterMode)}
              className="bg-[#111213] border border-[#333] rounded-lg p-2 text-sm outline-none"
            >
              <option value="draft">Черновик</option>
              <option value="rewrite">Переписать</option>
              <option value="polish">Улучшить</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-5 md:pt-0 md:items-end">
            <button
              onClick={refreshContextPreview}
              className="px-3 py-2 text-xs rounded-lg bg-[#2A2B2C] hover:bg-[#343536] transition-colors"
            >
              Обновить контекст
            </button>
            <button
              onClick={rebuildMemory}
              disabled={isSyncingMemory}
              className="px-3 py-2 text-xs rounded-lg bg-[#2A2B2C] hover:bg-[#343536] transition-colors disabled:opacity-50"
            >
              {isSyncingMemory ? 'Пересборка...' : 'Пересобрать память'}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Бюджет токенов</label>
            <input
              type="number"
              min={400}
              max={4000}
              step={100}
              value={tokenBudget}
              onChange={e => setTokenBudget(Number(e.target.value) || 1000)}
              className="bg-[#111213] border border-[#333] rounded-lg p-2 text-sm outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Последние сообщения стратега</label>
            <input
              type="number"
              min={2}
              max={12}
              step={1}
              value={latestTurnsCount}
              onChange={e => setLatestTurnsCount(Number(e.target.value) || 5)}
              className="bg-[#111213] border border-[#333] rounded-lg p-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="px-4 py-2 border-b border-[#2E2F30] text-xs text-gray-400 flex flex-wrap gap-3">
          <span>Роль: {modeLabel}</span>
          <span>Версия памяти: {memoryVersion ?? '-'}</span>
          <span>Токены контекста: {contextTokens ?? '-'}/{tokenBudget}</span>
        </div>

        <div className="p-4 border-b border-[#2E2F30]">
          <label className="text-xs text-gray-400">Инструкция</label>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Опиши, какое письмо нужно..."
            className="mt-2 w-full h-28 bg-[#111213] border border-[#333] rounded-lg p-3 text-sm resize-none outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setInstruction('Напиши персонализированное cover letter (180-240 слов), с акцентом на релевантный опыт и измеримый результат.')}
              className="px-2 py-1 text-xs rounded bg-[#2A2B2C] hover:bg-[#343536]"
            >
              Быстрый черновик
            </button>
            <button
              onClick={() => setInstruction('Перепиши письмо в более формальном тоне, убери воду, сохрани факты и конкретные результаты.')}
              className="px-2 py-1 text-xs rounded bg-[#2A2B2C] hover:bg-[#343536]"
            >
              Формальный стиль
            </button>
            <button
              onClick={() => setInstruction('Отполируй грамматику и ясность без изменения фактов. Сделай текст лаконичным и уверенным.')}
              className="px-2 py-1 text-xs rounded bg-[#2A2B2C] hover:bg-[#343536]"
            >
              Полировка
            </button>
            <button
              onClick={runWriter}
              disabled={isBusy || !instruction.trim()}
              className="ml-auto px-4 py-1.5 text-xs rounded bg-[#A8C7FA] text-[#041E49] hover:bg-[#D3E3FD] disabled:opacity-60"
            >
              {isBusy ? 'Генерирую...' : 'Сгенерировать'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {output ? (
            <div className="prose prose-invert prose-sm max-w-none text-left leading-snug break-words whitespace-pre-wrap">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Здесь появится сгенерированное cover letter.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
