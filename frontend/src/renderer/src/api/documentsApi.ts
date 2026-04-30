import { apiClient } from '@renderer/lib/apiClient'

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

export async function uploadDocuments(files: File[]): Promise<UploadDocumentsResponse> {
  const formData = new FormData()
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
