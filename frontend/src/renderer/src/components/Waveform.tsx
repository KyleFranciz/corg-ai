export function Waveform(): React.JSX.Element {
  const heights = [14, 24, 31, 22, 31, 18, 12]

  return (
    <div className="corg-waveform" aria-hidden="true">
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
