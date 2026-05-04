import ReactMarkdown from 'react-markdown'

type MessageBubbleProps = {
  role: 'user' | 'agent'
  content: string
  placeholder?: boolean
}

export function MessageBubble({ role, content, placeholder = false }: MessageBubbleProps): React.JSX.Element {
  if (role === 'user') {
    return (
      <div className={placeholder ? 'corg-user-transcript-placeholder' : 'corg-user-transcript'}>
        {content}
      </div>
    )
  }

  return (
    <div className="corg-bubble">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
