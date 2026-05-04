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

type AskFollowUpStreamHandlers = {
  onStart?: (data: { session_id: number; question: string; retrieved_context_count: number }) => void
  onChunk?: (text: string) => void
}

export async function askFollowUpQuestionStream(
  conversationId: number,
  question: string,
  handlers: AskFollowUpStreamHandlers = {}
): Promise<FollowUpQuestionResponse> {
  const baseUrl = apiClient.defaults.baseURL
  if (!baseUrl) {
    throw new Error('API client base URL is not configured')
  }

  const response = await fetch(`${baseUrl}/conversation/${conversationId}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question })
  })

  if (!response.ok) {
    let detail = 'Unable to send question'
    try {
      const errorJson = (await response.json()) as { detail?: string }
      if (errorJson.detail) {
        detail = errorJson.detail
      }
    } catch {
      // no-op
    }
    throw new Error(detail)
  }

  if (!response.body) {
    throw new Error('No response stream from backend')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let fullResponse = ''
  let finalPayload: FollowUpQuestionResponse | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const rawEvent of events) {
      const lines = rawEvent.split('\n')
      const eventLine = lines.find((line) => line.startsWith('event:'))
      const dataLine = lines.find((line) => line.startsWith('data:'))

      if (!eventLine || !dataLine) {
        continue
      }

      const eventType = eventLine.replace('event:', '').trim()
      const dataRaw = dataLine.replace('data:', '').trim()

      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(dataRaw) as Record<string, unknown>
      } catch {
        continue
      }

      if (eventType === 'start') {
        handlers.onStart?.({
          session_id: Number(payload.session_id),
          question: String(payload.question ?? ''),
          retrieved_context_count: Number(payload.retrieved_context_count ?? 0)
        })
      }

      if (eventType === 'chunk') {
        const text = String(payload.text ?? '')
        if (text) {
          fullResponse += text
          handlers.onChunk?.(text)
        }
      }

      if (eventType === 'done') {
        finalPayload = {
          session_id: Number(payload.session_id ?? conversationId),
          question: String(payload.question ?? question),
          response: String(payload.response ?? fullResponse),
          retrieved_context_count: Number(payload.retrieved_context_count ?? 0)
        }
      }

      if (eventType === 'error') {
        throw new Error(String(payload.message ?? 'Failed to generate response'))
      }
    }
  }

  if (finalPayload) {
    return finalPayload
  }

  return {
    session_id: conversationId,
    question,
    response: fullResponse,
    retrieved_context_count: 0
  }
}
