"""
ML Gateway — RAG Router.

Retrieval-Augmented Generation pipeline:
  1. Embed user query → Elasticsearch k-NN dense-vector search
  2. Fetch entity context from Neo4j knowledge graph
  3. Build a structured context window
  4. Synthesize answer with Llama 3.1

Endpoints:
  - POST /query   : Full RAG pipeline query
  - POST /search  : Elasticsearch-only hybrid search (no LLM synthesis)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from iip_core.auth import CurrentUser, get_current_user, require_clearance
from iip_core.logging import get_logger
from iip_core.settings import ClassificationLevel

router = APIRouter()
logger = get_logger(__name__)


class RAGQueryRequest(BaseModel):
    query: str
    index_names: list[str] = ["iip-cases", "iip-intelligence-reports", "iip-osint"]
    max_retrieved_docs: int = 5
    include_graph_context: bool = True
    classification_filter: ClassificationLevel = ClassificationLevel.CONFIDENTIAL


class DocumentChunk(BaseModel):
    doc_id: str
    title: str
    excerpt: str
    score: float
    classification: str
    source: str


class RAGQueryResponse(BaseModel):
    query: str
    answer: str
    sources: list[DocumentChunk]
    graph_entities: list[dict]
    model_used: str
    total_tokens: int


class HybridSearchRequest(BaseModel):
    query: str
    index_names: list[str] = ["iip-cases"]
    size: int = 10
    classification_filter: ClassificationLevel = ClassificationLevel.CONFIDENTIAL


class HybridSearchResponse(BaseModel):
    query: str
    hits: list[DocumentChunk]
    total_hits: int


@router.post("/query", response_model=RAGQueryResponse)
async def rag_query(
    payload: RAGQueryRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> RAGQueryResponse:
    """Full RAG pipeline: Elasticsearch retrieval + Neo4j graph + Llama 3.1 synthesis.

    Classification gate: only returns documents at or below user's clearance.
    """
    logger.info(
        "rag_query_initiated",
        user_id=current_user.user_id,
        query_preview=payload.query[:100],
        indices=payload.index_names,
        classification_filter=payload.classification_filter,
    )

    # TODO: Implement full RAG pipeline:
    # 1. Call Elasticsearch k-NN with query embedding
    # 2. Filter hits by classification <= user clearance
    # 3. Fetch Neo4j entity subgraph for named entities in query
    # 4. Build context window: [retrieved docs] + [graph context]
    # 5. Call LLMClient.chat() with RAG context + user query
    # 6. Return structured response with source citations

    return RAGQueryResponse(
        query=payload.query,
        answer="RAG pipeline implementation in progress. Elasticsearch + Neo4j + Llama 3.1 integration pending.",
        sources=[],
        graph_entities=[],
        model_used="meta-llama/Llama-3.1-70B-Instruct",
        total_tokens=0,
    )


@router.post("/search", response_model=HybridSearchResponse)
async def hybrid_search(
    payload: HybridSearchRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> HybridSearchResponse:
    """Elasticsearch hybrid search (BM25 + dense vector k-NN) without LLM synthesis.

    Returns ranked document chunks for the Analyst Workbench sidebar.
    """
    logger.info(
        "hybrid_search_initiated",
        user_id=current_user.user_id,
        query_preview=payload.query[:100],
        indices=payload.index_names,
    )

    # TODO: Implement Elasticsearch hybrid search:
    # GET /{index}/_search with:
    #   "knn": { "field": "embedding", "query_vector": [...], "k": size, "num_candidates": size*10 }
    #   "query": { "bool": { "filter": [{"term": {"classification": ...}}] } }

    return HybridSearchResponse(query=payload.query, hits=[], total_hits=0)
