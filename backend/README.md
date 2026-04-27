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
- `OLLAMA_HOST`: Ollama base URL (default `http://127.0.0.1:11434`).
- `CORG_AGENT_MODEL`: Ollama chat model (default `qwen3.5:9b`).
- `CORG_AGENT_TEMPERATURE`: Agent temperature (default `0.2`).
- `CORG_AGENT_MAX_TOKENS`: Optional max response tokens for Ollama (`num_predict`).
- `CORG_AGENT_HISTORY_LIMIT`: Number of recent messages included in chat history (default `12`).
- `CORG_AGENT_SYSTEM_PROMPT`: Optional system prompt for the LangChain agent.

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

## Agent (LangChain + Ollama)

The WebSocket pipeline now generates an agent response with LangChain + Ollama after speech transcription, then sends that response to Piper TTS.

Local setup:

1. Start Ollama:

```bash
ollama serve
```

2. Pull the default model:

```bash
ollama pull qwen3.5:9b
```

## Chroma document ingestion (COR-18)

The backend includes a standalone ingestion script at `backend/ingest.py`.

What it does:
- Recursively scans `backend/data/documents/`.
- Supports `.txt`, `.md`, and `.pdf` files.
- Splits text into chunks (`chunk_size=1000`, `chunk_overlap=200`).
- Upserts chunks into Chroma collections separated by source type (`chunks_txt`, `chunks_md`, `chunks_pdf`).
- Syncs `Documents` and `Chunks` rows in SQLite.
- Prints per-run summary counts: processed, added, updated, skipped, failed.

### Run locally

From repo root:

```bash
cd backend
python ingest.py
```

### Run with Docker backend assumptions

If running backend in Docker, ensure environment points to mounted persistence paths:
- `CHROMA_PATH=/app/data/chromadb`
- `OLLAMA_HOST=http://host.docker.internal:11434`

Then execute inside backend container:

```bash
docker compose exec backend python ingest.py
```

### Input folder

Place documents under:

```text
backend/data/documents/
```

Subdirectories are supported.
