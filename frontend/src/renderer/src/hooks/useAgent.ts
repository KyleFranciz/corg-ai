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
  wsError: string | null
  connect: () => Promise<void>
  startPipeline: () => Promise<void>
  disconnect: () => void
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

function formatPipelineError(stage: string, message: string): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('error querying device -1') ||
    normalized.includes('no default input device') ||
    normalized.includes('invalid input device')
  ) {
    return `[${stage}] ${message}. Hint: no default microphone was detected. Select/set a valid input device on your host OS and retry.`
  }

  return `[${stage}] ${message}`
}

export function useAgent(): UseAgentResult {
  const socketRef = useRef<WebSocket | null>(null)
  const connectPromiseRef = useRef<Promise<void> | null>(null)

  const [connectionState, setConnectionState] = useState<AgentConnectionState>('idle')
  const [isRunning, setIsRunning] = useState(false)
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null)
  const [pipelineState, setPipelineState] = useState<PipelineStatusState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [response, setResponse] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)

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

  const connect = useCallback(async (): Promise<void> => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return
    }

    if (connectPromiseRef.current) {
      return connectPromiseRef.current
    }

    setConnectionState('connecting')
    setWsError(null)

    const connectPromise = (async () => {
      await verifyBackendHealth()

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(websocketTarget)
        socketRef.current = socket

        let settled = false

        socket.onopen = (): void => {
          setConnectionState('connected')
          if (!settled) {
            settled = true
            resolve()
          }
        }

        socket.onmessage = (event: MessageEvent): void => {
          const rawData = typeof event.data === 'string' ? event.data : null
          if (!rawData) {
            return
          }

          const parsedEvent = parsePipelineEvent(rawData)
          if (!parsedEvent) {
            return
          }

          if (parsedEvent.type === 'ack') {
            setWsError(null)
            return
          }

          if (parsedEvent.type === 'status') {
            setPipelineStage(parsedEvent.stage)
            setPipelineState(parsedEvent.state)
            setStatusMessage(parsedEvent.message)

            if (parsedEvent.state === 'failed') {
              setIsRunning(false)
              setWsError(formatPipelineError(parsedEvent.stage, parsedEvent.message))
            }

            if (parsedEvent.stage === 'completed' && parsedEvent.state === 'completed') {
              setIsRunning(false)
            }

            return
          }

          if (parsedEvent.type === 'result') {
            setTranscript(parsedEvent.transcript)
            setResponse(parsedEvent.response)
            setAudioDuration(parsedEvent.audio_duration_seconds)
            return
          }

          setIsRunning(false)
          setWsError(formatPipelineError(parsedEvent.stage, parsedEvent.message))
        }

        socket.onerror = (): void => {
          setConnectionState('error')
          setIsRunning(false)
          setWsError('WebSocket connection failed')

          if (!settled) {
            settled = true
            reject(new Error('WebSocket connection failed'))
          }
        }

        socket.onclose = (event: CloseEvent): void => {
          setConnectionState('closed')
          setIsRunning(false)
          cleanupSocketRef()

          if (event.code !== 1000) {
            setWsError(`${describeWebSocketClose(event)}. Click Start to reconnect.`)
          }

          if (!settled) {
            settled = true
            reject(new Error(describeWebSocketClose(event)))
          }
        }
      })
    })()

    connectPromiseRef.current = connectPromise

    try {
      await connectPromise
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
  }, [cleanupSocketRef, websocketTarget])

  const startPipeline = useCallback(async (): Promise<void> => {
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
      socket.send(buildStartPipelineMessage())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start WebSocket pipeline'
      setIsRunning(false)
      setConnectionState('error')
      setWsError(message)
    }
  }, [connect, isRunning])

  const disconnect = useCallback((): void => {
    const socket = socketRef.current
    if (!socket) {
      return
    }

    socket.close(1000, 'Disconnected by client')
    cleanupSocketRef()
    setConnectionState('closed')
    setIsRunning(false)
  }, [cleanupSocketRef])

  useEffect(() => {
    return () => {
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
    wsError,
    connect,
    startPipeline,
    disconnect
  }
}
