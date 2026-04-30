import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MicCapsule, type MicState } from '@renderer/components/MicCapsule'
import { DocumentModal } from '@renderer/components/DocumentModal'
import { DocumentsButton } from '@renderer/components/DocumentsButton'
import { useAgent } from '@renderer/hooks/useAgent'
import { conversationsKeys } from '@renderer/queries/conversationsQueries'
import { useSessionDocumentsQuery } from '@renderer/queries/documentsQueries'
import type { ConversationSession } from '@renderer/schemas/conversation'

type SessionTranscriptionProps = {
  conversationId: number
  conversation: ConversationSession
}

export function SessionTranscription({
  conversationId,
  conversation
}: SessionTranscriptionProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const { agentStatus, isRunning, transcript, response, wsError, history, startPipeline } =
    useAgent()
  const lastHistoryCountRef = useRef(0)
  const [docsModalOpen, setDocsModalOpen] = useState(false)
  const { data: docsData } = useSessionDocumentsQuery(conversationId)
  const documents = docsData?.documents ?? []

  const micState: MicState =
    agentStatus === 'listening' ? 'listening' : agentStatus === 'thinking' ? 'thinking' : 'idle'

  useEffect(() => {
    if (history.length <= lastHistoryCountRef.current) {
      return
    }

    lastHistoryCountRef.current = history.length
    void queryClient.invalidateQueries({ queryKey: conversationsKeys.detail(conversationId) })
    void queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
  }, [conversationId, history.length, queryClient])

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
      </div>

      <div className="corg-mic-footer">
        <MicCapsule
          state={micState}
          onClick={() => void startPipeline({ conversationId })}
          disabled={isRunning}
        />
      </div>

      <DocumentsButton count={documents.length} onClick={() => setDocsModalOpen(true)} />

      {docsModalOpen ? (
        <DocumentModal documents={documents} onClose={() => setDocsModalOpen(false)} />
      ) : null}

      {transcript ? <p className="corg-state-label">{transcript}</p> : null}
      {response ? <div className="corg-bubble">{response}</div> : null}
      {wsError ? <p className="corg-followup-error">{wsError}</p> : null}
    </>
  )
}
