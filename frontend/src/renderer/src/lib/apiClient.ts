import axios from 'axios'
import type { AxiosInstance } from 'axios'

const LOCAL_BACKEND_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function getValidatedBackendUrl(): string {
  const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim()
  if (!rawBackendUrl) {
    throw new Error('Missing VITE_BACKEND_URL in frontend environment')
  }

  let parsed: URL
  try {
    parsed = new URL(rawBackendUrl)
  } catch {
    throw new Error(`Invalid VITE_BACKEND_URL: ${rawBackendUrl}`)
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!LOCAL_BACKEND_HOSTS.has(hostname)) {
    throw new Error(`VITE_BACKEND_URL must be localhost/loopback for offline mode: ${rawBackendUrl}`)
  }

  return rawBackendUrl
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${getValidatedBackendUrl()}/api/v1`,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
})
