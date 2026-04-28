import asyncio
import functools
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import desc, select
from sqlmodel import Session as DbSession

from database.database_engine import AUDIO_DIR, engine
from database.models import MessageRole, Messages
from database.models import Session as SessionRecord
from services.agent import (
    AgentHistoryMessage,
    generate_agent_response,
    get_history_limit,
    retrieve_context,
)
from services.audio_transcription.pipeline import record_audio_until_silent
from services.audio_transcription.pipeline import speak_response
from services.audio_transcription.pipeline import transcribe_audio
from services.websocket.connection_manager import ConnectionManager

router = APIRouter(tags=['websocket'])
compat_router = APIRouter(tags=['websocket'])
manager = ConnectionManager()
logger = logging.getLogger(__name__)


async def _send_status(
    websocket: WebSocket,
    session_id: int,
    stage: str,
    state: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    await manager.send_personal_json(
        {
            'type': 'status',
            'session_id': session_id,
            'stage': stage,
            'state': state,
            'message': message,
            'details': details or {},
            'timestamp': datetime.now(timezone.utc).isoformat(),
        },
        websocket,
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
    websocket: WebSocket,
    session_id: int,
    db: DbSession,
) -> dict[str, Any] | None:
    pipeline_started_at = time.perf_counter()
    stage = 'listening'
    stage_timings: dict[str, float] = {}

    try:
        logger.info('Pipeline started session_id=%s', session_id)

        stage_started_at = time.perf_counter()
        await _send_status(
            websocket,
            session_id,
            'listening',
            'started',
            'Listening for speech',
        )
        audio = await asyncio.to_thread(record_audio_until_silent)
        stage_timings['listening_seconds'] = round(
            time.perf_counter() - stage_started_at,
            3,
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f audio_samples=%s',
            session_id,
            stage,
            stage_timings['listening_seconds'],
            audio.shape[0],
        )
        await _send_status(
            websocket,
            session_id,
            'listening',
            'completed',
            'Speech captured',
            details={'duration_seconds': stage_timings['listening_seconds']},
        )

        stage = 'transcribing'
        stage_started_at = time.perf_counter()
        await _send_status(
            websocket,
            session_id,
            'transcribing',
            'started',
            'Transcribing speech with faster-whisper',
        )
        transcript = await asyncio.to_thread(transcribe_audio, audio)
        if not transcript.strip():
            raise RuntimeError('Transcription produced empty text')

        stage_timings['transcribing_seconds'] = round(
            time.perf_counter() - stage_started_at,
            3,
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f transcript_chars=%s',
            session_id,
            stage,
            stage_timings['transcribing_seconds'],
            len(transcript),
        )
        await _send_status(
            websocket,
            session_id,
            'transcribing',
            'completed',
            'Transcription completed',
            details={
                'duration_seconds': stage_timings['transcribing_seconds'],
                'transcript_chars': len(transcript),
            },
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
        logger.info(
            'Stored user transcript session_id=%s transcript_chars=%s',
            session_id,
            len(transcript),
        )

        stage = 'retrieving'
        stage_started_at = time.perf_counter()
        await _send_status(
            websocket,
            session_id,
            'retrieving',
            'started',
            'Retrieving context from ChromaDB',
        )
        retrieved_chunks = await asyncio.to_thread(retrieve_context, transcript)
        stage_timings['retrieving_seconds'] = round(
            time.perf_counter() - stage_started_at,
            3,
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f retrieved_chunks=%s',
            session_id,
            stage,
            stage_timings['retrieving_seconds'],
            len(retrieved_chunks),
        )
        await _send_status(
            websocket,
            session_id,
            'retrieving',
            'completed',
            'Context retrieval completed',
            details={
                'duration_seconds': stage_timings['retrieving_seconds'],
                'retrieved_context_count': len(retrieved_chunks),
            },
        )

        stage = 'responding'
        stage_started_at = time.perf_counter()
        await _send_status(
            websocket,
            session_id,
            'responding',
            'started',
            'Generating agent response with Ollama',
        )
        response_text = await asyncio.to_thread(
            generate_agent_response,
            transcript,
            history,
            retrieved_chunks,
        )
        stage_timings['responding_seconds'] = round(
            time.perf_counter() - stage_started_at,
            3,
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f response_chars=%s',
            session_id,
            stage,
            stage_timings['responding_seconds'],
            len(response_text),
        )
        await _send_status(
            websocket,
            session_id,
            'responding',
            'completed',
            'Agent response generated',
            details={
                'duration_seconds': stage_timings['responding_seconds'],
                'response_chars': len(response_text),
            },
        )

        stage = 'speaking'
        stage_started_at = time.perf_counter()
        await _send_status(
            websocket,
            session_id,
            'speaking',
            'started',
            'Speaking agent response with Piper',
        )
        audio_path = str(AUDIO_DIR / f'{uuid4()}.wav')
        await asyncio.to_thread(
            functools.partial(speak_response, response_text, save_path=audio_path)
        )
        stage_timings['speaking_seconds'] = round(
            time.perf_counter() - stage_started_at,
            3,
        )
        logger.info(
            'Pipeline stage completed session_id=%s stage=%s duration_seconds=%.3f audio_path=%s',
            session_id,
            stage,
            stage_timings['speaking_seconds'],
            audio_path,
        )
        await _send_status(
            websocket,
            session_id,
            'speaking',
            'completed',
            'Audio playback completed',
            details={
                'duration_seconds': stage_timings['speaking_seconds'],
                'audio_path': audio_path,
            },
        )

        msg = Messages(
            session_id=session_id,
            role=MessageRole.agent,
            content=response_text,
            audio_path=audio_path,
        )
        db.add(msg)
        db.commit()
        logger.info(
            'Stored agent response session_id=%s response_chars=%s',
            session_id,
            len(response_text),
        )

        total_seconds = round(time.perf_counter() - pipeline_started_at, 3)
        await manager.send_personal_json(
            {
                'type': 'result',
                'session_id': session_id,
                'transcript': transcript,
                'response': response_text,
                'audio_duration_seconds': round(float(audio.shape[0] / 16000), 3),
                'retrieved_context_count': len(retrieved_chunks),
                'timings': stage_timings,
                'total_seconds': total_seconds,
            },
            websocket,
        )
        await _send_status(
            websocket,
            session_id,
            'completed',
            'completed',
            'Pipeline completed',
            details={'timings': stage_timings, 'total_seconds': total_seconds},
        )
        logger.info(
            'Pipeline completed session_id=%s total_seconds=%.3f timings=%s',
            session_id,
            total_seconds,
            stage_timings,
        )

        return {
            'transcript': transcript,
            'response': response_text,
            'retrieved_context_count': len(retrieved_chunks),
            'timings': stage_timings,
            'total_seconds': total_seconds,
        }
    except Exception as error:
        logger.exception('Pipeline failed session_id=%s stage=%s', session_id, stage)
        error_message = str(error)
        elapsed_seconds = round(time.perf_counter() - pipeline_started_at, 3)

        await manager.send_personal_json(
            {
                'type': 'error',
                'session_id': session_id,
                'stage': stage,
                'message': error_message,
                'timings': stage_timings,
                'total_seconds': elapsed_seconds,
            },
            websocket,
        )
        await _send_status(
            websocket,
            session_id,
            stage,
            'failed',
            error_message,
            details={'timings': stage_timings, 'total_seconds': elapsed_seconds},
        )
        return None


async def _handle_websocket(websocket: WebSocket) -> None:
    logger.info('WebSocket connection request received')
    await manager.connect(websocket)

    with DbSession(engine) as db:
        session_record = SessionRecord()
        db.add(session_record)
        db.commit()
        db.refresh(session_record)
        session_id = session_record.id

        await _send_status(
            websocket,
            session_id,
            'connected',
            'connected',
            'Connected to FastAPI WebSocket',
        )

        logger.info('WebSocket session created session_id=%s', session_id)
        last_transcript: str | None = None

        try:
            while True:
                message = await websocket.receive_text()
                action = _parse_command(message)

                if action != 'start_pipeline':
                    logger.warning(
                        'Unknown WebSocket action session_id=%s raw=%s',
                        session_id,
                        message,
                    )
                    await manager.send_personal_json(
                        {
                            'type': 'error',
                            'session_id': session_id,
                            'stage': 'command',
                            'message': 'Unknown command. Use {"action":"start_pipeline"}.',
                        },
                        websocket,
                    )
                    continue

                await manager.send_personal_json(
                    {'type': 'ack', 'session_id': session_id, 'action': 'start_pipeline'},
                    websocket,
                )
                logger.info('Pipeline trigger acknowledged session_id=%s', session_id)
                pipeline_result = await _run_audio_pipeline(websocket, session_id, db)
                if pipeline_result:
                    last_transcript = pipeline_result['transcript']
        except WebSocketDisconnect:
            logger.info('WebSocket disconnected session_id=%s', session_id)
        finally:
            manager.disconnect(websocket)

            session_record.ended_at = datetime.now(timezone.utc)
            session_record.summary = last_transcript or 'No transcript captured'

            try:
                db.add(session_record)
                db.commit()
                logger.info('WebSocket session closed session_id=%s', session_id)
            except Exception:
                db.rollback()
                logger.exception(
                    'Failed to persist WebSocket session closure session_id=%s',
                    session_id,
                )


@router.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)


@compat_router.websocket('/ws')
async def websocket_endpoint_compat(websocket: WebSocket) -> None:
    await _handle_websocket(websocket)
