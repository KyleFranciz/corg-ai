import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useAgent } from '@renderer/hooks/useAgent'
import { ConversationHistorySidebar } from '@renderer/components/ConversationHistorySidebar'
import { MicCapsule, type MicState } from '@renderer/components/MicCapsule'
import { useUploadDocumentsMutation } from '@renderer/queries/documentsQueries'
import { useCreateConversationSessionMutation } from '@renderer/queries/conversationsQueries'
import { toast } from 'sonner'

function PaperBg(): React.JSX.Element {
  return (
    <>
      <div className="corg-paper-bg" />
      <div className="corg-dashed-grid" />
    </>
  )
}

function MenuButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    // TODO: install actual icons from react icons to substitute instead of css constructs
    <button className="corg-menu-btn" onClick={onClick} aria-label="Open menu">
      <span className="corg-menu-btn__bar" />
      <span className="corg-menu-btn__bar" />
      <span className="corg-menu-btn__bar" />
    </button>
  )
}

function PaperclipIcon(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function UploadButton({
  onClick,
  disabled
}: {
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      className="corg-upload-btn"
      aria-label="Upload files"
      onClick={onClick}
      disabled={disabled}
    >
      <PaperclipIcon />
      <span>{disabled ? 'Uploading…' : 'Add a document'}</span>
    </button>
  )
}

function App(): React.JSX.Element {
  const {
    agentStatus,
    connectionState,
    isRunning,
    transcript,
    response,
    wsError,
    startPipeline,
    currentSessionId
  } = useAgent()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadMutation = useUploadDocumentsMutation()
  const createSessionMutation = useCreateConversationSessionMutation()
  const hasSeenConnectionRef = useRef(false)

  const micState: MicState =
    agentStatus === 'listening' ? 'listening' : agentStatus === 'thinking' ? 'thinking' : 'idle'

  const screen =
    response !== null
      ? 'response'
      : agentStatus === 'thinking'
        ? 'thinking'
        : agentStatus === 'listening'
          ? 'listening'
          : 'intro'

  const handleUploadClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        const created = await createSessionMutation.mutateAsync()
        sessionId = created.session_id
        setActiveSessionId(sessionId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create session'
        toast.error(message)
        event.target.value = ''
        return
      }
    }

    uploadMutation.mutate({ sessionId, files }, {
      onSuccess: (data) => {
        const successfulCount = data.uploaded_files.length
        const failedCount = data.failed_files.length

        if (successfulCount > 0) {
          toast.success(`Uploaded ${successfulCount} file${successfulCount === 1 ? '' : 's'}`)
        }

        if (failedCount > 0) {
          toast.error(`${failedCount} file${failedCount === 1 ? '' : 's'} failed to upload`)
        }
      },
      onError: (error) => {
        toast.error(error.message || 'File upload failed')
      }
    })
    event.target.value = ''
  }

  useEffect(() => {
    if (currentSessionId && activeSessionId !== currentSessionId) {
      setActiveSessionId(currentSessionId)
    }
  }, [activeSessionId, currentSessionId])

  const handleStartPipeline = async (): Promise<void> => {
    const options = activeSessionId ? { conversationId: activeSessionId } : undefined
    await startPipeline(options)
  }

  useEffect(() => {
    if (connectionState === 'connected') {
      toast.success('Connected to backend')
      hasSeenConnectionRef.current = true
      return
    }

    if (
      (connectionState === 'error' || connectionState === 'closed') &&
      hasSeenConnectionRef.current
    ) {
      toast.error(wsError || 'Unable to connect to backend')
    }
  }, [connectionState, wsError])

  return (
    <div className="corg-stage">
      <PaperBg />

      <MenuButton onClick={() => setSidebarOpen((v) => !v)} />
      <ConversationHistorySidebar open={sidebarOpen} />

      <div className="corg-content">
        {screen === 'intro' && (
          <div className="corg-intro">
            <div className="corg-wordmark">Corg</div>
            <MicCapsule
              state={micState}
              onClick={() => void handleStartPipeline()}
              disabled={isRunning}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.pdf"
              style={{ display: 'none' }}
              onChange={handleFileSelection}
            />
            <UploadButton onClick={handleUploadClick} disabled={uploadMutation.isPending} />
            {uploadMutation.isSuccess ? (
              <div className="corg-label">
                Uploaded {uploadMutation.data.summary.processed} file(s)
              </div>
            ) : null}
            {uploadMutation.isError ? (
              <div className="corg-error">{uploadMutation.error.message}</div>
            ) : null}
          </div>
        )}

        {screen === 'listening' && (
          <>
            <div className="corg-listening-content">
              {transcript ? <div className="corg-user-transcript">{transcript}</div> : null}
              <div className="corg-label">Listening</div>
            </div>
            <div className="corg-mic-footer">
              <MicCapsule state="listening" />
            </div>
          </>
        )}

        {screen === 'thinking' && (
          <>
            {transcript ? (
              <div className="corg-transcript-top">
                <div className="corg-user-transcript">{transcript}</div>
              </div>
            ) : null}
            <div className="corg-thinking-center">
              <div className="corg-thinking-text">Thinking…</div>
            </div>
            <div className="corg-mic-footer">
              <MicCapsule state="thinking" />
            </div>
          </>
        )}

        {screen === 'response' && (
          <>
            <div className="corg-response-content">
              {transcript ? <div className="corg-user-transcript">{transcript}</div> : null}
              {response ? <div className="corg-bubble">{response}</div> : null}
            </div>
            <div className="corg-mic-footer">
              <MicCapsule
                state="idle"
                onClick={() => void handleStartPipeline()}
                disabled={isRunning}
              />
            </div>
          </>
        )}

        {wsError ? <div className="corg-error">{wsError}</div> : null}
      </div>
    </div>
  )
}

export default App
