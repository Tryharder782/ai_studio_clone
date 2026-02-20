import { useState } from 'react'

interface SyncDriveModalProps {
  isOpen: boolean
  onClose: () => void
  apiBase: string
}

export default function SyncDriveModal({ isOpen, onClose, apiBase }: SyncDriveModalProps) {
  const [links, setLinks] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [status, setStatus] = useState<'' | 'success' | 'error'>('')
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) return null

  const handleSync = async () => {
    setIsSyncing(true)
    setStatus('')
    setErrorMessage('')

    try {
      const res = await fetch(`${apiBase}/api/sync_drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links_string: links }),
      })

      if (res.ok) {
        setStatus('success')
        setTimeout(() => {
          onClose()
          window.location.reload()
        }, 1500)
      } else {
        const data = await res.json().catch(() => null)
        setStatus('error')
        setErrorMessage(typeof data?.detail === 'string' ? data.detail : 'Синхронизация не удалась. Проверь backend лог.')
      }
    } catch {
      setStatus('error')
      setErrorMessage('Сетевая ошибка во время синхронизации.')
    }

    setIsSyncing(false)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[#1E1F20] border border-[#333] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-[#333] flex items-center justify-between">
          <h2 className="text-lg font-medium">Синхронизация файлов Google Drive</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#28292A] rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-gray-400">
            Вставь строку с ссылками Google Drive. Система скачает файлы и заменит заглушки в истории чатов.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Строка ссылок</span>
            <textarea
              value={links}
              onChange={e => setLinks(e.target.value)}
              placeholder="Вставь ссылки сюда..."
              className="w-full h-40 bg-[#0D0D0D] border border-[#333] rounded-xl p-4 text-sm focus:outline-none focus:border-[#A8C7FA] transition-colors resize-none"
            />
          </label>

          {status === 'success' && <div className="text-green-400 text-sm">Синхронизация завершена. Перезагружаю...</div>}
          {status === 'error' && <div className="text-red-400 text-sm">{errorMessage || 'Синхронизация не удалась.'}</div>}
        </div>

        <footer className="px-6 py-4 border-t border-[#333] flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 text-sm font-medium hover:bg-[#28292A] rounded-full transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`px-8 py-2 text-sm font-medium rounded-full transition-all ${
              isSyncing ? 'bg-gray-600 cursor-wait' : 'bg-[#A8C7FA] text-[#041E49] hover:bg-[#D3E3FD]'
            }`}
          >
            {isSyncing ? 'Синхронизирую...' : 'Запустить синхронизацию'}
          </button>
        </footer>
      </div>
    </div>
  )
}
