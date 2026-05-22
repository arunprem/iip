"""
ML Gateway — Chat Router.

Provides streaming and non-streaming chat completion endpoints that proxy
requests to the local Llama 3.1 instance at Run:ai.

Endpoints:
  - POST /           : Non-streaming chat completion
  - POST /stream     : Server-Sent Events streaming response
"""

from __future__ import annotations

import json
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from iip_core.auth import CurrentUser, get_current_user
from iip_core.logging import get_logger
from iip_llm.client import (
    ChatMessage,
    LLMClient,
    LLMResponse,
    INTELLIGENCE_ANALYST_SYSTEM_PROMPT,
    REPORT_DRAFTING_SYSTEM_PROMPT,
)

router = APIRouter()
logger = get_logger(__name__)

# Singleton LLM client — reuses the same httpx connection pool
_llm_client = LLMClient()


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    mode: str = "analyst"  # "analyst" | "report_draft"
    max_tokens: int | None = None


@router.post("/", response_model=LLMResponse)
async def chat_completion(
    payload: ChatRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> LLMResponse:
    """Non-streaming chat completion via the local Llama 3.1 Run:ai endpoint.

    The system prompt is selected based on the requested `mode`.
    Every invocation is audit-logged with the prompt hash.
    """
    system_prompt = (
        REPORT_DRAFTING_SYSTEM_PROMPT
        if payload.mode == "report_draft"
        else INTELLIGENCE_ANALYST_SYSTEM_PROMPT.format(
            classification_level=current_user.clearance_level.value,
        )
    )

    logger.info(
        "llm_chat_request",
        user_id=current_user.user_id,
        mode=payload.mode,
        message_count=len(payload.messages),
    )

    response = await _llm_client.chat(
        messages=payload.messages,
        system_prompt=system_prompt,
        max_tokens=payload.max_tokens,
    )

    logger.info(
        "llm_chat_response",
        user_id=current_user.user_id,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
        prompt_hash=response.prompt_hash,
    )

    return response


@router.post("/stream")
async def stream_chat_completion(
    payload: ChatRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> StreamingResponse:
    """Streaming chat completion via Server-Sent Events (SSE).

    Returns a text/event-stream response for use in the Analyst Workbench UI.
    """
    system_prompt = (
        REPORT_DRAFTING_SYSTEM_PROMPT
        if payload.mode == "report_draft"
        else INTELLIGENCE_ANALYST_SYSTEM_PROMPT.format(
            classification_level=current_user.clearance_level.value,
        )
    )

    logger.info(
        "llm_stream_request",
        user_id=current_user.user_id,
        mode=payload.mode,
    )

    async def event_generator() -> AsyncIterator[str]:
        async for token in _llm_client.stream_chat(
            messages=payload.messages,
            system_prompt=system_prompt,
        ):
            # JSON-encode chunks so newlines and special chars do not break SSE framing.
            yield f"data: {json.dumps(token)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
