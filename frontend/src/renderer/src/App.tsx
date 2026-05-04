import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAgent } from '@renderer/hooks/useAgent'
import { ConversationHistorySidebar } from '@renderer/components/ConversationHistorySidebar'
import { ThinkingText } from '@renderer/components/ThinkingText'
import { IntroChatbox } from '@renderer/components/IntroChatbox'
import { useUploadDocumentsMutation } from '@renderer/queries/documentsQueries'
import { useCreateConversationSessionMutation } from '@renderer/queries/conversationsQueries'
import { MessageBubble } from '@renderer/components/MessageBubble'
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
    transcript,
    response,
    wsError,
    startPipeline,
    currentSessionId
  } = useAgent()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [pendingTextQuestion, setPendingTextQuestion] = useState<string | null>(null)
  const [typedQuestion, setTypedQuestion] = useState<string | null>(null)
  const [typedResponse, setTypedResponse] = useState<string | null>(null)
  const [isSubmittingText, setIsSubmittingText] = useState(false)
  const navigate = useNavigate()
  const sessionIdForActions = activeSessionId ?? currentSessionId
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadMutation = useUploadDocumentsMutation()
  const createSessionMutation = useCreateConversationSessionMutation()
  const hasSeenConnectionRef = useRef(false)

  const micState: 'idle' | 'listening' | 'thinking' =
    agentStatus === 'listening' ? 'listening' : agentStatus === 'thinking' ? 'thinking' : 'idle'

  const screen =
    response !== null || typedResponse !== null
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

    let sessionId = sessionIdForActions
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

  const handleStartPipeline = async (): Promise<void> => {
    setPendingTextQuestion(null)
    setTypedQuestion(null)
    setTypedResponse(null)
    const options = sessionIdForActions ? { conversationId: sessionIdForActions } : undefined
    await startPipeline(options)
  }

  const handleSubmitText = async (question: string): Promise<void> => {
    setPendingTextQuestion(question)
    setTypedQuestion(question)
    setTypedResponse(null)
    setIsSubmittingText(true)

    let sessionId = sessionIdForActions
    if (!sessionId) {
      try {
        const created = await createSessionMutation.mutateAsync()
        sessionId = created.session_id
        setActiveSessionId(sessionId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create session'
        toast.error(message)
        setPendingTextQuestion(null)
        setIsSubmittingText(false)
        return
      }
    }

    console.log('[App] navigating to session', sessionId)
    await navigate({
      to: '/conversation/$conversationId',
      params: { conversationId: String(sessionId) }
    })

    sessionStorage.setItem(`corg:pending-question:${sessionId}`, question)
    setPendingTextQuestion(null)
    setIsSubmittingText(false)
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
            <IntroChatbox
              micState={micState}
              onMicClick={() => void handleStartPipeline()}
              onSubmitText={(text) => void handleSubmitText(text)}
              disabled={createSessionMutation.isPending || isSubmittingText}
              disableInputWhileMicActive={false}
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
              <MessageBubble
                role="user"
                content={transcript ?? 'Your question will appear here once captured'}
                placeholder={!transcript}
              />
              <div className="corg-label">Listening</div>
            </div>
            <div className="corg-mic-footer">
              <IntroChatbox
                micState="listening"
                onMicClick={() => void handleStartPipeline()}
                onSubmitText={(text) => void handleSubmitText(text)}
                disabled={createSessionMutation.isPending || isSubmittingText}
                disableInputWhileMicActive={false}
              />
            </div>
          </>
        )}

        {screen === 'thinking' && (
          <>
            {transcript ? (
              <div className="corg-transcript-top">
                <MessageBubble role="user" content={transcript} />
              </div>
            ) : null}
            <div className="corg-thinking-center">
              <ThinkingText />
            </div>
            <div className="corg-mic-footer">
              <IntroChatbox
                micState="thinking"
                onMicClick={() => void handleStartPipeline()}
                onSubmitText={(text) => void handleSubmitText(text)}
                disabled={createSessionMutation.isPending || isSubmittingText}
                disableInputWhileMicActive={false}
              />
            </div>
          </>
        )}

        {screen === 'response' && (
          <>
            <div className="corg-response-content">
              {transcript || typedQuestion || pendingTextQuestion ? (
                <MessageBubble role="user" content={pendingTextQuestion ?? transcript ?? typedQuestion ?? ''} />
              ) : null}
              {response || typedResponse ? (
                <MessageBubble role="agent" content={response ?? typedResponse ?? ''} />
              ) : null}
            </div>
            <div className="corg-mic-footer">
              <IntroChatbox
                micState={micState}
                onMicClick={() => void handleStartPipeline()}
                onSubmitText={(text) => void handleSubmitText(text)}
                disabled={createSessionMutation.isPending || isSubmittingText}
                disableInputWhileMicActive={false}
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
