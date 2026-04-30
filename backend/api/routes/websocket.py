import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import desc, select
from sqlmodel import Session as DbSession

from database.database_engine import engine
from database.models import MessageRole, Messages
from database.models import Session as SessionRecord
from services.agent import (
    AgentHistoryMessage,
    get_history_limit,
    retrieve_context,
    stream_agent_response_chunks,
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


def _parse_command(raw_message: str) -> tuple[str, int | None] | None:
    message = raw_message.strip()
    if not message:
        return None

    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        plain_action = message.lower()
        if plain_action in {'start', 'run', 'start_pipeline'}:
            return ('start_pipeline', None)
        return None

    if isinstance(payload, dict):
        action = payload.get('action')
        if isinstance(action, str):
            conversation_id = payload.get('conversation_id')
            if isinstance(conversation_id, bool):
                conversation_id = None
            if isinstance(conversation_id, float):
                if conversation_id.is_integer():
                    conversation_id = int(conversation_id)
                else:
                    conversation_id = None
            if not isinstance(conversation_id, int):
                conversation_id = None
            return (action.strip().lower(), conversation_id)

    return None


def _resolve_target_session_id(
    requested_conversation_id: int | None,
    fallback_session_id: int,
    db: DbSession,
) -> int | None:
    if requested_conversation_id is None:
        return fallback_session_id

    if requested_conversation_id <= 0:
        return None

    existing_session = db.get(SessionRecord, requested_conversation_id)
    if existing_session is None:
        return None

    return existing_session.id


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


def _extract_speakable_segments(buffer: str) -> tuple[list[str], str]:
    delimiters = {'.', '!', '?', '\n'}
    segments: list[str] = []
    start = 0

    for index, char in enumerate(buffer):
        if char not in delimiters:
            continue

        segment = buffer[start:index + 1].strip()
        if segment:
            segments.append(segment)
        start = index + 1

    remainder = buffer[start:]
    return segments, remainder


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
                'transcript': transcript,
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
        responding_started_at = time.perf_counter()
        speaking_started_at: float | None = None
        response_chunks = 0
        spoken_segments = 0
        assembled_response_parts: list[str] = []
        pending_text = ''
        stage = 'responding'

        await _send_status(
            websocket,
            session_id,
            'responding',
            'started',
            'Streaming agent response with Ollama',
        )

        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def tts_worker() -> None:
            nonlocal speaking_started_at, spoken_segments
            while True:
                segment = await tts_queue.get()
                if segment is None:
                    tts_queue.task_done()
                    break

                if speaking_started_at is None:
                    speaking_started_at = time.perf_counter()
                    await _send_status(
                        websocket,
                        session_id,
                        'speaking',
                        'started',
                        'Speaking first response segment',
                    )

                await asyncio.to_thread(speak_response, segment)
                spoken_segments += 1
                await manager.send_personal_json(
                    {
                        'type': 'audio_progress',
                        'session_id': session_id,
                        'spoken_segments': spoken_segments,
                    },
                    websocket,
                )
                tts_queue.task_done()

        tts_task = asyncio.create_task(tts_worker())

        response_stream_queue: asyncio.Queue[str | None] = asyncio.Queue()

        def producer() -> None:
            for chunk in stream_agent_response_chunks(transcript, history, retrieved_chunks):
                asyncio.run_coroutine_threadsafe(response_stream_queue.put(chunk), loop)
            asyncio.run_coroutine_threadsafe(response_stream_queue.put(None), loop)

        loop = asyncio.get_running_loop()
        producer_task = asyncio.create_task(asyncio.to_thread(producer))

        while True:
            chunk = await response_stream_queue.get()
            if chunk is None:
                response_stream_queue.task_done()
                break

            response_chunks += 1
            assembled_response_parts.append(chunk)
            pending_text += chunk

            await manager.send_personal_json(
                {
                    'type': 'response_chunk',
                    'session_id': session_id,
                    'content': chunk,
                    'chunk_index': response_chunks - 1,
                },
                websocket,
            )

            segments, remainder = _extract_speakable_segments(pending_text)
            pending_text = remainder
            for segment in segments:
                await tts_queue.put(segment)

            response_stream_queue.task_done()

        await producer_task

        if pending_text.strip():
            await tts_queue.put(pending_text.strip())

        await tts_queue.put(None)
        await tts_queue.join()
        await tts_task

        response_text = ''.join(assembled_response_parts).strip()
        if not response_text:
            raise RuntimeError('Agent returned an empty response')

        stage_timings['responding_seconds'] = round(
            time.perf_counter() - responding_started_at,
            3,
        )
        await _send_status(
            websocket,
            session_id,
            'responding',
            'completed',
            'Agent response streaming completed',
            details={
                'duration_seconds': stage_timings['responding_seconds'],
                'response_chars': len(response_text),
                'response_chunks': response_chunks,
            },
        )

        speaking_total = 0.0
        if speaking_started_at is not None:
            speaking_total = time.perf_counter() - speaking_started_at
        stage_timings['speaking_seconds'] = round(speaking_total, 3)
        await _send_status(
            websocket,
            session_id,
            'speaking',
            'completed',
            'Audio playback completed',
            details={
                'duration_seconds': stage_timings['speaking_seconds'],
                'spoken_segments': spoken_segments,
            },
        )

        msg = Messages(
            session_id=session_id,
            role=MessageRole.agent,
            content=response_text,
            audio_path=None,
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
                'audio_duration_seconds': stage_timings.get('speaking_seconds', 0.0),
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
                parsed_command = _parse_command(message)
                if parsed_command is None:
                    action = None
                    requested_conversation_id = None
                else:
                    action, requested_conversation_id = parsed_command

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

                target_session_id = _resolve_target_session_id(
                    requested_conversation_id=requested_conversation_id,
                    fallback_session_id=session_id,
                    db=db,
                )
                if target_session_id is None:
                    logger.warning(
                        'Invalid conversation_id for pipeline session_id=%s conversation_id=%s',
                        session_id,
                        requested_conversation_id,
                    )
                    await manager.send_personal_json(
                        {
                            'type': 'error',
                            'session_id': session_id,
                            'stage': 'command',
                            'message': 'Invalid conversation_id. Provide an existing positive id.',
                        },
                        websocket,
                    )
                    continue

                await manager.send_personal_json(
                    {'type': 'ack', 'session_id': target_session_id, 'action': 'start_pipeline'},
                    websocket,
                )
                logger.info(
                    'Pipeline trigger acknowledged socket_session_id=%s target_session_id=%s',
                    session_id,
                    target_session_id,
                )
                pipeline_result = await _run_audio_pipeline(websocket, target_session_id, db)
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
