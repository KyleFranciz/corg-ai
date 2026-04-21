import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.audio_transcription.pipeline import record_audio_until_silent
from services.audio_transcription.pipeline import speak_response
from services.audio_transcription.pipeline import transcribe_audio
from services.websocket.connection_manager import ConnectionManager


router = APIRouter(tags=["websocket"])
compat_router = APIRouter(tags=["websocket"])
manager = ConnectionManager()


async def _send_status(websocket: WebSocket, stage: str, message: str) -> None:
    await manager.send_personal_json(
        {
            'type': 'status',
            'stage': stage,
            'message': message
        },
        websocket
    )


def _parse_command(raw_message: str) -> str | None:
    message = raw_message.strip()
    if not message:
        return None

    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        plain_action = message.lower()
        if plain_action in {'start', 'run', 'start_pipeline'}:
            return 'start_pipeline'
        return None

    if isinstance(payload, dict):
        action = payload.get('action')
        if isinstance(action, str):
            return action.strip().lower()

    return None


async def _run_audio_pipeline(websocket: WebSocket) -> None:
    stage = 'listening'
    try:
        await _send_status(websocket, 'listening', 'Listening for speech')
        audio = await asyncio.to_thread(record_audio_until_silent)

        stage = 'transcribing'
        await _send_status(websocket, 'transcribing', 'Transcribing speech with faster-whisper')
        transcript = await asyncio.to_thread(transcribe_audio, audio)

        stage = 'speaking'
        await _send_status(websocket, 'speaking', 'Speaking transcript with Piper')
        await asyncio.to_thread(speak_response, transcript)

        await manager.send_personal_json(
            {
                'type': 'result',
                'transcript': transcript,
                'audio_duration_seconds': round(float(audio.shape[0] / 16000), 3)
            },
            websocket
        )
        await _send_status(websocket, 'completed', 'Pipeline completed')
    except Exception as error:
        error_message = str(error)

        await manager.send_personal_json(
            {
                'type': 'error',
                'stage': stage,
                'message': error_message
            },
            websocket
        )


# func to help with controlling the websocket
async def _handle_websocket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    await manager.send_personal_json(
        {
            'type': 'status',
            'stage': 'connected',
            'message': 'Connected to FastAPI WebSocket'
        },
        websocket
    )

    try:
        while True:
            message = await websocket.receive_text()
            action = _parse_command(message)

            if action != 'start_pipeline':
                await manager.send_personal_json(
                    {
                        'type': 'error',
                        'stage': 'command',
                        'message': 'Unknown command. Use {"action":"start_pipeline"}.'
                    },
                    websocket
                )
                continue

            await manager.send_personal_json(
                {
                    'type': 'ack',
                    'action': 'start_pipeline'
                },
                websocket
            )
            await _run_audio_pipeline(websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)


@compat_router.websocket("/ws")
async def websocket_endpoint_compat(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)
