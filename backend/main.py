from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from api.routes.websocket import compat_router as websocket_compat_router


app = FastAPI(title="Corg API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # might change the headers to a specific one for saftey
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(
    websocket_compat_router
)  # NOTE: Fallback for websocket might remove this part later
