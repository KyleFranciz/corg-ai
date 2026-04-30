import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { uploadDocuments, type UploadDocumentsResponse } from '@renderer/api/documentsApi'

export function useUploadDocumentsMutation(): UseMutationResult<
  UploadDocumentsResponse,
  Error,
  File[]
> {
  return useMutation<UploadDocumentsResponse, Error, File[]>({
    mutationFn: uploadDocuments
  })
}
