type ThinkingTextProps = {
  size?: 'default' | 'small'
}

export function ThinkingText({ size = 'default' }: ThinkingTextProps): React.JSX.Element {
  return (
    <div className={`corg-thinking-text corg-thinking-text--${size}`} aria-live="polite">
      <span>Thinking</span>
      <span className="corg-thinking-dots" aria-hidden="true">
        <span className="corg-thinking-dot">.</span>
        <span className="corg-thinking-dot">.</span>
        <span className="corg-thinking-dot">.</span>
      </span>
    </div>
  )
}
