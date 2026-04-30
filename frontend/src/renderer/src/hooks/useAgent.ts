import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildStartPipelineMessage,
  describeWebSocketClose,
  getWebSocketUrl,
  parsePipelineEvent,
  verifyBackendHealth,
  type PipelineStage,
  type PipelineStatusState
} from '@renderer/lib/websocket'

const MAX_RECONNECT_ATTEMPTS = 5
const BASE_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 8000

export type AgentConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

export type UseAgentResult = {
  websocketTarget: string
  connectionState: AgentConnectionState
  agentStatus: AgentStatus
  isRunning: boolean
  pipelineStage: PipelineStage | null
  pipelineState: PipelineStatusState | null
  statusMessage: string | null
  transcript: string | null
  response: string | null
  audioDuration: number | null
  history: ConversationTurn[]
  wsError: string | null
  reconnectAttempt: number
  connect: () => Promise<void>
  startPipeline: (options?: { conversationId?: number }) => Promise<void>
  disconnect: () => void
}

export type ConversationTurn = {
  sessionId: number
  transcript: string
  response: string
  audioDurationSeconds: number
  retrievedContextCount: number
  totalSeconds: number
  timestamp: string
}

function mapStageToAgentStatus(stage: PipelineStage | null): AgentStatus {
  if (stage === 'listening') {
    return 'listening'
  }

  if (stage === 'speaking') {
    return 'speaking'
  }

  if (stage === 'transcribing' || stage === 'retrieving' || stage === 'responding') {
    return 'thinking'
  }

  return 'idle'
}

// function to handle keeping the connection open with the agent on the backend
export function useAgent(): UseAgentResult {
  const socketRef = useRef<WebSocket | null>(null)
  const connectPromiseRef = useRef<Promise<void> | null>(null)
  const connectFnRef = useRef<(() => Promise<void>) | null>(null)

  const [connectionState, setConnectionState] = useState<AgentConnectionState>('idle')
  const [isRunning, setIsRunning] = useState(false)
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null)
  const [pipelineState, setPipelineState] = useState<PipelineStatusState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [response, setResponse] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [history, setHistory] = useState<ConversationTurn[]>([])
  const [wsError, setWsError] = useState<string | null>(null)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  const reconnectAttemptRef = useRef(0)
  const intentionallyDisconnectedRef = useRef(false)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)

  const websocketTarget = (() => {
    try {
      return getWebSocketUrl()
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to resolve WebSocket URL'
    }
  })()

  const cleanupSocketRef = useCallback((): void => {
    socketRef.current = null
    connectPromiseRef.current = null
  }, [])

  const attemptConnect = useCallback(async (): Promise<boolean> => {
    try {
      await verifyBackendHealth()
    } catch {
      return false
    }

    return new Promise((resolve) => {
      const socket = new WebSocket(websocketTarget)
      socketRef.current = socket

      let settled = false

      socket.onopen = () => {
        setConnectionState('connected')
        setWsError(null)
        reconnectAttemptRef.current = 0
        setReconnectAttempt(0)
        if (!settled) {
          settled = true
          resolve(true)
        }
      }

      socket.onmessage = (event) => {
        const pipelineEvent = parsePipelineEvent(event.data)
        if (!pipelineEvent) {
          return
        }

        if (pipelineEvent.type === 'response_chunk') {
          setResponse((previous) => `${previous ?? ''}${pipelineEvent.content}`)
          return
        }

        if (pipelineEvent.type === 'audio_progress') {
          return
        }

        if (pipelineEvent.type === 'status') {
          setPipelineStage(pipelineEvent.stage)
          setPipelineState(pipelineEvent.state)
          setStatusMessage(pipelineEvent.message)

          if (pipelineEvent.state === 'failed') {
            setIsRunning(false)
          }

          return
        }

        if (pipelineEvent.type === 'result') {
          setTranscript(pipelineEvent.transcript)
          setResponse(pipelineEvent.response)
          setAudioDuration(pipelineEvent.audio_duration_seconds)
          setIsRunning(false)
          setHistory((previous) => [
            ...previous,
            {
              sessionId: pipelineEvent.session_id,
              transcript: pipelineEvent.transcript,
              response: pipelineEvent.response,
              audioDurationSeconds: pipelineEvent.audio_duration_seconds,
              retrievedContextCount: pipelineEvent.retrieved_context_count,
              totalSeconds: pipelineEvent.total_seconds,
              timestamp: new Date().toISOString()
            }
          ])
          return
        }

        if (pipelineEvent.type === 'error') {
          setIsRunning(false)
          setPipelineState('failed')
          setStatusMessage(pipelineEvent.message)
          setWsError(pipelineEvent.message)
        }
      }

      socket.onerror = () => {
        setConnectionState('error')
        setWsError('WebSocket encountered an unexpected error')
      }

      socket.onclose = (event) => {
        cleanupSocketRef()

        if (intentionallyDisconnectedRef.current || !shouldReconnectRef.current) {
          setConnectionState('closed')
          if (!settled) {
            settled = true
            resolve(false)
          }
          return
        }

        const attempt = reconnectAttemptRef.current
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          setConnectionState('error')
          setIsRunning(false)
          setWsError(
            `Connection lost after ${MAX_RECONNECT_ATTEMPTS} attempts. ${describeWebSocketClose(event)}`
          )
          if (!settled) {
            settled = true
            resolve(false)
          }
          return
        }

        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY_MS
        )
        reconnectAttemptRef.current = attempt + 1
        setReconnectAttempt(attempt + 1)
        setConnectionState('connecting')
        setWsError(describeWebSocketClose(event))

        reconnectTimeoutRef.current = window.setTimeout(async () => {
          const reconnect = connectFnRef.current
          if (!reconnect) {
            if (!settled) {
              settled = true
              resolve(false)
            }
            return
          }

          try {
            await reconnect()
            if (!settled) {
              settled = true
              resolve(true)
            }
          } catch {
            if (!settled) {
              settled = true
              resolve(false)
            }
          }
        }, delay)
      }
    })
  }, [websocketTarget, cleanupSocketRef])

  const connect = useCallback(async (): Promise<void> => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return
    }

    if (connectPromiseRef.current) {
      return connectPromiseRef.current
    }

    setConnectionState('connecting')
    setWsError(null)
    reconnectAttemptRef.current = 0
    setReconnectAttempt(0)
    intentionallyDisconnectedRef.current = false
    shouldReconnectRef.current = true

    const promise = (async () => {
      await attemptConnect()
    })()

    connectPromiseRef.current = promise

    try {
      await promise
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to connect to backend WebSocket'
      setConnectionState('error')
      setWsError(message)
      cleanupSocketRef()
      throw error
    } finally {
      connectPromiseRef.current = null
    }
  }, [attemptConnect, cleanupSocketRef])

  useEffect(() => {
    connectFnRef.current = connect
  }, [connect])

  const startPipeline = useCallback(
    async (options?: { conversationId?: number }): Promise<void> => {
      if (isRunning) {
        return
      }

      setPipelineStage(null)
      setPipelineState(null)
      setStatusMessage(null)
      setTranscript(null)
      setResponse(null)
      setAudioDuration(null)
      setWsError(null)

      try {
        await connect()

        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket is not connected')
        }

        setIsRunning(true)
        socket.send(buildStartPipelineMessage(options))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to start WebSocket pipeline'
        setIsRunning(false)
        setConnectionState('error')
        setWsError(message)
      }
    },
    [connect, isRunning]
  )

  const disconnect = useCallback((): void => {
    intentionallyDisconnectedRef.current = true
    shouldReconnectRef.current = false

    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    const socket = socketRef.current
    if (socket) {
      socket.close(1000, 'Disconnected by client')
    }

    cleanupSocketRef()
    reconnectAttemptRef.current = 0
    setReconnectAttempt(0)
    setConnectionState('closed')
    setIsRunning(false)
    setPipelineState(null)
    setPipelineStage(null)
    setStatusMessage('Disconnected')
  }, [cleanupSocketRef])

  useEffect(() => {
    return () => {
      intentionallyDisconnectedRef.current = true
      shouldReconnectRef.current = false

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }

      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounted')
      }
      cleanupSocketRef()
    }
  }, [cleanupSocketRef])

  return {
    websocketTarget,
    connectionState,
    agentStatus: mapStageToAgentStatus(pipelineStage),
    isRunning,
    pipelineStage,
    pipelineState,
    statusMessage,
    transcript,
    response,
    audioDuration,
    history,
    wsError,
    reconnectAttempt,
    connect,
    startPipeline,
    disconnect
  }
}
