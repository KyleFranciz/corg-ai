from __future__ import annotations

import logging
import os
from typing import TypedDict

from database.chroma_client import get_collection, list_chunk_collection_names

logger = logging.getLogger(__name__)

DEFAULT_RETRIEVAL_TOP_K = 4


class RetrievedChunk(TypedDict):
    content: str
    source_path: str
    source_type: str
    chunk_idx: int
    distance: float


def _read_top_k() -> int:
    """
    Reads the number of chunks to retrieve per query from the CORG_RAG_TOP_K env var.
    Falls back to DEFAULT_RETRIEVAL_TOP_K if unset or invalid.
    """
    raw_value = os.getenv('CORG_RAG_TOP_K')
    if raw_value is None:
        return DEFAULT_RETRIEVAL_TOP_K

    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_RETRIEVAL_TOP_K

    return parsed if parsed > 0 else DEFAULT_RETRIEVAL_TOP_K


def retrieve_relevant_chunks(
    query: str,
    top_k: int | None = None,
    session_id: int | None = None,
) -> list[RetrievedChunk]:
    """
    Queries all Chroma chunk collections for text chunks most relevant to the given query.
    Each collection is searched independently, results are merged, sorted by semantic
    distance, and the top-K are returned. Skips collections that fail without aborting.

    If session_id is provided, only chunks that were ingested under that session are
    returned. This prevents documents from other conversations from leaking into the
    current session's context.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    limit = top_k or _read_top_k()
    collection_names = list_chunk_collection_names()
    if not collection_names:
        logger.info('No chunk collections found for retrieval')
        return []

    matches: list[RetrievedChunk] = []

    for collection_name in collection_names:
        try:
            collection = get_collection(collection_name)
            query_kwargs: dict = {
                'query_texts': [clean_query],
                'n_results': limit,
                'include': ['documents', 'metadatas', 'distances'],
            }
            if session_id is not None:
                query_kwargs['where'] = {'session_id': session_id}
            results = collection.query(**query_kwargs)
        except Exception:
            logger.exception('Failed querying collection=%s', collection_name)
            continue

        documents = results.get('documents', [[]])
        metadatas = results.get('metadatas', [[]])
        distances = results.get('distances', [[]])

        docs_row = documents[0] if documents else []
        metadata_row = metadatas[0] if metadatas else []
        distance_row = distances[0] if distances else []

        for index, document_text in enumerate(docs_row):
            if not isinstance(document_text, str) or not document_text.strip():
                continue

            metadata = metadata_row[index] if index < len(metadata_row) else {}
            distance = distance_row[index] if index < len(distance_row) else 0.0

            source_path = str(metadata.get('source_path', 'unknown'))
            source_type = str(metadata.get('source_type', collection_name.replace('chunks_', '')))
            chunk_idx_raw = metadata.get('chunk_idx', index)
            try:
                chunk_idx = int(chunk_idx_raw)
            except (TypeError, ValueError):
                chunk_idx = index

            try:
                distance_value = float(distance)
            except (TypeError, ValueError):
                distance_value = 0.0

            matches.append(
                {
                    'content': document_text.strip(),
                    'source_path': source_path,
                    'source_type': source_type,
                    'chunk_idx': chunk_idx,
                    'distance': distance_value,
                }
            )

    matches.sort(key=lambda item: item['distance'])
    return matches[:limit]


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    """
    Converts a list of retrieved chunks into a single string block ready to inject into
    a prompt. Each chunk is numbered and prefixed with its source path, type, and chunk
    index. Returns an empty string if the list is empty.
    """
    if not chunks:
        return ''

    lines: list[str] = ['Use the following retrieved document context when relevant:']
    for index, chunk in enumerate(chunks, start=1):
        lines.append(
            (
                f"[{index}] source={chunk['source_path']} "
                f"type={chunk['source_type']} chunk={chunk['chunk_idx']}\n"
                f"{chunk['content']}"
            )
        )

    return '\n\n'.join(lines)
