import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MicCapsule, type MicState } from '@renderer/components/MicCapsule'
import { Waveform } from '@renderer/components/Waveform'
import { DocumentModal } from '@renderer/components/DocumentModal'
import { DocumentsButton } from '@renderer/components/DocumentsButton'
import { useAgent } from '@renderer/hooks/useAgent'
import {
  conversationsKeys,
  useDeleteConversationSessionMutation
} from '@renderer/queries/conversationsQueries'
import {
  documentsKeys,
  useSessionDocumentsQuery,
  useUploadDocumentsMutation
} from '@renderer/queries/documentsQueries'
import type { ConversationSession } from '@renderer/schemas/conversation'
import { toast } from 'sonner'

type SessionTranscriptionProps = {
  conversationId: number
  conversation: ConversationSession
}

export function SessionTranscription({
  conversationId,
  conversation
}: SessionTranscriptionProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const {
    agentStatus,
    isRunning,
    pipelineStage,
    pipelineState,
    transcript,
    response,
    wsError,
    currentSessionId,
    startPipeline
  } = useAgent()
  const hasInvalidatedForCurrentRunRef = useRef(false)
  const [docsModalOpen, setDocsModalOpen] = useState(false)
  const deleteSessionMutation = useDeleteConversationSessionMutation()
  const uploadMutation = useUploadDocumentsMutation()
  const { data: docsData } = useSessionDocumentsQuery(conversationId)
  const documents = docsData?.documents ?? []

  const handleUpload = async (files: File[]): Promise<void> => {
    try {
      await uploadMutation.mutateAsync({ sessionId: conversationId, files })
      await queryClient.invalidateQueries({ queryKey: documentsKeys.session(conversationId) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      toast.error(message)
    }
  }

  const micState: MicState =
    agentStatus === 'listening' ? 'listening' : agentStatus === 'thinking' ? 'thinking' : 'idle'
  const isTranscribing = isRunning && pipelineStage === 'transcribing'
  const hasPendingTranscript = transcript !== null && transcript.trim().length > 0
  const showPendingUserMessage =
    isRunning &&
    hasPendingTranscript &&
    (pipelineStage === 'transcribing' ||
      pipelineStage === 'retrieving' ||
      pipelineStage === 'responding' ||
      pipelineStage === 'speaking')
  const isStreamingResponse =
    isRunning && (pipelineStage === 'responding' || pipelineStage === 'speaking') && response !== null

  useEffect(() => {
    if (isRunning) {
      hasInvalidatedForCurrentRunRef.current = false
      return
    }

    if (hasInvalidatedForCurrentRunRef.current) {
      return
    }

    const isCompletedStage =
      pipelineStage === 'responding' || pipelineStage === 'speaking' || pipelineStage === 'completed'
    const isPipelineFinished = pipelineState === 'completed' && isCompletedStage
    const hasCompletedResponse = response !== null

    if (!isPipelineFinished && !hasCompletedResponse) {
      return
    }

    hasInvalidatedForCurrentRunRef.current = true
    const targetConversationId = currentSessionId ?? conversationId

    void queryClient.invalidateQueries({ queryKey: conversationsKeys.detail(targetConversationId) })
    void queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: conversationsKeys.list(50) })
  }, [
    conversationId,
    currentSessionId,
    isRunning,
    pipelineStage,
    pipelineState,
    response,
    queryClient
  ])

  const handleDeleteSession = async (): Promise<void> => {
    const accepted = window.confirm('Delete this session and all attached messages/documents?')
    if (!accepted) {
      return
    }

    try {
      await deleteSessionMutation.mutateAsync(conversationId)
      toast.success('Session deleted')
      await navigate({ to: '/' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session'
      toast.error(message)
    }
  }

  return (
    <>
      <div className="corg-response-content">
        {conversation.messages.length === 0 ? (
          <p className="corg-state-label">No messages in this session yet.</p>
        ) : (
          conversation.messages.map((message) =>
            message.role === 'user' ? (
              <div
                key={message.id ?? `${message.role}-${message.created_at}`}
                className="corg-user-transcript"
              >
                {message.content}
              </div>
            ) : (
              <div
                key={message.id ?? `${message.role}-${message.created_at}`}
                className="corg-bubble"
              >
                {message.content}
              </div>
            )
          )
        )}

        {showPendingUserMessage ? <div className="corg-user-transcript">{transcript}</div> : null}
        {isStreamingResponse ? <div className="corg-bubble">{response}</div> : null}
      </div>

      <div className="corg-mic-footer">
        <MicCapsule
          state={micState}
          onClick={() => void startPipeline({ conversationId })}
          disabled={isRunning}
        />
      </div>

      <button
        className="corg-session-delete-btn"
        disabled={deleteSessionMutation.isPending}
        onClick={() => void handleDeleteSession()}
        type="button"
      >
        {deleteSessionMutation.isPending ? 'Deleting…' : 'Delete session'}
      </button>

      <DocumentsButton count={documents.length} onClick={() => setDocsModalOpen(true)} />

      {docsModalOpen ? (
        <DocumentModal
          documents={documents}
          onClose={() => setDocsModalOpen(false)}
          onUpload={handleUpload}
          isUploading={uploadMutation.isPending}
        />
      ) : null}

      {isTranscribing ? (
        <div className="corg-transcription-waveform">
          <Waveform />
        </div>
      ) : null}

      {isTranscribing && !showPendingUserMessage && transcript ? (
        <p className="corg-state-label">{transcript}</p>
      ) : null}
      {wsError ? <p className="corg-followup-error">{wsError}</p> : null}
    </>
  )
}
