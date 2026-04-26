import asyncio
import functools
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session as DbSession

from database.database_engine import engine, AUDIO_DIR
from database.models import Messages, MessageRole
from database.models import Session as SessionRecord
from services.audio_transcription.pipeline import record_audio_until_silent
from services.audio_transcription.pipeline import speak_response
from services.audio_transcription.pipeline import transcribe_audio
from services.websocket.connection_manager import ConnectionManager


router = APIRouter(tags=["websocket"])
compat_router = APIRouter(tags=["websocket"])
manager = ConnectionManager()


# send updates on the current status of the socket
async def _send_status(websocket: WebSocket, stage: str, message: str) -> None:
    await manager.send_personal_json(
        {"type": "status", "stage": stage, "message": message}, websocket
    )


# function to help with parsing the commands we get through websocket
def _parse_command(raw_message: str) -> str | None:
    message = raw_message.strip()
    if not message:
        return None

    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        plain_action = message.lower()
        if plain_action in {"start", "run", "start_pipeline"}:
            return "start_pipeline"
        return None

    if isinstance(payload, dict):
        action = payload.get("action")
        if isinstance(action, str):
            return action.strip().lower()

    return None


async def _run_audio_pipeline(
    websocket: WebSocket, session_id: int, db: DbSession
) -> str | None:
    stage = "listening"
    try:
        await _send_status(websocket, "listening", "Listening for speech")
        audio = await asyncio.to_thread(record_audio_until_silent)

        stage = "transcribing"
        await _send_status(
            websocket, "transcribing", "Transcribing speech with faster-whisper"
        )
        transcript = await asyncio.to_thread(transcribe_audio, audio)

        stage = "speaking"
        await _send_status(websocket, "speaking", "Speaking transcript with Piper")
        audio_path = str(AUDIO_DIR / f"{uuid4()}.wav")
        await asyncio.to_thread(
            functools.partial(speak_response, transcript, save_path=audio_path)
        )

        msg = Messages(
            session_id=session_id,
            role=MessageRole.agent,
            content=transcript,
            audio_path=audio_path,
        )
        db.add(msg)
        db.commit()

        await manager.send_personal_json(
            {
                "type": "result",
                "transcript": transcript,
                "audio_duration_seconds": round(float(audio.shape[0] / 16000), 3),
            },
            websocket,
        )
        await _send_status(websocket, "completed", "Pipeline completed")
        return transcript
    except Exception as error:
        error_message = str(error)

        await manager.send_personal_json(
            {"type": "error", "stage": stage, "message": error_message}, websocket
        )
        return None


# func to help with controlling the websocket
async def _handle_websocket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    await manager.send_personal_json(
        {
            "type": "status",
            "stage": "connected",
            "message": "Connected to FastAPI WebSocket",
        },
        websocket,
    )

    # access the database and use it create a sessionID for each new conversation
    with DbSession(engine) as db:
        # create session record to store in the db
        session_record = SessionRecord()
        db.add(session_record)
        db.commit()
        db.refresh(session_record)
        session_id = session_record.id
        last_transcript: str | None = None

        try:
            # handle the clean up
            while True:
                message = await websocket.receive_text()
                action = _parse_command(message)

                if action != "start_pipeline":
                    await manager.send_personal_json(
                        {
                            "type": "error",
                            "stage": "command",
                            "message": 'Unknown command. Use {"action":"start_pipeline"}.',
                        },
                        websocket,
                    )
                    continue

                await manager.send_personal_json(
                    {"type": "ack", "action": "start_pipeline"}, websocket
                )
                transcript = await _run_audio_pipeline(websocket, session_id, db)
                if transcript:
                    last_transcript = transcript
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(websocket)

            session_record.ended_at = datetime.now(timezone.utc)
            session_record.summary = last_transcript or "No transcript captured"

            try:
                db.add(session_record)
                db.commit()
            except Exception:
                db.rollback()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)


@compat_router.websocket("/ws")
async def websocket_endpoint_compat(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)
