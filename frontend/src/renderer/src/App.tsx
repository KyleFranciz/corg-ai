import { useEffect, useRef, useState } from 'react'
import {
  buildStartPipelineMessage,
  describeWebSocketClose,
  getWebSocketUrl,
  parsePipelineEvent,
  type PipelineStage,
  verifyBackendHealth
} from './lib/websocket'
// import Versions from './components/Versions'

function App(): React.JSX.Element {
  const socketRef = useRef<WebSocket | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'closed' | 'error'>('idle')
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)

  const websocketTarget = (() => {
    try {
      return getWebSocketUrl()
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to resolve WebSocket URL'
    }
  })()

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [])

  const formatPipelineError = (stage: string, message: string): string => {
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

  const handleStartPipeline = async (): Promise<void> => {
    if (isRunning) {
      return
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(buildStartPipelineMessage())
      return
    }

    setConnectionState('connecting')
    setPipelineStage(null)
    setStatusMessage(null)
    setTranscript(null)
    setAudioDuration(null)
    setWsError(null)

    try {
      await verifyBackendHealth()

      const socket = new WebSocket(websocketTarget)
      socketRef.current = socket

      socket.onopen = (): void => {
        setConnectionState('connected')
        socket.send(buildStartPipelineMessage())
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
          setIsRunning(true)
          setWsError(null)
          setTranscript(null)
          setAudioDuration(null)
          return
        }

        if (parsedEvent.type === 'status') {
          setPipelineStage(parsedEvent.stage)
          setStatusMessage(parsedEvent.message)
          if (parsedEvent.stage === 'completed') {
            setIsRunning(false)
          }
          return
        }

        if (parsedEvent.type === 'result') {
          setTranscript(parsedEvent.transcript)
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
      }

      socket.onclose = (event: CloseEvent): void => {
        setConnectionState('closed')
        setIsRunning(false)
        socketRef.current = null

        if (event.code !== 1000) {
          setWsError(`${describeWebSocketClose(event)}. Check backend logs for the failure at the last reported stage.`)
        }
      }
    } catch (error) {
      setConnectionState('error')
      const errorMessage = error instanceof Error ? error.message : 'Failed to start WebSocket pipeline'
      setWsError(errorMessage)
    }
  }

  return (
    <>
      <h1>Corg</h1>
      {/* <Versions></Versions> */}
      <p>WebSocket target: {websocketTarget}</p>
      <p>Connection: {connectionState}</p>
      <p>Stage: {pipelineStage ?? 'idle'}</p>
      <p>Status: {statusMessage ?? 'waiting'}</p>

      <button onClick={() => void handleStartPipeline()} disabled={isRunning}>
        {isRunning ? 'Pipeline Running...' : 'Start Audio -> TTS Pipeline'}
      </button>

      {transcript ? <p>Transcript: {transcript}</p> : null}
      {audioDuration !== null ? <p>Audio duration: {audioDuration}s</p> : null}
      {wsError ? <p>{wsError}</p> : null}
    </>
  )
}

export default App
