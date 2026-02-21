import { useEffect, useRef } from 'react'

interface DotWaveBackgroundProps {
  className?: string
}

const DOT_GAP = 20
const BASE_ALPHA = 0.16
const WAVE_ALPHA = 0.42

export default function DotWaveBackground({ className = '' }: DotWaveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let raf = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      const time = frame * 0.007
      const amp = Math.max(16, height * 0.06)
      const centerY = height * 0.58

      for (let x = -DOT_GAP; x <= width + DOT_GAP; x += DOT_GAP) {
        for (let y = -DOT_GAP; y <= height + DOT_GAP; y += DOT_GAP) {
          const waveA = Math.sin(x * 0.012 + time * 2.2)
          const waveB = Math.cos(y * 0.017 - time * 1.6)
          const bend = Math.sin((x + y) * 0.008 + time * 1.1)
          const wave = (waveA + waveB + bend) / 3

          const py = y + wave * amp + Math.sin((x - y) * 0.004 + time) * 4
          const depth = 1 - Math.min(1, Math.abs(py - centerY) / (height * 0.8))
          const alpha = BASE_ALPHA + Math.max(0, wave) * WAVE_ALPHA * depth
          const radius = 0.9 + depth * 0.7 + Math.max(0, wave) * 0.5

          ctx.beginPath()
          ctx.arc(x, py, radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`
          ctx.fill()
        }
      }

      frame += 1
      raf = window.requestAnimationFrame(draw)
    }

    resize()
    draw()

    const handleResize = () => resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
