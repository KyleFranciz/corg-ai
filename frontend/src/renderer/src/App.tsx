import { useAgent } from '@renderer/hooks/useAgent'
import { ConversationHistorySidebar } from '@renderer/components/ConversationHistorySidebar'

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
    <div className="app-shell">
      {/* make a fix for the history prop, make it optional */}
      <ConversationHistorySidebar />

      <main className="app-main">
        <div className="app-main__content">
          <h1>Corg</h1>
          <p>WebSocket target: {websocketTarget}</p>
          <p>Connection: {connectionState}</p>
          <p>Agent status: {agentStatus}</p>
          <p>Stage: {pipelineStage ?? 'idle'}</p>
          <p>Stage state: {pipelineState ?? 'idle'}</p>
          <p>Status: {statusMessage ?? 'waiting'}</p>

          <div className="app-main__actions">
            <button onClick={() => void startPipeline()} disabled={isRunning}>
              {isRunning ? 'Pipeline Running...' : 'Start Audio -> TTS Pipeline'}
            </button>
            <button onClick={disconnect} disabled={connectionState !== 'connected' || isRunning}>
              Disconnect
            </button>
          </div>

          {transcript ? <p>Transcript: {transcript}</p> : null}
          {response ? <p>Response: {response}</p> : null}
          {audioDuration !== null ? <p>Audio duration: {audioDuration}s</p> : null}
          {wsError ? <p>{wsError}</p> : null}
        </div>
      </main>
    </div>
  )
}

export default App
