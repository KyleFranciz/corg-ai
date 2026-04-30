type DocumentsButtonProps = {
  count: number
  onClick: () => void
}

export function DocumentsButton({ count, onClick }: DocumentsButtonProps): React.JSX.Element {
  return (
    <button className="corg-docs-btn" onClick={onClick} aria-label={`${count} document${count !== 1 ? 's' : ''}`}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span>{count}</span>
    </button>
  )
}
