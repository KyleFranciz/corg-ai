from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader
from sqlmodel import Session as DbSession
from sqlmodel import select

from database.chroma_client import get_chunks_collection
from database.database_engine import create_database, engine
from database.models import Chunks, DocumentStatus, Documents

# help with logging the output
logger = logging.getLogger(__name__)

# constanst of the chroma
DEFAULT_DOCUMENTS_DIR = Path(__file__).resolve().parent / "data" / "documents"
SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf"}
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200


# schema
@dataclass
class IngestionSummary:
    processed: int = 0
    added: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0


# encode
def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _read_pdf_file(path: Path) -> str:
    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(page_text)

    return "\n\n".join(pages)


def _load_document_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return _read_text_file(path)
    if suffix == ".pdf":
        return _read_pdf_file(path)

    raise ValueError(f"Unsupported file type: {suffix}")


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    clean_text = text.strip()
    if not clean_text:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(clean_text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = clean_text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = max(0, end - chunk_overlap)

    return chunks


def _resolve_source_type(path: Path) -> str:
    return path.suffix.lower().lstrip(".")


def _chunk_id(source_path: str, source_type: str, chunk_idx: int) -> str:
    digest = _sha256(f"{source_type}:{source_path}:{chunk_idx}")
    return f"{source_type}_{digest[:24]}"


def _ensure_document_row(db: DbSession, path: Path, source_type: str) -> Documents:
    path_string = str(path.resolve())
    existing = db.exec(
        select(Documents).where(Documents.file_path == path_string)
    ).first()
    now = datetime.now(timezone.utc)

    if existing is None:
        existing = Documents(
            filename=path.name,
            file_path=path_string,
            file_type=source_type,
            ingested_at=now,
            chunk_count=0,
            status=DocumentStatus.ingesting,
        )
        db.add(existing)
    else:
        existing.filename = path.name
        existing.file_type = source_type
        existing.ingested_at = now
        existing.status = DocumentStatus.ingesting

    db.commit()
    db.refresh(existing)
    return existing


def _mark_document_failed(db: DbSession, document: Documents) -> None:
    document.status = DocumentStatus.failed
    db.add(document)
    db.commit()


def _sync_sqlite_chunks(
    db: DbSession,
    document_id: int,
    chunk_ids: list[str],
    chunk_texts: list[str],
) -> None:
    existing_rows = list(
        db.exec(select(Chunks).where(Chunks.document_id == document_id))
    )
    by_index = {row.chunk_idx: row for row in existing_rows}
    valid_indexes: set[int] = set()

    for index, (chunk_id, chunk_text) in enumerate(zip(chunk_ids, chunk_texts)):
        valid_indexes.add(index)
        row = by_index.get(index)
        if row is None:
            db.add(
                Chunks(
                    document_id=document_id,
                    chroma_id=chunk_id,
                    content=chunk_text,
                    chunk_idx=index,
                )
            )
            continue

        row.chroma_id = chunk_id
        row.content = chunk_text
        db.add(row)

    for stale_row in existing_rows:
        if stale_row.chunk_idx not in valid_indexes:
            db.delete(stale_row)


def _upsert_document(
    db: DbSession,
    path: Path,
    documents_root: Path,
    chunk_size: int,
    chunk_overlap: int,
    summary: IngestionSummary,
) -> None:
    source_type = _resolve_source_type(path)
    collection = get_chunks_collection(source_type)
    document_row = _ensure_document_row(db, path, source_type)

    source_path = str(path.relative_to(documents_root))
    text = _load_document_text(path)
    text_hash = _sha256(text)
    chunks = _chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    if not chunks:
        document_row.chunk_count = 0
        document_row.status = DocumentStatus.pending
        document_row.ingested_at = datetime.now(timezone.utc)
        db.add(document_row)

        stale_items = collection.get(
            where={"source_path": source_path},
            include=["metadatas"],
        )
        stale_ids = stale_items.get("ids", []) if stale_items else []
        if stale_ids:
            collection.delete(ids=stale_ids)

        _sync_sqlite_chunks(db, document_row.id or 0, [], [])
        db.commit()
        return

    chunk_ids: list[str] = []
    chunk_metadatas: list[dict[str, object]] = []
    for index, chunk_text in enumerate(chunks):
        chunk_ids.append(_chunk_id(source_path, source_type, index))
        chunk_metadatas.append(
            {
                "filename": path.name,
                "source_path": source_path,
                "source_type": source_type,
                "chunk_idx": index,
                "chunk_hash": _sha256(chunk_text),
                "document_hash": text_hash,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    existing_lookup: dict[str, dict[str, object]] = {}
    existing_items = collection.get(ids=chunk_ids, include=["metadatas"])
    existing_ids = existing_items.get("ids", []) if existing_items else []
    existing_metadatas = existing_items.get("metadatas", []) if existing_items else []
    for existing_id, metadata in zip(existing_ids, existing_metadatas):
        if metadata:
            existing_lookup[existing_id] = metadata

    ids_to_upsert: list[str] = []
    docs_to_upsert: list[str] = []
    metadata_to_upsert: list[dict[str, object]] = []

    for chunk_id, chunk_text, metadata in zip(chunk_ids, chunks, chunk_metadatas):
        existing_metadata = existing_lookup.get(chunk_id)
        if existing_metadata is None:
            summary.added += 1
            ids_to_upsert.append(chunk_id)
            docs_to_upsert.append(chunk_text)
            metadata_to_upsert.append(metadata)
            continue

        if existing_metadata.get("chunk_hash") != metadata["chunk_hash"]:
            summary.updated += 1
            ids_to_upsert.append(chunk_id)
            docs_to_upsert.append(chunk_text)
            metadata_to_upsert.append(metadata)
            continue

        summary.skipped += 1

    if ids_to_upsert:
        collection.upsert(
            ids=ids_to_upsert, documents=docs_to_upsert, metadatas=metadata_to_upsert
        )

    existing_for_file = collection.get(
        where={"source_path": source_path}, include=["metadatas"]
    )
    existing_file_ids = set(
        existing_for_file.get("ids", []) if existing_for_file else []
    )
    stale_ids = list(existing_file_ids - set(chunk_ids))
    if stale_ids:
        collection.delete(ids=stale_ids)
        summary.updated += len(stale_ids)

    _sync_sqlite_chunks(db, document_row.id or 0, chunk_ids, chunks)

    document_row.chunk_count = len(chunks)
    document_row.status = DocumentStatus.pending
    document_row.ingested_at = datetime.now(timezone.utc)
    db.add(document_row)
    db.commit()


def run_ingestion(
    documents_dir: Path = DEFAULT_DOCUMENTS_DIR,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> IngestionSummary:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap cannot be negative")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    create_database()

    summary = IngestionSummary()
    if not documents_dir.exists():
        print(f"No documents directory found: {documents_dir}")
        print("Create it and add .txt, .md, or .pdf files before running ingestion.")
        return summary

    files = sorted(
        path
        for path in documents_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not files:
        print(f"No supported documents found in: {documents_dir}")
        return summary

    with DbSession(engine) as db:
        for path in files:
            summary.processed += 1
            try:
                _upsert_document(
                    db=db,
                    path=path,
                    documents_root=documents_dir,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    summary=summary,
                )
                print(f"Ingested: {path.relative_to(documents_dir)}")
            except Exception as exc:
                logger.exception("Failed to ingest file: %s", path)
                summary.failed += 1

                existing = db.exec(
                    select(Documents).where(Documents.file_path == str(path.resolve()))
                ).first()
                if existing is not None:
                    _mark_document_failed(db, existing)

                print(f"Failed: {path.relative_to(documents_dir)} ({exc})")

    return summary


# help with loggin to validate
def _print_summary(summary: IngestionSummary) -> None:
    print("\nIngestion summary")
    print(f"Processed files: {summary.processed}")
    print(f"Added chunks:   {summary.added}")
    print(f"Updated chunks: {summary.updated}")
    print(f"Skipped chunks: {summary.skipped}")
    print(f"Failed files:   {summary.failed}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ingestion_summary = run_ingestion()
    _print_summary(ingestion_summary)
