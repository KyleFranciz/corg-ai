type ThinkingSpinnerProps = {
  speedSeconds?: number
}

export function ThinkingSpinner({ speedSeconds = 1.4 }: ThinkingSpinnerProps): React.JSX.Element {
  return (
    <div className="corg-cube-scene" aria-hidden="true">
      <div className="corg-cube" style={{ animationDuration: `${speedSeconds}s` }}>
        <div className="corg-cube__face corg-cube__face--front" />
        <div className="corg-cube__face corg-cube__face--back" />
        <div className="corg-cube__face corg-cube__face--left" />
        <div className="corg-cube__face corg-cube__face--right" />
        <div className="corg-cube__face corg-cube__face--top" />
        <div className="corg-cube__face corg-cube__face--bottom" />
      </div>
    </div>
  )
}
