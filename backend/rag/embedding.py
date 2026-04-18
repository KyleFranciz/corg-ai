import ollama

# NOTE: MIGHT RE-EMBED ALL THE EMBEDDING WITH A DIFFERENT MODEL LATER ON


# function to help w/ embedding
def embeder(text: str):
    response = ollama.embeddings(model="nomic-embed-text", prompt=text)
    return response["embedding"]
