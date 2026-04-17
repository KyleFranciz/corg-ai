# AGENTS.md
Operational guidance for coding agents working in this repository.

## Repository Snapshot
- Monorepo with two projects: `backend/` and `frontend/`.
- Backend: FastAPI API with HTTP and WebSocket routes.
- Frontend: Electron + React + TypeScript app using electron-vite.
- No top-level task runner is defined.
- Run commands from the matching project directory.

## Rule Files (Cursor/Copilot)
- Checked `.cursor/rules/`.
- Checked `.cursorrules`.
- Checked `.github/copilot-instructions.md`.
- No Cursor or Copilot rule files currently exist.
- If they are added later, treat them as higher-priority local instructions.

## Directory-Conscious Workflow
- Backend commands run in `backend/` unless noted.
- Frontend commands run in `frontend/`.
- Do not edit generated/dependency directories:
- `frontend/node_modules/`
- `frontend/out/`
- `backend/venv/`
- Ignore `__pycache__/` artifacts.

## Backend Commands
### Setup
- `python -m venv venv`
- `source venv/bin/activate`
- `pip install -r requirements.txt`

### Run
- From repo root: `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
- From `backend/`: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

### Build
- No explicit backend build/package command is configured.

### Lint/Format
- No Python lint/format tooling is configured in repository files.
- Do not assume `ruff`, `black`, `flake8`, or `mypy` are available.
- If adding lint/format tooling, document commands here.

### Tests
- No backend tests are currently checked in.
- No `pytest.ini`, `pyproject.toml`, or other pytest config in repo.
- If pytest tests are added, use:
- `pytest`
- `pytest tests/test_health.py`
- `pytest tests/test_health.py::test_get_health -q`
- `pytest -k health -q`

## Frontend Commands
### Install
- `npm install`

### Development
- `npm run dev` (electron-vite dev)
- `npm run start` (electron-vite preview)

### Type Checking
- `npm run typecheck`
- `npm run typecheck:node`
- `npm run typecheck:web`

### Lint/Format
- `npm run lint`
- `npm run format`

### Build
- `npm run build`
- `npm run build:unpack`
- `npm run build:win`
- `npm run build:mac`
- `npm run build:linux`

### Tests
- No frontend test framework/config is present.
- No `test` script exists in `frontend/package.json`.
- If Vitest is added, typical commands are:
- `npx vitest run`
- `npx vitest run src/foo/bar.test.ts`
- `npx vitest run -t "renders title"`

## Single-Test Execution Cheatsheet
- Pytest single test: `pytest path/to/test_file.py::test_name -q`
- Pytest class test: `pytest path/to/test_file.py::TestClass::test_name -q`
- Pytest by keyword: `pytest -k "keyword" -q`
- Vitest single file: `npx vitest run path/to/file.test.ts`
- Vitest single test: `npx vitest run path/to/file.test.ts -t "test name"`

## Cross-Project Code Style
- Keep changes minimal and request-scoped.
- Preserve current architecture and file layout unless asked to refactor.
- Avoid new dependencies unless clearly necessary.
- Prefer readable, explicit code over clever abstractions.
- Keep functions focused and small.
- Add comments only for non-obvious intent.
- Do not leave broad TODO/FIXME notes without clear context.

## Python Style Guidelines (Backend)
- Follow PEP 8 conventions.
- Use 4-space indentation and LF endings.
- Use type hints on public functions and return types.
- Naming: `snake_case` for funcs/vars/modules, `PascalCase` for classes.
- Keep API routes in `backend/api/routes/` and register in `backend/api/router.py`.
- Keep endpoint handlers asynchronous when doing I/O.
- Keep WebSocket flow explicit: connect, receive loop, disconnect cleanup.
- Handle boundary exceptions where they occur (e.g., `WebSocketDisconnect`).
- Return structured responses consistently.
- Follow existing import style (`from api...`, `from services...`).

## TypeScript/React/Electron Style Guidelines (Frontend)
- Respect `.editorconfig` and `.prettierrc.yaml`:
- 2 spaces
- UTF-8
- LF line endings
- single quotes
- no semicolons
- print width 100
- trailing commas none
- Prefer explicit types; avoid `any` unless unavoidable.
- Prefer explicit return types on exported/public functions.
- Naming: `PascalCase` components, `camelCase` functions/variables.
- Keep code in expected zones:
- `src/main/` for Electron main process
- `src/preload/` for preload bridge
- `src/renderer/src/` for React renderer code
- Prefer functional components and hook-based state.
- Keep preload bridge APIs minimal and explicit.
- Validate/sanitize data crossing IPC boundaries.

## Imports and Modules
- Group imports by built-in, third-party, and local.
- Keep import order stable and readable.
- Use `@renderer/*` alias for renderer code when it improves clarity.
- Remove unused imports promptly.
- Avoid deep relative paths when a stable alias exists.

## Error Handling
- Fail fast with clear, actionable messages.
- Catch only errors that can be handled meaningfully.
- Avoid blanket catches unless rethrowing or adding context at boundaries.
- In async loops, ensure deterministic cleanup on disconnect/error.
- In Electron preload/main code, log enough context to debug safely.

## Naming Conventions
- Backend files: `snake_case.py`.
- Frontend React components: `PascalCase.tsx`.
- Test file naming when tests are added:
- Backend: `test_*.py`
- Frontend: `*.test.ts` or `*.test.tsx`
- Route handler names should describe behavior (`get_health`, `websocket_endpoint`).
- Avoid vague names like `data`, `misc`, `helper`, `tmp`.

## Agent Checklist Before Handoff
- Confirm which subproject(s) changed.
- Run relevant checks for changed area (lint/typecheck/build).
- Run tests when they exist; if absent, state that clearly.
- Prefer single-test runs while iterating; run broader checks before handoff.
- Document any newly introduced command/tooling in this file.
