import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlmodel import Session as DbSession
from sqlmodel import select

from database.chroma_client import get_chunks_collection
from database.database_engine import DATA_DIR, engine
from database.models import Chunks, Documents, Session
from ingest import (
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    IngestionSummary,
    SUPPORTED_EXTENSIONS,
    _upsert_document,
)

router = APIRouter(prefix='/documents', tags=['documents'])

logger = logging.getLogger(__name__)

UPLOADS_DIR = DATA_DIR / 'documents'
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@router.post('/ingest')
async def upload_and_ingest_documents(
    session_id: int = Form(...),
    files: list[UploadFile] = File(...),
) -> dict[str, object]:
    if not files:
        raise HTTPException(status_code=400, detail='No files were provided')

    summary = IngestionSummary()
    saved_files: list[str] = []
    failed_files: list[dict[str, str]] = []

    with DbSession(engine) as db:
        session_row = db.get(Session, session_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail='Session not found')

        for incoming_file in files:
            raw_name = incoming_file.filename or ''
            safe_name = Path(raw_name).name
            if not safe_name:
                failed_files.append({'filename': raw_name, 'error': 'Missing filename'})
                summary.failed += 1
                continue

            extension = Path(safe_name).suffix.lower()
            if extension not in SUPPORTED_EXTENSIONS:
                failed_files.append(
                    {
                        'filename': safe_name,
                        'error': f'Unsupported file type: {extension or "(none)"}'
                    }
                )
                summary.failed += 1
                continue

            destination = UPLOADS_DIR / safe_name
            file_bytes = await incoming_file.read()
            destination.write_bytes(file_bytes)

            summary.processed += 1
            try:
                _upsert_document(
                    db=db,
                    path=destination,
                    documents_root=UPLOADS_DIR,
                    chunk_size=DEFAULT_CHUNK_SIZE,
                    chunk_overlap=DEFAULT_CHUNK_OVERLAP,
                    session_id=session_id,
                    summary=summary,
                )
                saved_files.append(safe_name)
            except Exception as exc:
                logger.exception('Failed to ingest uploaded file: %s', safe_name)
                summary.failed += 1
                failed_files.append({'filename': safe_name, 'error': str(exc)})

    return {
        'message': 'Upload ingestion complete',
        'uploaded_files': saved_files,
        'failed_files': failed_files,
        'summary': {
            'processed': summary.processed,
            'added': summary.added,
            'updated': summary.updated,
            'skipped': summary.skipped,
            'failed': summary.failed,
        },
    }


@router.get('/session/{session_id}')
def get_session_documents(session_id: int) -> dict[str, Any]:
    with DbSession(engine) as db:
        session_row = db.get(Session, session_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail='Session not found')

        documents = list(db.exec(select(Documents).where(Documents.session_id == session_id)))

        payload: list[dict[str, Any]] = []
        for document in documents:
            payload.append(
                {
                    'id': document.id,
                    'name': document.filename,
                    'file_type': document.file_type,
                    'pages': document.page_count,
                    'size_bytes': document.file_size_bytes,
                    'added_at': document.ingested_at.isoformat() if document.ingested_at else None,
                }
            )

        return {'session_id': session_id, 'documents': payload}


@router.delete('/session/{session_id}/{document_id}')
def delete_session_document(session_id: int, document_id: int) -> dict[str, Any]:
    with DbSession(engine) as db:
        document = db.get(Documents, document_id)
        if document is None or document.session_id != session_id:
            raise HTTPException(status_code=404, detail='Document not found for this session')

        chunk_rows = list(db.exec(select(Chunks).where(Chunks.document_id == document_id)))
        chunks_deleted = len(chunk_rows)
        for chunk_row in chunk_rows:
            db.delete(chunk_row)

        collection = get_chunks_collection(document.file_type)
        source_path = _resolve_source_path(document.file_path)
        existing = collection.get(where={'source_path': source_path}, include=['metadatas'])
        chunk_ids = existing.get('ids', []) if existing else []
        chroma_chunks_deleted = len(chunk_ids)
        if chunk_ids:
            collection.delete(ids=chunk_ids)

        file_path = Path(document.file_path)
        file_missing = not file_path.exists()
        file_deleted = False
        if not file_missing:
            file_path.unlink()
            file_deleted = True

        db.delete(document)
        db.commit()

        return {
            'message': 'Document deleted from session',
            'document_id': document_id,
            'session_id': session_id,
            'chunks_deleted': chunks_deleted,
            'chroma_chunks_deleted': chroma_chunks_deleted,
            'file_deleted': file_deleted,
            'file_missing': file_missing,
        }


def _resolve_source_path(file_path: str) -> str:
    path_obj = Path(file_path)
    try:
        return str(path_obj.relative_to(UPLOADS_DIR))
    except ValueError:
        return path_obj.name
