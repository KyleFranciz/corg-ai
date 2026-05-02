import { useEffect, useRef, useState } from 'react'
import type { SessionDocument } from '@renderer/api/documentsApi'

type DocumentModalProps = {
  documents: SessionDocument[]
  onClose: () => void
  onUpload: (files: File[]) => Promise<void>
  isUploading?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAdded(addedAt: string | null): string {
  if (!addedAt) return ''
  const date = new Date(addedAt)
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

function PaperclipIcon(): React.JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

export function DocumentModal({
  documents,
  onClose,
  onUpload,
  isUploading
}: DocumentModalProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalPages = documents.reduce((sum, doc) => sum + (doc.pages ?? 0), 0)
  const docCount = documents.length
  const subtitle =
    docCount === 0
      ? 'No documents in this session’s context yet.'
      : `${docCount} document${docCount !== 1 ? 's' : ''} in this session’s context${totalPages > 0 ? ` — ${totalPages} pages total` : ''}.`

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleFiles = (files: File[]): void => {
    if (files.length === 0) return
    void onUpload(files)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    handleFiles(Array.from(e.target.files ?? []))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <>
      <div className="corg-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="corg-modal" role="dialog" aria-modal="true" aria-label="Session documents">
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

        <div className="corg-modal__header">
          <h2 className="corg-modal__title">What I&apos;ve read</h2>
          <p className="corg-modal__subtitle">{subtitle}</p>
        </div>

        <div
          className={`corg-modal__dropzone${dragging ? ' corg-modal__dropzone--dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Upload documents"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="corg-modal__dropzone-main">
            <PaperclipIcon />
            <span className="corg-modal__dropzone-text">
              {isUploading ? (
                'Uploading…'
              ) : (
                <>
                  Drop a file, or <span>choose one</span>
                </>
              )}
            </span>
          </div>
          <span className="corg-modal__dropzone-hint">PDF · DOCX · TXT · MD · up to 50 MB</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        <p className="corg-modal__section">In context</p>

        {documents.length === 0 ? (
          <ul className="corg-modal__list">
            <p className="corg-modal__empty">No documents added yet.</p>
          </ul>
        ) : (
          <ul className="corg-modal__list">
            {documents.map((doc) => {
              const ext = doc.file_type.toLowerCase()
              const added = formatAdded(doc.added_at)
              return (
                <li key={doc.id} className="corg-doc-item">
                  <div className="corg-doc-badge" aria-hidden="true">
                    {ext}
                  </div>
                  <div className="corg-doc-item__body">
                    <span className="corg-doc-item__name">{doc.name}</span>
                    <span className="corg-doc-item__meta">
                      {doc.pages != null ? `${doc.pages} pages` : ext.toUpperCase()}
                      {' · '}
                      {formatSize(doc.size_bytes)}
                      {added ? ` · added ${added}` : ''}
                    </span>
                  </div>
                  <button className="corg-doc-item__remove" type="button" disabled>
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
