import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { MicState } from './MicCapsule'
import { ThinkingSpinner } from './ThinkingSpinner'

type Props = {
  micState: MicState
  onMicClick?: () => void
  onSubmitText?: (text: string) => void
  disabled?: boolean
  placeholder?: string
  disableInputWhileMicActive?: boolean
}

function SendIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function MicIcon(): React.JSX.Element {
  return (
    <svg width="13" height="18" viewBox="0 0 14 19" fill="white">
      <path d="M7 12c-.833 0-1.542-.292-2.125-.875S4 9.833 4 9V3c0-.833.292-1.542.875-2.125S6.167 0 7 0s1.542.292 2.125.875S10 2.167 10 3v6c0 .833-.292 1.542-.875 2.125S7.833 12 7 12zM6 19v-3.075c-1.733-.233-3.167-1.008-4.3-2.325S0 10.75 0 9h2c0 1.383.488 2.563 1.463 3.538S5.617 14 7 14s2.563-.487 3.538-1.462S12 10.383 12 9h2c0 1.75-.567 3.283-1.7 4.6s-2.567 2.092-4.3 2.325V19H6z" />
    </svg>
  )
}

export function IntroChatbox({
  micState,
  onMicClick,
  onSubmitText,
  disabled,
  placeholder = 'Ask something…',
  disableInputWhileMicActive = true
}: Props): React.JSX.Element {
  const [text, setText] = useState('')

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmitText?.(trimmed)
    setText('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = text.trim()
      if (!trimmed || disabled) return
      onSubmitText?.(trimmed)
      setText('')
    }
  }

  const hasMicActivity = micState === 'listening' || micState === 'thinking'
  const shouldDisableInput = disabled || (disableInputWhileMicActive && hasMicActivity)
  const showSend = text.trim().length > 0

  return (
    <form className="corg-intro-chatbox" onSubmit={handleSubmit} noValidate>
      <input
        className="corg-intro-chatbox__input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={hasMicActivity ? '' : placeholder}
        disabled={shouldDisableInput}
        autoComplete="off"
        spellCheck={false}
        aria-label="Type your question"
      />

      <div className="corg-intro-chatbox__actions">
        {showSend && (
          <button
            type="submit"
            className="corg-intro-chatbox__send"
            disabled={disabled}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        )}

        <button
          type="button"
          className={`corg-intro-chatbox__mic corg-intro-chatbox__mic--${micState}`}
          onClick={onMicClick}
          disabled={disabled && !hasMicActivity}
          aria-label={
            micState === 'idle'
              ? 'Start listening'
              : micState === 'listening'
                ? 'Listening…'
                : 'Processing…'
          }
        >
          {micState === 'thinking' ? (
            <ThinkingSpinner speedSeconds={2.4} />
          ) : (
            <MicIcon />
          )}
        </button>
      </div>
    </form>
  )
}
