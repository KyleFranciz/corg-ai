import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query'
import {
  getSessionDocuments,
  uploadDocuments,
  type UploadDocumentsInput,
  type SessionDocumentsResponse,
  type UploadDocumentsResponse
} from '@renderer/api/documentsApi'

export const documentsKeys = {
  all: ['documents'] as const,
  session: (sessionId: number) => [...documentsKeys.all, 'session', sessionId] as const
}

// hook to handle session documents
export function useSessionDocumentsQuery(sessionId: number | null): {
  data: SessionDocumentsResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: sessionId ? documentsKeys.session(sessionId) : [...documentsKeys.all, 'invalid-id'],
    queryFn: () => getSessionDocuments(sessionId as number),
    enabled: sessionId !== null
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error
  }
}

// hook to handle mutation to update the documents after adding a new ones added in
export function useUploadDocumentsMutation(): UseMutationResult<
  UploadDocumentsResponse,
  Error,
  UploadDocumentsInput
> {
  return useMutation<UploadDocumentsResponse, Error, UploadDocumentsInput>({
    mutationFn: uploadDocuments
  })
}
