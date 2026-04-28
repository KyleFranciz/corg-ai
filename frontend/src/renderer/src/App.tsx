import { useAgent } from '@renderer/hooks/useAgent'

function App(): React.JSX.Element {
  const {
    websocketTarget,
    connectionState,
    agentStatus,
    isRunning,
    pipelineStage,
    pipelineState,
    statusMessage,
    transcript,
    response,
    audioDuration,
    wsError,
    startPipeline,
    disconnect
  } = useAgent()

  return (
    <>
      <h1>Corg</h1>
      <p>WebSocket target: {websocketTarget}</p>
      <p>Connection: {connectionState}</p>
      <p>Agent status: {agentStatus}</p>
      <p>Stage: {pipelineStage ?? 'idle'}</p>
      <p>Stage state: {pipelineState ?? 'idle'}</p>
      <p>Status: {statusMessage ?? 'waiting'}</p>

      <button onClick={() => void startPipeline()} disabled={isRunning}>
        {isRunning ? 'Pipeline Running...' : 'Start Audio -> TTS Pipeline'}
      </button>
      <button onClick={disconnect} disabled={connectionState !== 'connected' || isRunning}>
        Disconnect
      </button>

      {transcript ? <p>Transcript: {transcript}</p> : null}
      {response ? <p>Response: {response}</p> : null}
      {audioDuration !== null ? <p>Audio duration: {audioDuration}s</p> : null}
      {wsError ? <p>{wsError}</p> : null}
    </>
  )
}

export default App
