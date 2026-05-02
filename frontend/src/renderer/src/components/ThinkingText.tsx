export function ThinkingText(): React.JSX.Element {
  return (
    <div className="corg-thinking-text" aria-live="polite">
      <span>Thinking</span>
      <span className="corg-thinking-dots" aria-hidden="true">
        <span className="corg-thinking-dot">.</span>
        <span className="corg-thinking-dot">.</span>
        <span className="corg-thinking-dot">.</span>
      </span>
    </div>
  )
}
