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

## Frontend Connection Example

Use either endpoint while migrating:

- `ws://localhost:8000/api/v1/ws`
- `ws://localhost:8000/ws`
