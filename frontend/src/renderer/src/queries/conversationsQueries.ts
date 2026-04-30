import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query'
import {
  askFollowUpQuestion,
  createConversationSession,
  deleteConversationSession,
  getConversationById,
  getConversations
} from '@renderer/api/conversationsApi'
import type {
  ConversationSession,
  CreateSessionResponse,
  DeleteConversationResponse,
  FollowUpQuestionResponse
} from '@renderer/schemas/conversation'

export const conversationsKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationsKeys.all, 'list'] as const,
  list: (limit: number) => [...conversationsKeys.lists(), { limit }] as const,
  details: () => [...conversationsKeys.all, 'detail'] as const,
  detail: (conversationId: number) => [...conversationsKeys.details(), conversationId] as const
}

export function useConversationsQuery(limit = 50): {
  data: ConversationSession[] | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: conversationsKeys.list(limit),
    queryFn: () => getConversations(limit)
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error
  }
}

export function useConversationByIdQuery(conversationId: number | null): {
  data: ConversationSession | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: conversationId
      ? conversationsKeys.detail(conversationId)
      : [...conversationsKeys.details(), 'invalid-id'],
    queryFn: () => getConversationById(conversationId as number),
    enabled: conversationId !== null
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error
  }
}

export function useAskFollowUpQuestionMutation(
  conversationId: number
): UseMutationResult<FollowUpQuestionResponse, Error, string> {
  const queryClient = useQueryClient()

  return useMutation<FollowUpQuestionResponse, Error, string>({
    mutationFn: (question: string) => askFollowUpQuestion(conversationId, question),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: conversationsKeys.detail(conversationId) })
      await queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
    }
  })
}

export function useCreateConversationSessionMutation(): UseMutationResult<
  CreateSessionResponse,
  Error,
  void
> {
  return useMutation<CreateSessionResponse, Error, void>({
    mutationFn: createConversationSession
  })
}

export function useDeleteConversationSessionMutation(): UseMutationResult<
  DeleteConversationResponse,
  Error,
  number
> {
  const queryClient = useQueryClient()

  return useMutation<DeleteConversationResponse, Error, number>({
    mutationFn: (conversationId: number) => deleteConversationSession(conversationId),
    onSuccess: async (_result, deletedId) => {
      queryClient.setQueriesData<ConversationSession[]>({ queryKey: conversationsKeys.lists() }, (previous) => {
        if (!previous) {
          return previous
        }

        return previous.filter((conversation) => conversation.session_id !== deletedId)
      })

      await queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
      await queryClient.removeQueries({ queryKey: conversationsKeys.detail(deletedId) })
    }
  })
}
