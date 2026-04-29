{
  "id": "9abfce38",
  "title": "Add tests for per-session context isolation and persistence",
  "tags": [
    "backend",
    "context",
    "session",
    "tests"
  ],
  "status": "open",
  "created_at": "2026-04-29T03:30:55.000Z"
}

Add test coverage to verify session isolation and persistence behavior for context history.

Acceptance ideas:
- Confirms no cross-session context leakage
- Confirms persistence across process restart boundaries (or mocked equivalent)
- Covers empty-history and reconnect cases
