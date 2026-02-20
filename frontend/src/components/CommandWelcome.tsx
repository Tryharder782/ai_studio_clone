import { useState } from 'react'
import DotWaveBackground from './DotWaveBackground.tsx'

interface CommandWelcomeProps {
  onContinue: () => void
}

export default function CommandWelcome({ onContinue }: CommandWelcomeProps) {
  const [leaving, setLeaving] = useState(false)

  const handleContinue = () => {
    setLeaving(true)
    window.setTimeout(() => onContinue(), 420)
  }

  return (
    <div className={`fixed inset-0 z-[210] overflow-hidden bg-black transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
      <DotWaveBackground className="absolute inset-0 h-full w-full opacity-95" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
      <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
        <div className="w-full max-w-3xl rounded-3xl border border-zinc-800/80 bg-black/45 p-8 text-center backdrop-blur-md md:p-12">
          <div className="mb-4 inline-flex items-center rounded-full border border-zinc-700/80 px-4 py-1 text-[11px] uppercase tracking-[0.22em] text-zinc-300">
            Ops Core Ready
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Командный Центр Готов
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 md:text-base">
            Операционная система собрала контекст, обновила сигналы и готова продолжить управление стратегией, воронкой и delivery.
          </p>
          <button
            onClick={handleContinue}
            className="mt-8 inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-8 text-sm font-medium text-black transition-all duration-300 hover:scale-[1.02] hover:bg-zinc-200"
          >
            Продолжить командование
          </button>
        </div>
      </div>
    </div>
  )
}
