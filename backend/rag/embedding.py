import os

import ollama

from services.offline_guard import require_local_service_url


# env for the ollama server
DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434'
OLLAMA_HOST = require_local_service_url(
    'OLLAMA_HOST',
    os.getenv('OLLAMA_HOST', DEFAULT_OLLAMA_HOST),
)
ollama_client = ollama.Client(host=OLLAMA_HOST)


# function to help w/ embedding
def embedder(text: str):
    response = ollama_client.embeddings(model='nomic-embed-text', prompt=text)
    return response['embedding']
