import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MicCapsule, type MicState } from '@renderer/components/MicCapsule'
import { useAgent } from '@renderer/hooks/useAgent'
import { conversationsKeys } from '@renderer/queries/conversationsQueries'
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

      {transcript ? <p className="corg-state-label">{transcript}</p> : null}
      {response ? <div className="corg-bubble">{response}</div> : null}
      {wsError ? <p className="corg-followup-error">{wsError}</p> : null}
    </>
  )
}
