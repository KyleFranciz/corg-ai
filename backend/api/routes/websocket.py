from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.websocket.connection_manager import ConnectionManager


router = APIRouter(tags=["websocket"])
compat_router = APIRouter(tags=["websocket"])
manager = ConnectionManager()


# func to help with controlling the websocket
async def _handle_websocket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    await manager.send_personal_message("Connected to FastAPI WebSocket", websocket)

    try:
        while True:
            # wait and show message
            message = await websocket.receive_text()
            await manager.broadcast(f"Message: {message}")
    except WebSocketDisconnect:
        # end the connection til next time
        manager.disconnect(websocket)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)


@compat_router.websocket("/ws")
async def websocket_endpoint_compat(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)
