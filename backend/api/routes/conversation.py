import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import func, select
from sqlmodel import Session as DbSession

from database.chroma_client import get_chunks_collection
from database.database_engine import DATA_DIR, engine
from database.models import Chunks, Documents, MessageRole, Messages, Session
from services.agent import generate_agent_response, retrieve_context

router = APIRouter(tags=["conversation"])

logger = logging.getLogger(__name__)
UPLOADS_DIR = DATA_DIR / 'uploads'


def _build_conversation(
    session_row: Session,
    messages: list[Messages],
    document_count: int,
) -> dict[str, Any]:
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
        messages_payload.append(
            {
                "id": msg.id,
                "role": msg.role.value,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "audio_path": msg.audio_path,
            }
        )

    return {
        "session_id": session_row.id,
        "started_at": started_at.isoformat() if started_at else None,
        "ended_at": ended_at.isoformat() if ended_at else None,
        "summary": summary,
        "last_message_at": last_message_at.isoformat() if last_message_at else None,
        "message_count": message_count,
        "document_count": document_count,
        "messages": messages_payload,
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

        history.append({"role": message.role.value, "content": text})

    return history


class FollowUpQuestionRequest(BaseModel):
    question: str


class FollowUpQuestionResponse(BaseModel):
    session_id: int
    question: str
    response: str
    retrieved_context_count: int


class CreateSessionResponse(BaseModel):
    session_id: int
    started_at: str | None


class DeleteConversationResponse(BaseModel):
    session_id: int
    messages_deleted: int
    documents_deleted: int
    chunks_deleted: int
    chroma_chunks_deleted: int


def _resolve_source_path(file_path: str) -> str:
    path_obj = Path(file_path)
    try:
        return str(path_obj.relative_to(UPLOADS_DIR))
    except ValueError:
        return path_obj.name


@router.post("/conversation/session")
def create_conversation_session() -> CreateSessionResponse:
    with DbSession(engine) as db:
        session_row = Session()
        db.add(session_row)
        db.commit()
        db.refresh(session_row)

        return CreateSessionResponse(
            session_id=session_row.id or 0,
            started_at=session_row.started_at.isoformat() if session_row.started_at else None,
        )


@router.get("/conversation")
def list_conversations(
    limit: int = Query(
        50, ge=1, le=200, description="Maximum number of sessions to return"
    ),
    include_messages: bool = Query(
        True, description="Whether to include nested messages per session"
    ),
) -> dict[str, Any]:

    # access the database and get the conversations in order from the latest -> oldest
    with DbSession(engine) as db:
        latest_ts_subq = (
            select(
                Messages.session_id,
                func.max(Messages.created_at).label("last_message_at"),
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
        session_ids = [session.id for session in session_rows if session.id is not None]

        document_counts_by_session: dict[int, int] = {}
        if session_ids:
            document_counts_statement = (
                select(Documents.session_id, func.count(Documents.id))
                .where(Documents.session_id.in_(session_ids))
                .group_by(Documents.session_id)
            )
            for session_id, count in db.exec(document_counts_statement):
                if session_id is None:
                    continue
                document_counts_by_session[session_id] = int(count)

        conversations: list[dict[str, Any]] = []

        if not include_messages:
            for session_row in session_rows:
                last_at = None
                if session_row.started_at:
                    last_at = session_row.started_at

                conversations.append(
                    {
                        "session_id": session_row.id,
                        "started_at": session_row.started_at.isoformat()
                        if session_row.started_at
                        else None,
                        "ended_at": session_row.ended_at.isoformat()
                        if session_row.ended_at
                        else None,
                        "summary": session_row.summary,
                        "last_message_at": last_at.isoformat() if last_at else None,
                        "message_count": 0,
                        "document_count": document_counts_by_session.get(
                            session_row.id or 0, 0
                        ),
                        "messages": [],
                    }
                )
        else:
            # get messages where the session id is connected with the message
            messages_statement = select(Messages).where(
                Messages.session_id.in_(session_ids)
            )
            all_messages = list(db.exec(messages_statement))

            messages_by_session: dict[int, list[Messages]] = {}
            for msg in all_messages:
                messages_by_session.setdefault(msg.session_id, []).append(msg)

            for session_row in session_rows:
                msgs = messages_by_session.get(session_row.id, [])
                conversations.append(
                    _build_conversation(
                        session_row,
                        msgs,
                        document_counts_by_session.get(session_row.id or 0, 0),
                    )
                )

        logger.info(
            "Listed conversations sessions=%s include_messages=%s",
            len(conversations),
            include_messages,
        )

        return {
            "conversations": conversations,
        }


# get specific conversations data
@router.get("/conversation/{conversation_id}")
def get_conversation(conversation_id: int) -> dict[str, Any]:
    with DbSession(engine) as db:
        session_row = db.get(Session, conversation_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        messages = _fetch_session_messages(db, conversation_id)
        document_count = len(
            list(
                db.exec(
                    select(Documents.id).where(Documents.session_id == conversation_id)
                )
            )
        )
        conversation = _build_conversation(session_row, messages, document_count)

        return {
            "conversation": conversation,
        }


# for follow up questions about the document added
@router.post("/conversation/{conversation_id}/ask")
def ask_follow_up_question(
    conversation_id: int,
    payload: FollowUpQuestionRequest,
) -> FollowUpQuestionResponse:

    # format the question
    clean_question = payload.question.strip()
    if not clean_question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    with DbSession(engine) as db:
        session_row = db.get(Session, conversation_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        existing_messages = _fetch_session_messages(db, conversation_id)
        history = _to_agent_history(existing_messages)
        retrieved_chunks = retrieve_context(clean_question)
        response_text = generate_agent_response(
            clean_question, history, retrieved_chunks
        )

        # format the different role messages
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


@router.delete('/conversation/{conversation_id}')
def delete_conversation(conversation_id: int) -> DeleteConversationResponse:
    with DbSession(engine) as db:
        session_row = db.get(Session, conversation_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail='Conversation not found')

        messages = list(db.exec(select(Messages).where(Messages.session_id == conversation_id)))
        documents = list(db.exec(select(Documents).where(Documents.session_id == conversation_id)))

        chunks_deleted = 0
        chroma_chunks_deleted = 0

        for document in documents:
            chunk_rows = list(db.exec(select(Chunks).where(Chunks.document_id == document.id)))
            chunks_deleted += len(chunk_rows)
            for chunk_row in chunk_rows:
                db.delete(chunk_row)

            collection = get_chunks_collection(document.file_type)
            source_path = _resolve_source_path(document.file_path)
            existing = collection.get(where={'source_path': source_path}, include=['metadatas'])
            chunk_ids = existing.get('ids', []) if existing else []
            chroma_chunks_deleted += len(chunk_ids)
            if chunk_ids:
                collection.delete(ids=chunk_ids)

            file_path = Path(document.file_path)
            if file_path.exists():
                file_path.unlink()

            db.delete(document)

        for message in messages:
            db.delete(message)

        db.delete(session_row)
        db.commit()

        return DeleteConversationResponse(
            session_id=conversation_id,
            messages_deleted=len(messages),
            documents_deleted=len(documents),
            chunks_deleted=chunks_deleted,
            chroma_chunks_deleted=chroma_chunks_deleted,
        )
