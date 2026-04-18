import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from database.database_engine import BASE_DIR
from rag.embedding import embeder

# path for the collection storage (got it running for docker & in regular dev mode)
DEFAULT_CHROMA_DIR = BASE_DIR / "data" / "chromadb"
CHROMA_PATH = os.getenv("CHROMA_PATH", str(DEFAULT_CHROMA_DIR))
CHROMA_DIR = Path(CHROMA_PATH)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


# class to handle the embedding function and the info
# built to handle chromadb requirements needed for embedding
class OllamaEmbeddingFunction(EmbeddingFunction[Documents]):
    def __call__(self, input: Documents) -> Embeddings:
        return [embeder(text) for text in input]

    @staticmethod
    def name() -> str:
        return "ollama-nomic-embed-text"

    @staticmethod
    def build_from_config(config: dict) -> "OllamaEmbeddingFunction":
        return OllamaEmbeddingFunction()

    def get_config(self) -> dict:
        return {"model": "nomic-embed-text"}


# Proxy for vector database
chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
embedding_function = OllamaEmbeddingFunction()


# helper function for making collections
def collection_creator(collection_name: str, description: Optional[str] = None):
    metadata = None
    if description:
        metadata = {
            "description": description,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    return chroma_client.get_or_create_collection(
        name=collection_name, embedding_function=embedding_function, metadata=metadata
    )


# collections
chunks = collection_creator("chunks")
documents = collection_creator("documents")
memory = collection_creator("memory")
conversations = collection_creator("conversations")
