import { useQuery } from '@tanstack/react-query'
import { getConversationById, getConversations } from '@renderer/api/conversationsApi'
import type { ConversationSession } from '@renderer/schemas/conversation'

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
