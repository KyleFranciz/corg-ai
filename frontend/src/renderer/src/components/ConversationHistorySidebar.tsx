import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { ConversationSession } from '@renderer/schemas/conversation'
import { fetchConversations } from '@renderer/services/conversations'

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

export function ConversationHistorySidebar(): React.JSX.Element {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [conversations, setConversations] = useState<ConversationSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadConversations(): Promise<void> {
      setIsLoading(true)
      setError(null)

      try {
        const rows = await fetchConversations()
        if (!cancelled) {
          setConversations(rows)
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load conversations'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadConversations()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    listRef.current.scrollTop = 0
  }, [conversations])

  return (
    <aside className="history-sidebar" aria-label="Conversation history">
      <header className="history-sidebar__header">
        <h2>Conversation History</h2>
        <p>{conversations.length} sessions</p>
      </header>

      <div className="history-sidebar__list" ref={listRef}>
        {isLoading ? <p className="history-sidebar__empty">Loading conversations...</p> : null}
        {error ? <p className="history-sidebar__empty">{error}</p> : null}
        {!isLoading && !error && conversations.length === 0 ? (
          <p className="history-sidebar__empty">No conversations yet.</p>
        ) : (
          conversations
            .filter((conversation) => conversation.session_id !== null)
            .map((conversation) => (
              <Link
                className="history-turn"
                activeProps={{ className: 'history-turn history-turn--active' }}
                key={conversation.session_id}
                params={{ conversationId: String(conversation.session_id) }}
                to="/conversation/$conversationId"
              >
                <h3 className="history-turn__title">{buildSessionTitle(conversation.messages)}</h3>
              </Link>
            ))
        )}
      </div>
    </aside>
  )
}
