import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { FiX } from 'react-icons/fi'
import { useDeleteConversationSessionMutation } from '@renderer/queries/conversationsQueries'
import { toast } from 'sonner'
import type { ConversationSession } from '@renderer/schemas/conversation'
import { useConversationsQuery } from '@renderer/queries/conversationsQueries'

const EMPTY_CONVERSATIONS: ConversationSession[] = []

function buildSessionTitle(messages: ConversationSession['messages']): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) {
    return 'New conversation'
  }

  const trimmed = firstUserMessage.content.trim()
  if (!trimmed) {
    return 'New conversation'
  }

  const words = trimmed.split(/\s+/).slice(0, 6)
  return words.join(' ')
}

function isDocumentsOnlySession(conversation: ConversationSession): boolean {
  return conversation.message_count === 0 && conversation.document_count > 0
}

export function ConversationHistorySidebar({
  open = false
}: {
  open?: boolean
}): React.JSX.Element {
  // list refs for conversation cards
  const listRef = useRef<HTMLDivElement | null>(null)
  // data fetching functions (amount of conversations shown in the sidebar is adjustable)
  const { data: conversationsData, isLoading, error } = useConversationsQuery(50)
  const deleteSessionMutation = useDeleteConversationSessionMutation()
  const conversations: ConversationSession[] = conversationsData ?? EMPTY_CONVERSATIONS

  const handleDeleteSession = async (sessionId: number): Promise<void> => {
    const accepted = window.confirm('Delete this session and all attached messages/documents?')
    if (!accepted) {
      return
    }

    try {
      await deleteSessionMutation.mutateAsync(sessionId)
      toast.success('Session deleted')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session'
      toast.error(message)
    }
  }

  // function to handle scrolling to the top of the list of convos
  useEffect(() => {
    if (!listRef.current) {
      return
    }

    listRef.current.scrollTop = 0
  }, [conversations])

  return (
    <aside
      className={`history-sidebar${open ? ' history-sidebar--open' : ''}`}
      aria-label="Conversation history"
    >
      <header className="history-sidebar__header">
        <h2>Conversation History</h2>
        <p>{conversations.length} sessions</p>
      </header>

      <div className="history-sidebar__list" ref={listRef}>
        {isLoading ? <p className="history-sidebar__empty">Loading conversations...</p> : null}
        {error ? <p className="history-sidebar__empty">{error.message}</p> : null}
        {!isLoading && !error && conversations.length === 0 ? (
          <p className="history-sidebar__empty">No conversations yet.</p>
        ) : (
          conversations
            .filter((conversation) => conversation.session_id !== null)
            .map((conversation) => (
              <div className="history-turn-wrap" key={conversation.session_id}>
                <Link
                  className="history-turn"
                  activeProps={{ className: 'history-turn history-turn--active' }}
                  params={{ conversationId: String(conversation.session_id) }}
                  to="/conversation/$conversationId"
                >
                  <div className="history-turn__title-row">
                    {isDocumentsOnlySession(conversation) ? (
                      <span
                        aria-label="Session has documents"
                        className="history-turn__doc-dot"
                        title="Session has documents"
                      />
                    ) : null}
                    <h3 className="history-turn__title">{buildSessionTitle(conversation.messages)}</h3>
                  </div>
                </Link>
                <button
                  aria-label="Delete session"
                  className="history-turn__delete"
                  disabled={deleteSessionMutation.isPending}
                  onClick={() => void handleDeleteSession(conversation.session_id as number)}
                  title="Delete session"
                  type="button"
                >
                  <FiX size={14} />
                </button>
              </div>
            ))
        )}
      </div>
    </aside>
  )
}
