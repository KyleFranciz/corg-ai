# Backend API

Basic FastAPI backend with versioned API routes and WebSocket support.

## Project Structure

```
backend/
├── api/
│   ├── routes/
│   │   ├── health.py
│   │   └── websocket.py
│   └── router.py
├── services/
│   └── websocket/
│       └── connection_manager.py
└── main.py
```

## Endpoints

- `GET /api/v1/health` - Health check endpoint.
- `WS /api/v1/ws` - Versioned WebSocket endpoint.
- `WS /ws` - Backward-compatible WebSocket alias.

## Run Locally

1. Create/activate your virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the server from the repository root:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Data Directories

The backend stores runtime data in an OS-specific user data directory by default (via
`platformdirs`), which is writable on Linux, macOS, and Windows.

Environment overrides:

- `CORG_DATA_DIR`: Root directory for app data.
- `CORG_DB_PATH`: Full path to the SQLite database file.
- `CORG_AUDIO_DIR`: Directory used for generated audio (`.wav`) files.
- `CHROMA_PATH`: Directory used for ChromaDB storage.

Override precedence:

- Database file: `CORG_DB_PATH` or `<CORG_DATA_DIR>/sqlite/corg.db`.
- Audio directory: `CORG_AUDIO_DIR` or `<CORG_DATA_DIR>/audio`.
- Chroma directory: `CHROMA_PATH` or `<CORG_DATA_DIR>/chromadb`.

If any resolved directory is not writable, the backend fails fast on startup with a clear
error message.

## Frontend Connection Example

Use either endpoint while migrating:

- `ws://localhost:8000/api/v1/ws`
- `ws://localhost:8000/ws`
