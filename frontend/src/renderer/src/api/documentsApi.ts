import { apiClient } from '@renderer/lib/apiClient'

// TODO: might separate the schemas into a seperate file
export type SessionDocument = {
  id: number
  name: string
  file_type: string
  pages: number | null
  size_bytes: number
  added_at: string | null
}

export type SessionDocumentsResponse = {
  session_id: number
  documents: SessionDocument[]
}

export async function getSessionDocuments(sessionId: number): Promise<SessionDocumentsResponse> {
  const response = await apiClient.get<SessionDocumentsResponse>(`/documents/session/${sessionId}`)
  return response.data
}

// NOTE: can improve the typing for the schema
export type UploadDocumentsResponse = {
  message: string
  uploaded_files: string[]
  failed_files: Array<{
    filename: string
    error: string
  }>
  summary: {
    processed: number
    added: number
    updated: number
    skipped: number
    failed: number
  }
}

export type UploadDocumentsInput = {
  sessionId: number
  files: File[]
}

export async function uploadDocuments({
  sessionId,
  files
}: UploadDocumentsInput): Promise<UploadDocumentsResponse> {
  const formData = new FormData()
  formData.append('session_id', String(sessionId))
  // handle multiple files
  for (const file of files) {
    formData.append('files', file)
  }

  const response = await apiClient.post<UploadDocumentsResponse>('/documents/ingest', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })

  return response.data
}
