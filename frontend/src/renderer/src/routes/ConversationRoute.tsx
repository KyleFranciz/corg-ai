import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ConversationSession } from '@renderer/schemas/conversation'
import { fetchConversationById } from '@renderer/services/conversations'

export function ConversationRoute(): React.JSX.Element {
  const { conversationId } = useParams({ from: '/conversation/$conversationId' })
  const [conversation, setConversation] = useState<ConversationSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadConversation(): Promise<void> {
      setIsLoading(true)
      setError(null)

      const parsedId = Number.parseInt(conversationId, 10)
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        setIsLoading(false)
        setError('Invalid conversation id')
        return
      }

      try {
        const result = await fetchConversationById(parsedId)
        if (!cancelled) {
          setConversation(result)
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load conversation'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [conversationId])

  return (
    <main className="conversation-page">
      <div className="conversation-page__content">
        <header className="conversation-page__header">
          <Link to="/">Back to Home</Link>
        </header>

        {isLoading ? <p>Loading conversation...</p> : null}
        {error ? <p>{error}</p> : null}

        {!isLoading && !error && conversation ? (
          <section className="chat-thread" aria-label="Conversation thread">
            {conversation.messages.map((message) => (
              <article
                className={`chat-bubble ${message.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--agent'}`}
                key={message.id ?? `${message.role}-${message.created_at}`}
              >
                <p>{message.content}</p>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  )
}
