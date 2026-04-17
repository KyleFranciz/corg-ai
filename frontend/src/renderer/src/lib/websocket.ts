const CONNECTION_TIMEOUT_MS = 10000

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
