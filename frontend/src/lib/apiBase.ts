const STORAGE_KEY = 'workboost_api_base'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const normalizeApiBase = (raw: string): string => {
  const value = (raw || '').trim()
  if (!value) return ''
  return trimTrailingSlash(value)
}

export const resolveApiBase = (): string => {
  const envBase = normalizeApiBase(String(import.meta.env.VITE_API_BASE || ''))
  if (envBase) return envBase

  try {
    const stored = normalizeApiBase(window.localStorage.getItem(STORAGE_KEY) || '')
    if (stored) return stored
  } catch {
    // Ignore localStorage errors.
  }

  // Dev fallback: Vite usually runs on :5173 and backend on :8000.
  if (window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }

  // Production/default: same-origin backend.
  return trimTrailingSlash(window.location.origin)
}

export const resolveWsBase = (apiBase: string): string => {
  try {
    const url = new URL(apiBase)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    url.hash = ''
    return trimTrailingSlash(url.toString())
  } catch {
    const prefix = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${prefix}://${window.location.hostname || 'localhost'}:8000/ws`
  }
}

export const saveApiBase = (raw: string): string => {
  const normalized = normalizeApiBase(raw)
  if (!normalized) return ''
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized)
  } catch {
    // Ignore storage errors.
  }
  return normalized
}

export const clearSavedApiBase = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors.
  }
}

