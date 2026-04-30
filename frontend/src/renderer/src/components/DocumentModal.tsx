import { useEffect } from 'react'
import type { SessionDocument } from '@renderer/api/documentsApi'

type DocumentModalProps = {
  documents: SessionDocument[]
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentModal({ documents, onClose }: DocumentModalProps): React.JSX.Element {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <>
      <div className="corg-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="corg-modal" role="dialog" aria-modal="true" aria-label="Session documents">
        <div className="corg-modal__header">
          <h2 className="corg-modal__title">Documents</h2>
          <button className="corg-modal__close" onClick={onClose} aria-label="Close">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="corg-modal__divider" />

        {documents.length === 0 ? (
          <p className="corg-modal__empty">No documents in this session.</p>
        ) : (
          <ul className="corg-modal__list">
            {documents.map((doc) => (
              <li key={doc.id} className="corg-doc-item">
                <div className="corg-doc-item__icon" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="corg-doc-item__body">
                  <span className="corg-doc-item__name">{doc.name}</span>
                  <span className="corg-doc-item__meta">
                    {doc.file_type.toUpperCase()}
                    {doc.pages != null ? ` · ${doc.pages} pp` : ''}
                    {' · '}
                    {formatSize(doc.size_bytes)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
