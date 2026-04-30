const CONNECTION_TIMEOUT_MS = 10000

const LOCAL_BACKEND_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

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
  | 'retrieving'
  | 'responding'
  | 'speaking'
  | 'completed'

export type PipelineStatusState = 'connected' | 'started' | 'completed' | 'failed'

export type PipelineEvent =
  | { type: 'ack'; session_id: number; action: 'start_pipeline' }
  | { type: 'response_chunk'; session_id: number; content: string; chunk_index: number }
  | { type: 'audio_progress'; session_id: number; spoken_segments: number }
  | {
      type: 'status'
      session_id: number
      stage: PipelineStage
      state: PipelineStatusState
      message: string
      details: Record<string, unknown>
      timestamp: string
    }
  | {
      type: 'result'
      session_id: number
      transcript: string
      response: string
      audio_duration_seconds: number
      retrieved_context_count: number
      timings: Record<string, number>
      total_seconds: number
    }
  | {
      type: 'error'
      session_id: number
      stage: string
      message: string
      timings?: Record<string, number>
      total_seconds?: number
    }

const PIPELINE_STAGES: Set<PipelineStage> = new Set([
  'connected',
  'listening',
  'transcribing',
  'retrieving',
  'responding',
  'speaking',
  'completed'
])

const PIPELINE_STATUS_STATES: Set<PipelineStatusState> = new Set([
  'connected',
  'started',
  'completed',
  'failed'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNumber)
}

function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === 'string' && PIPELINE_STAGES.has(value as PipelineStage)
}

function isPipelineStatusState(value: unknown): value is PipelineStatusState {
  return typeof value === 'string' && PIPELINE_STATUS_STATES.has(value as PipelineStatusState)
}

export function parsePipelineEvent(rawData: string): PipelineEvent | null {
  try {
    const event = JSON.parse(rawData)
    if (!isRecord(event) || typeof event.type !== 'string' || !isNumber(event.session_id)) {
      return null
    }

    if (event.type === 'ack') {
      if (event.action !== 'start_pipeline') {
        return null
      }

      return {
        type: 'ack',
        session_id: event.session_id,
        action: 'start_pipeline'
      }
    }

    if (event.type === 'response_chunk') {
      if (typeof event.content !== 'string' || !isNumber(event.chunk_index)) {
        return null
      }

      return {
        type: 'response_chunk',
        session_id: event.session_id,
        content: event.content,
        chunk_index: event.chunk_index
      }
    }

    if (event.type === 'audio_progress') {
      if (!isNumber(event.spoken_segments)) {
        return null
      }

      return {
        type: 'audio_progress',
        session_id: event.session_id,
        spoken_segments: event.spoken_segments
      }
    }

    if (event.type === 'status') {
      if (
        !isPipelineStage(event.stage) ||
        !isPipelineStatusState(event.state) ||
        typeof event.message !== 'string' ||
        typeof event.timestamp !== 'string'
      ) {
        return null
      }

      return {
        type: 'status',
        session_id: event.session_id,
        stage: event.stage,
        state: event.state,
        message: event.message,
        details: isRecord(event.details) ? event.details : {},
        timestamp: event.timestamp
      }
    }

    if (event.type === 'result') {
      if (
        typeof event.transcript !== 'string' ||
        typeof event.response !== 'string' ||
        !isNumber(event.audio_duration_seconds) ||
        !isNumber(event.retrieved_context_count) ||
        !isNumberRecord(event.timings) ||
        !isNumber(event.total_seconds)
      ) {
        return null
      }

      return {
        type: 'result',
        session_id: event.session_id,
        transcript: event.transcript,
        response: event.response,
        audio_duration_seconds: event.audio_duration_seconds,
        retrieved_context_count: event.retrieved_context_count,
        timings: event.timings,
        total_seconds: event.total_seconds
      }
    }

    if (event.type === 'error') {
      if (typeof event.stage !== 'string' || typeof event.message !== 'string') {
        return null
      }

      return {
        type: 'error',
        session_id: event.session_id,
        stage: event.stage,
        message: event.message,
        timings: isNumberRecord(event.timings) ? event.timings : undefined,
        total_seconds: isNumber(event.total_seconds) ? event.total_seconds : undefined
      }
    }

    return null
  } catch {
    return null
  }
}

export type StartPipelinePayload = {
  conversationId?: number
}

export function buildStartPipelineMessage(payload?: StartPipelinePayload): string {
  if (payload?.conversationId && payload.conversationId > 0) {
    return JSON.stringify({ action: 'start_pipeline', conversation_id: payload.conversationId })
  }

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

  if (!LOCAL_BACKEND_HOSTS.has(backendUrl.hostname.toLowerCase())) {
    throw new Error(
      `VITE_BACKEND_URL must be localhost/loopback for offline mode: ${rawBackendUrl}`
    )
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
