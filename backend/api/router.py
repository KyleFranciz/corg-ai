from fastapi import APIRouter

from api.routes.conversation import router as conversation_router
from api.routes.debug import router as debug_router
from api.routes.documents import router as documents_router
from api.routes.health import router as health_router
from api.routes.websocket import router as websocket_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(conversation_router)
api_router.include_router(debug_router)
api_router.include_router(documents_router)
api_router.include_router(websocket_router)
