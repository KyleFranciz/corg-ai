{
  "id": "dea6cb88",
  "title": "Add ability to delete a session and all related data",
  "tags": [
    "backend",
    "frontend",
    "data"
  ],
  "status": "open",
  "created_at": "2026-04-30T07:06:49.455Z"
}

Implement a feature to fully delete a session and all information pertaining to that session.

Scope:
- Add backend support to delete a session by ID.
- Ensure all associated records/files/vector entries tied to the session are removed.
- Update any local storage/DB references so no orphaned data remains.
- Add frontend UI action (e.g., delete button + confirmation) to trigger session deletion.
- Refresh session list/state after deletion.
- Validate error handling for missing/invalid session IDs.

Acceptance criteria:
- Deleting a session removes the session and all related data from local storage.
- Session no longer appears in UI after deletion.
- No orphaned records remain for deleted session.
- Operation is offline-first and uses local persistence only.
