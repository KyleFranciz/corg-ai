import { ThinkingText } from '@renderer/components/ThinkingText'

export function ThinkingAnimationBubble(): React.JSX.Element {
  return (
    <div className="corg-thinking-animation-bubble" aria-live="polite">
      <ThinkingText size="small" />
    </div>
  )
}
