const CONNECTION_TIMEOUT_MS = 10000

const CLOSE_CODE_HINTS: Record<number, string> = {
  1000: 'normal closure',
  1001: 'server or client went away',
  1006: 'connection dropped unexpectedly',
  1008: 'request rejected by server policy',
  1009: 'message too large',
  1011: 'server hit an internal error',
  1012: 'server is restarting',
  1013: 'server is overloaded, retry shortly'
}

export type PipelineStage =
  | 'connected'
  | 'listening'
  | 'transcribing'
  | 'responding'
  | 'speaking'
  | 'completed'

export type PipelineEvent =
  | { type: 'ack'; action: 'start_pipeline' }
  | { type: 'status'; stage: PipelineStage; message: string }
  | { type: 'result'; transcript: string; response: string; audio_duration_seconds: number }
  | { type: 'error'; stage: string; message: string }

export function parsePipelineEvent(rawData: string): PipelineEvent | null {
  try {
    const event = JSON.parse(rawData)
    if (!event || typeof event !== 'object' || !('type' in event)) {
      return null
    }

    const eventType = event.type
    if (eventType !== 'ack' && eventType !== 'status' && eventType !== 'result' && eventType !== 'error') {
      return null
    }

    return event as PipelineEvent
  } catch {
    return null
  }
}

export function buildStartPipelineMessage(): string {
  return JSON.stringify({ action: 'start_pipeline' })
}

function normalizeBackendUrl(rawBackendUrl: string): URL {
  let backendUrl: URL

  try {
    backendUrl = new URL(rawBackendUrl)
  } catch {
    throw new Error(`Invalid VITE_BACKEND_URL: ${rawBackendUrl}`)
  }

  if (backendUrl.hostname === '0.0.0.0') {
    backendUrl.hostname = '127.0.0.1'
  }

  return backendUrl
}

export function getWebSocketUrl(): string {
  const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim()

  if (!rawBackendUrl) {
    throw new Error('Missing VITE_BACKEND_URL in frontend environment')
  }

  const backendUrl = normalizeBackendUrl(rawBackendUrl)
  backendUrl.protocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  backendUrl.pathname = '/api/v1/ws'
  backendUrl.search = ''
  backendUrl.hash = ''

  return backendUrl.toString()
}

export function getHealthUrl(): string {
  const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim()

  if (!rawBackendUrl) {
    throw new Error('Missing VITE_BACKEND_URL in frontend environment')
  }

  const backendUrl = normalizeBackendUrl(rawBackendUrl)
  backendUrl.pathname = '/api/v1/health'
  backendUrl.search = ''
  backendUrl.hash = ''

  return backendUrl.toString()
}

export async function verifyBackendHealth(): Promise<void> {
  const healthUrl = getHealthUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

  try {
    const response = await fetch(healthUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Backend health check failed (${response.status})`)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Backend health check timed out: ${healthUrl}`)
    }

    const message = error instanceof Error ? error.message : 'Unknown backend health check error'
    throw new Error(`${message}: ${healthUrl}`)
  } finally {
    window.clearTimeout(timeout)
  }
}

export function describeWebSocketClose(event: CloseEvent): string {
  const hint = CLOSE_CODE_HINTS[event.code] ?? 'unknown reason'
  if (event.reason) {
    return `WebSocket closed (code ${event.code}: ${hint}, reason: ${event.reason})`
  }

  return `WebSocket closed (code ${event.code}: ${hint})`
}

export function testWebSocketConnection(): Promise<string> {
  const websocketUrl = getWebSocketUrl()

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl)
    let settled = false

    const timeout = window.setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      socket.close()
      reject(new Error(`WebSocket connection timed out: ${websocketUrl}`))
    }, CONNECTION_TIMEOUT_MS)

    socket.onopen = (): void => {
      console.log('[ws] connected', websocketUrl)
    }

    socket.onmessage = (event: MessageEvent): void => {
      console.log('[ws] message', event.data)

      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      resolve(event.data)
      socket.close()
    }

    socket.onerror = (): void => {
      console.error('[ws] connection error', websocketUrl)

      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      reject(new Error(`WebSocket connection failed: ${websocketUrl}`))
      socket.close()
    }

    socket.onclose = (event: CloseEvent): void => {
      console.log('[ws] closed', event.code, event.reason)

      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      reject(
        new Error(
          `WebSocket closed before receiving a message (code ${event.code}${event.reason ? `, reason: ${event.reason}` : ''}): ${websocketUrl}`
        )
      )
    }
  })
}
