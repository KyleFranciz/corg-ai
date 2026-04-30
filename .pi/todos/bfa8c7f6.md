{
  "id": "bfa8c7f6",
  "title": "Refactor schemas: split backend/frontend function schemas into category-based files",
  "tags": [
    "backend",
    "frontend",
    "refactor",
    "schemas"
  ],
  "status": "open",
  "created_at": "2026-04-30T07:09:23.791Z"
}

Refactor schema definitions so backend and frontend schemas currently used in functions are separated into individual files, grouped by domain/category.

Scope:
- Identify all schema definitions used by backend function handlers and frontend function callers.
- Split large/shared schema files into smaller category-focused modules (e.g., sessions, messages, files, settings, auth, etc. as applicable).
- Keep backend schemas under a clear backend schema directory structure by category.
- Keep frontend schemas/types under a clear frontend schema/type directory structure by category.
- Update all imports/usages across functions to reference the new category files.
- Remove or slim legacy catch-all schema files after migration.

Acceptance criteria:
- Schemas are organized into individual category-based files in both backend and frontend.
- All function code compiles/runs with updated imports.
- No duplicate or orphaned schema definitions remain.
- Naming and folder structure are consistent and discoverable.
