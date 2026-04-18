import os

import ollama

# NOTE: MIGHT RE-EMBED ALL THE EMBEDDING WITH A DIFFERENT MODEL LATER ON


OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://127.0.0.1:11434')
ollama_client = ollama.Client(host=OLLAMA_HOST)


# function to help w/ embedding
def embeder(text: str):
    response = ollama_client.embeddings(model='nomic-embed-text', prompt=text)
    return response['embedding']
