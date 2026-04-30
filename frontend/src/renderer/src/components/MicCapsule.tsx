import { ThinkingSpinner } from '@renderer/components/ThinkingSpinner'

export type MicState = 'idle' | 'listening' | 'thinking'

function Waveform(): React.JSX.Element {
  const heights = [14, 24, 31, 22, 31, 18, 12]
  return (
    <div className="corg-waveform">
      {heights.map((height, index) => (
        <span
          key={index}
          className="corg-waveform__bar"
          style={{ height, animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  )
}

type MicCapsuleProps = {
  state: MicState
  onClick?: () => void
  disabled?: boolean
}

export function MicCapsule({ state, onClick, disabled }: MicCapsuleProps): React.JSX.Element {
  return (
    <button
      className={`corg-mic corg-mic--${state}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={
        state === 'idle' ? 'Start listening' : state === 'listening' ? 'Listening…' : 'Processing…'
      }
    >
      {state === 'idle' && (
        <svg width="14" height="19" viewBox="0 0 14 19" fill="white">
          <path d="M7 12c-.833 0-1.542-.292-2.125-.875S4 9.833 4 9V3c0-.833.292-1.542.875-2.125S6.167 0 7 0s1.542.292 2.125.875S10 2.167 10 3v6c0 .833-.292 1.542-.875 2.125S7.833 12 7 12zM6 19v-3.075c-1.733-.233-3.167-1.008-4.3-2.325S0 10.75 0 9h2c0 1.383.488 2.563 1.463 3.538S5.617 14 7 14s2.563-.487 3.538-1.462S12 10.383 12 9h2c0 1.75-.567 3.283-1.7 4.6s-2.567 2.092-4.3 2.325V19H6z" />
        </svg>
      )}
      {state === 'listening' && <Waveform />}
      {state === 'thinking' && <ThinkingSpinner speedSeconds={2.4} />}
    </button>
  )
}
