import { apiClient } from '@renderer/lib/apiClient'
import type {
  CreateSessionResponse,
  ConversationResponse,
  ConversationsResponse,
  ConversationSession,
  DeleteConversationResponse,
  FollowUpQuestionResponse
} from '@renderer/schemas/conversation'

export async function createConversationSession(): Promise<CreateSessionResponse> {
  const response = await apiClient.post<CreateSessionResponse>('/conversation/session')
  return response.data
}

export async function getConversations(limit = 50): Promise<ConversationSession[]> {
  const response = await apiClient.get<ConversationsResponse>('/conversation', {
    params: {
      limit,
      include_messages: true
    }
  })

  return response.data.conversations
}

export async function getConversationById(conversationId: number): Promise<ConversationSession> {
  const response = await apiClient.get<ConversationResponse>(`/conversation/${conversationId}`)
  return response.data.conversation
}

export async function deleteConversationSession(
  conversationId: number
): Promise<DeleteConversationResponse> {
  const response = await apiClient.delete<DeleteConversationResponse>(
    `/conversation/${conversationId}`
  )
  return response.data
}

export async function askFollowUpQuestion(
  conversationId: number,
  question: string
): Promise<FollowUpQuestionResponse> {
  const response = await apiClient.post<FollowUpQuestionResponse>(
    `/conversation/${conversationId}/ask`,
    {
      question
    }
  )

  return response.data
}
