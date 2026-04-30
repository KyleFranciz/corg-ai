import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useAgent } from '@renderer/hooks/useAgent'
import { ConversationHistorySidebar } from '@renderer/components/ConversationHistorySidebar'
import { useUploadDocumentsMutation } from '@renderer/queries/documentsQueries'
import { toast } from 'sonner'

type MicState = 'idle' | 'listening' | 'thinking'

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

function Waveform(): React.JSX.Element {
  const heights = [14, 24, 31, 22, 31, 18, 12]
  return (
    <div className="corg-waveform">
      {heights.map((h, i) => (
        <span
          key={i}
          className="corg-waveform__bar"
          style={{ height: h, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

function MicCapsule({
  state,
  onClick,
  disabled
}: {
  state: MicState
  onClick?: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      className={`corg-mic corg-mic--${state}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={
        state === 'idle' ? 'Start listening' : state === 'listening' ? 'Listening…' : 'Processing…'
      }
    >
      {state === 'idle' && (
        <svg width="14" height="19" viewBox="0 0 14 19" fill="white">
          <path d="M7 12c-.833 0-1.542-.292-2.125-.875S4 9.833 4 9V3c0-.833.292-1.542.875-2.125S6.167 0 7 0s1.542.292 2.125.875S10 2.167 10 3v6c0 .833-.292 1.542-.875 2.125S7.833 12 7 12zM6 19v-3.075c-1.733-.233-3.167-1.008-4.3-2.325S0 10.75 0 9h2c0 1.383.488 2.563 1.463 3.538S5.617 14 7 14s2.563-.487 3.538-1.462S12 10.383 12 9h2c0 1.75-.567 3.283-1.7 4.6s-2.567 2.092-4.3 2.325V19H6z" />
        </svg>
      )}
      {state === 'listening' && <Waveform />}
      {state === 'thinking' && (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )}
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
    <button className="corg-upload-btn" aria-label="Upload files" onClick={onClick} disabled={disabled}>
      <PaperclipIcon />
      <span>{disabled ? 'Uploading…' : 'Add a document'}</span>
    </button>
  )
}

function App(): React.JSX.Element {
  const { agentStatus, connectionState, isRunning, transcript, response, wsError, startPipeline } =
    useAgent()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadMutation = useUploadDocumentsMutation()
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

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    uploadMutation.mutate(files, {
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
    if (connectionState === 'connected') {
      toast.success('Connected to backend')
      hasSeenConnectionRef.current = true
      return
    }

    if ((connectionState === 'error' || connectionState === 'closed') && hasSeenConnectionRef.current) {
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
              onClick={() => void startPipeline()}
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
              <div className="corg-label">Uploaded {uploadMutation.data.summary.processed} file(s)</div>
            ) : null}
            {uploadMutation.isError ? <div className="corg-error">{uploadMutation.error.message}</div> : null}
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
              <MicCapsule state="idle" onClick={() => void startPipeline()} disabled={isRunning} />
            </div>
          </>
        )}

        {wsError ? <div className="corg-error">{wsError}</div> : null}
      </div>
    </div>
  )
}

export default App
