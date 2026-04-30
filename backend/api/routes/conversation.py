import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import func, select
from sqlmodel import Session as DbSession

from database.database_engine import engine
from database.models import MessageRole, Messages, Session
from services.agent import generate_agent_response, retrieve_context

router = APIRouter(tags=['conversation'])

logger = logging.getLogger(__name__)


def _build_conversation(session_row: Session, messages: list[Messages]) -> dict[str, Any]:
    started_at = session_row.started_at
    ended_at = session_row.ended_at
    summary = session_row.summary

    message_rows = sorted(messages, key=lambda m: m.created_at)
    message_count = len(message_rows)

    last_message_at: datetime | None = None
    if message_rows:
        last_message_at = message_rows[-1].created_at

    messages_payload = []
    for msg in message_rows:
        messages_payload.append({
            'id': msg.id,
            'role': msg.role.value,
            'content': msg.content,
            'created_at': msg.created_at.isoformat() if msg.created_at else None,
            'audio_path': msg.audio_path,
        })

    return {
        'session_id': session_row.id,
        'started_at': started_at.isoformat() if started_at else None,
        'ended_at': ended_at.isoformat() if ended_at else None,
        'summary': summary,
        'last_message_at': last_message_at.isoformat() if last_message_at else None,
        'message_count': message_count,
        'messages': messages_payload,
    }


def _fetch_session_messages(db: DbSession, session_id: int) -> list[Messages]:
    statement = select(Messages).where(Messages.session_id == session_id)
    return list(db.exec(statement))


def _to_agent_history(messages: list[Messages]) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in sorted(messages, key=lambda msg: msg.created_at):
        text = message.content.strip()
        if not text:
            continue

        history.append({'role': message.role.value, 'content': text})

    return history


class FollowUpQuestionRequest(BaseModel):
    question: str


class FollowUpQuestionResponse(BaseModel):
    session_id: int
    question: str
    response: str
    retrieved_context_count: int


@router.get('/conversation')
def list_conversations(
    limit: int = Query(50, ge=1, le=200, description='Maximum number of sessions to return'),
    include_messages: bool = Query(True, description='Whether to include nested messages per session'),
) -> dict[str, Any]:
    with DbSession(engine) as db:
        latest_ts_subq = (
            select(
                Messages.session_id,
                func.max(Messages.created_at).label('last_message_at'),
            )
            .group_by(Messages.session_id)
            .subquery()
        )

        statement = (
            select(Session)
            .outerjoin(latest_ts_subq, Session.id == latest_ts_subq.c.session_id)
            .order_by(
                latest_ts_subq.c.last_message_at.desc().nulls_last(),
                Session.started_at.desc(),
                Session.id.desc(),
            )
            .limit(limit)
        )

        session_rows = list(db.exec(statement))

        conversations: list[dict[str, Any]] = []

        if not include_messages:
            for session_row in session_rows:
                last_at = None
                if session_row.started_at:
                    last_at = session_row.started_at

                conversations.append({
                    'session_id': session_row.id,
                    'started_at': session_row.started_at.isoformat() if session_row.started_at else None,
                    'ended_at': session_row.ended_at.isoformat() if session_row.ended_at else None,
                    'summary': session_row.summary,
                    'last_message_at': last_at.isoformat() if last_at else None,
                    'message_count': 0,
                    'messages': [],
                })
        else:
            session_ids = [s.id for s in session_rows]
            messages_statement = select(Messages).where(Messages.session_id.in_(session_ids))
            all_messages = list(db.exec(messages_statement))

            messages_by_session: dict[int, list[Messages]] = {}
            for msg in all_messages:
                messages_by_session.setdefault(msg.session_id, []).append(msg)

            for session_row in session_rows:
                msgs = messages_by_session.get(session_row.id, [])
                conversations.append(_build_conversation(session_row, msgs))

        logger.info(
            'Listed conversations sessions=%s include_messages=%s',
            len(conversations),
            include_messages,
        )

        return {
            'conversations': conversations,
        }


@router.get('/conversation/{conversation_id}')
def get_conversation(conversation_id: int) -> dict[str, Any]:
    with DbSession(engine) as db:
        session_row = db.get(Session, conversation_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail='Conversation not found')

        messages = _fetch_session_messages(db, conversation_id)
        conversation = _build_conversation(session_row, messages)

        return {
            'conversation': conversation,
        }


@router.post('/conversation/{conversation_id}/ask')
def ask_follow_up_question(
    conversation_id: int,
    payload: FollowUpQuestionRequest,
) -> FollowUpQuestionResponse:
    clean_question = payload.question.strip()
    if not clean_question:
        raise HTTPException(status_code=400, detail='Question cannot be empty')

    with DbSession(engine) as db:
        session_row = db.get(Session, conversation_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail='Conversation not found')

        existing_messages = _fetch_session_messages(db, conversation_id)
        history = _to_agent_history(existing_messages)
        retrieved_chunks = retrieve_context(clean_question)
        response_text = generate_agent_response(clean_question, history, retrieved_chunks)

        user_message = Messages(
            session_id=conversation_id,
            role=MessageRole.user,
            content=clean_question,
            audio_path=None,
        )
        agent_message = Messages(
            session_id=conversation_id,
            role=MessageRole.agent,
            content=response_text,
            audio_path=None,
        )

        db.add(user_message)
        db.add(agent_message)
        db.commit()

        return FollowUpQuestionResponse(
            session_id=conversation_id,
            question=clean_question,
            response=response_text,
            retrieved_context_count=len(retrieved_chunks),
        )
