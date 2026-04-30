import { Link, useParams } from '@tanstack/react-router'
import { useConversationByIdQuery } from '@renderer/queries/conversationsQueries'

export function ConversationRoute(): React.JSX.Element {
  const { conversationId } = useParams({ from: '/conversation/$conversationId' })
  const parsedId = Number.parseInt(conversationId, 10)
  const validConversationId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null
  const { data: conversation, isLoading, error } = useConversationByIdQuery(validConversationId)

  const invalidConversationId = validConversationId === null

  return (
    <div className="corg-stage">
      <div className="corg-paper-bg" />
      <div className="corg-dashed-grid" />

      <Link to="/" className="corg-back-btn" aria-label="Back to home">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>

      <div className="corg-response-content">
        {isLoading ? (
          <p className="corg-state-label">Loading…</p>
        ) : null}

        {invalidConversationId ? (
          <p className="corg-state-label">Invalid conversation id.</p>
        ) : null}

        {error ? (
          <p className="corg-state-label">{error.message}</p>
        ) : null}

        {!invalidConversationId && !isLoading && !error && conversation
          ? conversation.messages.map((message) => (
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
            ))
          : null}
      </div>
    </div>
  )
}
