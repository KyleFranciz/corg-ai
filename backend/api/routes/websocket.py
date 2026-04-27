import asyncio
import functools
import json
import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import desc, select
from sqlmodel import Session as DbSession

from database.database_engine import engine, AUDIO_DIR
from database.models import Messages, MessageRole
from database.models import Session as SessionRecord
from services.agent import AgentHistoryMessage, generate_agent_response, get_history_limit
from services.audio_transcription.pipeline import record_audio_until_silent
from services.audio_transcription.pipeline import speak_response
from services.audio_transcription.pipeline import transcribe_audio
from services.websocket.connection_manager import ConnectionManager


router = APIRouter(tags=["websocket"])
compat_router = APIRouter(tags=["websocket"])
manager = ConnectionManager()
logger = logging.getLogger(__name__)


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


def _fetch_recent_history(session_id: int, db: DbSession) -> list[AgentHistoryMessage]:
    history_limit = get_history_limit()
    statement = (
        select(Messages)
        .where(Messages.session_id == session_id)
        .order_by(desc(Messages.created_at))
        .limit(history_limit)
    )
    rows = list(db.exec(statement))
    rows.reverse()

    history: list[AgentHistoryMessage] = []
    for row in rows:
        text = row.content.strip()
        if not text:
            continue

        history.append({'role': row.role.value, 'content': text})

    logger.info(
        'Loaded conversation history session_id=%s messages=%s limit=%s',
        session_id,
        len(history),
        history_limit,
    )

    return history


async def _run_audio_pipeline(
    websocket: WebSocket, session_id: int, db: DbSession
) -> str | None:
    pipeline_started_at = time.perf_counter()
    stage = "listening"
    try:
        logger.info('Pipeline started session_id=%s', session_id)

        stage_started_at = time.perf_counter()
        await _send_status(websocket, "listening", "Listening for speech")
        audio = await asyncio.to_thread(record_audio_until_silent)
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f audio_samples=%s',
            session_id,
            stage,
            time.perf_counter() - stage_started_at,
            audio.shape[0],
        )

        stage = "transcribing"
        stage_started_at = time.perf_counter()
        await _send_status(
            websocket, "transcribing", "Transcribing speech with faster-whisper"
        )
        transcript = await asyncio.to_thread(transcribe_audio, audio)
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f transcript_chars=%s',
            session_id,
            stage,
            time.perf_counter() - stage_started_at,
            len(transcript),
        )

        history = _fetch_recent_history(session_id, db)
        user_msg = Messages(
            session_id=session_id,
            role=MessageRole.user,
            content=transcript,
            audio_path=None,
        )
        db.add(user_msg)
        db.commit()
        logger.info('Stored user transcript session_id=%s transcript_chars=%s', session_id, len(transcript))

        stage = "responding"
        stage_started_at = time.perf_counter()
        await _send_status(websocket, "responding", "Generating agent response with Ollama")
        response_text = await asyncio.to_thread(generate_agent_response, transcript, history)
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f response_chars=%s',
            session_id,
            stage,
            time.perf_counter() - stage_started_at,
            len(response_text),
        )

        stage = "speaking"
        stage_started_at = time.perf_counter()
        await _send_status(websocket, "speaking", "Speaking agent response with Piper")
        audio_path = str(AUDIO_DIR / f"{uuid4()}.wav")
        await asyncio.to_thread(
            functools.partial(speak_response, response_text, save_path=audio_path)
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f audio_path=%s',
            session_id,
            stage,
            time.perf_counter() - stage_started_at,
            audio_path,
        )

        msg = Messages(
            session_id=session_id,
            role=MessageRole.agent,
            content=response_text,
            audio_path=audio_path,
        )
        db.add(msg)
        db.commit()
        logger.info('Stored agent response session_id=%s response_chars=%s', session_id, len(response_text))

        await manager.send_personal_json(
            {
                "type": "result",
                "transcript": transcript,
                "response": response_text,
                "audio_duration_seconds": round(float(audio.shape[0] / 16000), 3),
            },
            websocket,
        )
        await _send_status(websocket, "completed", "Pipeline completed")
        logger.info(
            'Pipeline completed session_id=%s total_seconds=%.3f',
            session_id,
            time.perf_counter() - pipeline_started_at,
        )
        return transcript
    except Exception as error:
        logger.exception('Pipeline failed session_id=%s stage=%s', session_id, stage)
        error_message = str(error)

        await manager.send_personal_json(
            {"type": "error", "stage": stage, "message": error_message}, websocket
        )
        return None


# func to help with controlling the websocket
async def _handle_websocket(websocket: WebSocket) -> None:
    logger.info('WebSocket connection request received')
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
        logger.info('WebSocket session created session_id=%s', session_id)
        last_transcript: str | None = None

        try:
            # handle the clean up
            while True:
                message = await websocket.receive_text()
                action = _parse_command(message)

                if action != "start_pipeline":
                    logger.warning('Unknown WebSocket action session_id=%s raw=%s', session_id, message)
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
                logger.info('Pipeline trigger acknowledged session_id=%s', session_id)
                transcript = await _run_audio_pipeline(websocket, session_id, db)
                if transcript:
                    last_transcript = transcript
        except WebSocketDisconnect:
            logger.info('WebSocket disconnected session_id=%s', session_id)
            pass
        finally:
            manager.disconnect(websocket)

            session_record.ended_at = datetime.now(timezone.utc)
            session_record.summary = last_transcript or "No transcript captured"

            try:
                db.add(session_record)
                db.commit()
                logger.info('WebSocket session closed session_id=%s', session_id)
            except Exception:
                db.rollback()
                logger.exception('Failed to persist WebSocket session closure session_id=%s', session_id)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)


@compat_router.websocket("/ws")
async def websocket_endpoint_compat(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)
