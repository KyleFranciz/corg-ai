from fastapi import APIRouter, Query

from rag.retrieval import retrieve_relevant_chunks


router = APIRouter(tags=['debug'])


@router.get('/debug/retrieval')
async def debug_retrieval(
    query: str = Query(..., min_length=1, description='Query text to retrieve context for'),
    top_k: int = Query(4, ge=1, le=25, description='Maximum number of chunks to return'),
) -> dict[str, object]:
    chunks = retrieve_relevant_chunks(query=query, top_k=top_k)
    return {
        'query': query,
        'top_k': top_k,
        'count': len(chunks),
        'chunks': [
            {
                'source_path': chunk['source_path'],
                'source_type': chunk['source_type'],
                'chunk_idx': chunk['chunk_idx'],
                'distance': chunk['distance'],
                'preview': chunk['content'][:400],
            }
            for chunk in chunks
        ],
    }
