import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from database.database_engine import DATA_DIR
from rag.embedding import embedder

# path for the collection storage (got it running for docker & in regular dev mode)
DEFAULT_CHROMA_DIR = DATA_DIR / 'chromadb'
CHROMA_PATH = os.getenv("CHROMA_PATH", str(DEFAULT_CHROMA_DIR))
CHROMA_DIR = Path(CHROMA_PATH)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


# class to handle the embedding function and the info
# built to handle chromadb requirements needed for embedding
class OllamaEmbeddingFunction(EmbeddingFunction[Documents]):
    def __init__(self, model: str = "nomic-embed-text") -> None:
        self.model = model

    def __call__(self, documents: Documents) -> Embeddings:
        embeddings: Embeddings = []
        for i, text in enumerate(documents):
            try:
                embeddings.append(embedder(text))
            except Exception as exc:
                raise RuntimeError(f"Embedding failed at index {i}") from exc

        return embeddings

    @staticmethod
    def name() -> str:
        return "ollama-nomic-embed-text"

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> "OllamaEmbeddingFunction":
        model = config.get("model", "nomic-embed-text")
        return OllamaEmbeddingFunction(model=model)

    def get_config(self) -> dict[str, Any]:
        return {"model": self.model}


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
