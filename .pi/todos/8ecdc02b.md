{
  "id": "8ecdc02b",
  "title": "Add subagent to rename session titles from first chat message context",
  "tags": [
    "subagent",
    "session-titles",
    "chat-history"
  ],
  "status": "open",
  "created_at": "2026-04-28T16:31:02.018Z"
}

Create a subagent responsible for renaming session titles. It should use the first message in the chat history as the primary context/source when generating a new session title.

## Goals
- Add a dedicated subagent flow for session title renaming.
- Ensure title generation is grounded in the first user message in the chat history.
- Keep behavior deterministic and easy to test.

## Acceptance criteria
- A session can be passed to the subagent and returns a suggested title.
- The first chat message is explicitly used as context for naming.
- Existing session title update path is wired to this subagent.
- Basic validation for empty/missing first messages is handled.
