import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlmodel import Session as DbSession

from database.database_engine import DATA_DIR, engine
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
async def upload_and_ingest_documents(files: list[UploadFile] = File(...)) -> dict[str, object]:
    if not files:
        raise HTTPException(status_code=400, detail='No files were provided')

    summary = IngestionSummary()
    saved_files: list[str] = []
    failed_files: list[dict[str, str]] = []

    with DbSession(engine) as db:
        for incoming_file in files:
            raw_name = incoming_file.filename or ''
            safe_name = Path(raw_name).name
            if not safe_name:
                failed_files.append({'filename': raw_name, 'error': 'Missing filename'})
                summary.failed += 1
                continue

            extension = Path(safe_name).suffix.lower()
            if extension not in SUPPORTED_EXTENSIONS:
                failed_files.append({
                    'filename': safe_name,
                    'error': f'Unsupported file type: {extension or "(none)"}'
                })
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
