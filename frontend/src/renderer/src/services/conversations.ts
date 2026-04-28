import { apiClient } from '@renderer/lib/apiClient'
import type {
  ConversationResponse,
  ConversationsResponse,
  ConversationSession
} from '@renderer/schemas/conversation'

export async function fetchConversations(limit = 50): Promise<ConversationSession[]> {
  const response = await apiClient.get<ConversationsResponse>('/conversation', {
    params: {
      limit,
      include_messages: true
    }
  })

  return response.data.conversations
}

export async function fetchConversationById(conversationId: number): Promise<ConversationSession> {
  const response = await apiClient.get<ConversationResponse>(`/conversation/${conversationId}`)
  return response.data.conversation
}
