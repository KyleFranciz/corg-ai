from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from api.routes.websocket import compat_router as websocket_compat_router
from database.database_engine import create_database


# Lifespan function to run when server starts up
@asynccontextmanager
async def lifespan(app: FastAPI):
    # runs on start up
    create_database()
    yield
    # might add in things after to handle shut down but should be fine


app = FastAPI(title="Corg API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # might change the headers to a specific one for saftey
)

# TODO: add the setup for the sqlite database with the initial tables


app.include_router(api_router, prefix="/api/v1")
app.include_router(
    websocket_compat_router
)  # NOTE: Fallback for websocket might remove this part later
