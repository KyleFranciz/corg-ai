import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from database.database_engine import DATA_DIR
from rag.embedding import embedder

DEFAULT_CHROMA_DIR = DATA_DIR / 'chromadb'
CHROMA_PATH = os.getenv('CHROMA_PATH', str(DEFAULT_CHROMA_DIR))
CHROMA_DIR = Path(CHROMA_PATH)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


class OllamaEmbeddingFunction(EmbeddingFunction[Documents]):
    def __init__(self, model: str = 'nomic-embed-text') -> None:
        self.model = model

    def __call__(self, documents: Documents) -> Embeddings:
        embeddings: Embeddings = []
        for index, text in enumerate(documents):
            try:
                embeddings.append(embedder(text))
            except Exception as exc:
                raise RuntimeError(f'Embedding failed at index {index}') from exc

        return embeddings

    @staticmethod
    def name() -> str:
        return 'ollama-nomic-embed-text'

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> 'OllamaEmbeddingFunction':
        model = config.get('model', 'nomic-embed-text')
        return OllamaEmbeddingFunction(model=model)

    def get_config(self) -> dict[str, Any]:
        return {'model': self.model}


chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
embedding_function = OllamaEmbeddingFunction()


def _sanitize_source_name(source: str) -> str:
    clean = source.strip().lower()
    clean = clean.replace('/', '_').replace('\\', '_').replace(' ', '_')
    clean = ''.join(character for character in clean if character.isalnum() or character == '_')
    return clean or 'unknown'


def collection_creator(collection_name: str, description: Optional[str] = None) -> Collection:
    metadata = None
    if description:
        metadata = {
            'description': description,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }

    return chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_function,
        metadata=metadata,
    )


def get_chunks_collection(source: str) -> Collection:
    source_key = _sanitize_source_name(source)
    return collection_creator(
        f'chunks_{source_key}',
        description=f'Document chunks for source type: {source_key}',
    )


chunks = collection_creator('chunks')
documents = collection_creator('documents')
memory = collection_creator('memory')
conversations = collection_creator('conversations')
