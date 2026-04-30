export type ConversationMessage = {
  id: number | null
  role: 'user' | 'agent'
  content: string
  created_at: string | null
  audio_path: string | null
}

export type ConversationSession = {
  session_id: number | null
  started_at: string | null
  ended_at: string | null
  summary: string | null
  last_message_at: string | null
  message_count: number
  document_count: number
  messages: ConversationMessage[]
}

export type CreateSessionResponse = {
  session_id: number
  started_at: string | null
}

export type ConversationsResponse = {
  conversations: ConversationSession[]
}

export type ConversationResponse = {
  conversation: ConversationSession
}

export type FollowUpQuestionResponse = {
  session_id: number
  question: string
  response: string
  retrieved_context_count: number
}

export type DeleteConversationResponse = {
  session_id: number
  messages_deleted: number
  documents_deleted: number
  chunks_deleted: number
  chroma_chunks_deleted: number
}
