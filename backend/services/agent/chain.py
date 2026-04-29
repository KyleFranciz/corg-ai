from __future__ import annotations

import logging
import os
import time
from typing import Any, Sequence, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from rag.retrieval import RetrievedChunk, build_context_block, retrieve_relevant_chunks
from services.offline_guard import require_local_service_url

DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_AGENT_MODEL = "qwen3.5:9b"
DEFAULT_TEMPERATURE = 0.2
DEFAULT_HISTORY_LIMIT = 12

_chat_model: ChatOllama | None = None
logger = logging.getLogger(__name__)


def _rag_debug_enabled() -> bool:
    return os.getenv("CORG_RAG_DEBUG", "false").strip().lower() == "true"


class AgentHistoryMessage(TypedDict):
    role: str
    content: str


def _read_float_env(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return float(raw_value)
    except ValueError:
        return default


def _read_int_env(name: str) -> int | None:
    raw_value = os.getenv(name)
    if raw_value is None:
        return None

    try:
        parsed = int(raw_value)
    except ValueError:
        return None

    if parsed <= 0:
        return None

    return parsed


def get_history_limit() -> int:
    history_limit = _read_int_env("CORG_AGENT_HISTORY_LIMIT")
    if history_limit is None:
        return DEFAULT_HISTORY_LIMIT

    return history_limit


def get_chat_model() -> ChatOllama:
    global _chat_model
    if _chat_model is not None:
        return _chat_model

    ollama_host = require_local_service_url(
        "OLLAMA_HOST",
        os.getenv("OLLAMA_HOST", DEFAULT_OLLAMA_HOST).strip() or DEFAULT_OLLAMA_HOST,
    )
    model_name = (
        os.getenv("CORG_AGENT_MODEL", DEFAULT_AGENT_MODEL).strip()
        or DEFAULT_AGENT_MODEL
    )
    temperature = _read_float_env("CORG_AGENT_TEMPERATURE", DEFAULT_TEMPERATURE)
    max_tokens = _read_int_env("CORG_AGENT_MAX_TOKENS")

    model_kwargs: dict[str, Any] = {
        "model": model_name,
        "base_url": ollama_host,
        "temperature": temperature,
    }
    if max_tokens is not None:
        model_kwargs["num_predict"] = max_tokens

    _chat_model = ChatOllama(**model_kwargs)
    logger.info(
        "Agent model initialized model=%s host=%s temperature=%s max_tokens=%s",
        model_name,
        ollama_host,
        temperature,
        max_tokens,
    )
    return _chat_model


def _build_history_messages(
    history_messages: Sequence[AgentHistoryMessage],
    context_block: str,
) -> list[BaseMessage]:
    messages: list[BaseMessage] = []

    system_prompt = """You are a help full agent name Corg, no need to greet the user. Your purpose is to help the user be able to recall information
    understand information whether from documents the user uploads or just general questions the user may want to know. If asked a question involving specific document(s) 
    the user has, make sure to reference the information and answer the users question to the best of your ability using the information provided. If there is no document to refference
    just answer the question to the best of your ability. Also when formatting the information to relay to the user, never use markdown formatting 
    make sure that there are no bullet points, no bold text, no headers. Respond in plain conversational sentences only, as if speaking out loud."""

    # remove if block for system_prompt
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    if context_block:
        messages.append(SystemMessage(content=context_block))

    for message in history_messages:
        content = message.get("content", "").strip()
        if not content:
            continue

        role = message.get("role", "").strip().lower()
        if role == "agent":
            messages.append(AIMessage(content=content))
        elif role == "user":
            messages.append(HumanMessage(content=content))

    return messages


def _normalize_response_content(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                text = item.strip()
            elif isinstance(item, dict):
                text = str(item.get("text", "")).strip()
            else:
                text = str(item).strip()

            if text:
                parts.append(text)

        return " ".join(parts).strip()

    return str(content).strip()


def retrieve_context(user_text: str) -> list[RetrievedChunk]:
    clean_user_text = user_text.strip()
    if not clean_user_text:
        return []

    started_at = time.perf_counter()
    chunks = retrieve_relevant_chunks(clean_user_text)
    logger.info(
        "Retrieved context chunks=%s user_chars=%s duration_seconds=%.3f",
        len(chunks),
        len(clean_user_text),
        time.perf_counter() - started_at,
    )

    if _rag_debug_enabled() and chunks:
        preview = [
            {
                "source_path": chunk["source_path"],
                "source_type": chunk["source_type"],
                "chunk_idx": chunk["chunk_idx"],
                "distance": round(chunk["distance"], 4),
                "preview": chunk["content"][:120],
            }
            for chunk in chunks
        ]
        logger.info("RAG debug retrieved_chunks=%s", preview)

    return chunks


def generate_agent_response(
    user_text: str,
    history_messages: Sequence[AgentHistoryMessage] | None = None,
    retrieved_chunks: Sequence[RetrievedChunk] | None = None,
) -> str:
    started_at = time.perf_counter()
    clean_user_text = user_text.strip()
    if not clean_user_text:
        raise RuntimeError("Cannot generate an agent response from empty user text")

    message_history = history_messages or []
    context_block = build_context_block(list(retrieved_chunks or []))
    messages = _build_history_messages(message_history, context_block)
    messages.append(HumanMessage(content=clean_user_text))

    ollama_host = require_local_service_url(
        "OLLAMA_HOST",
        os.getenv("OLLAMA_HOST", DEFAULT_OLLAMA_HOST).strip() or DEFAULT_OLLAMA_HOST,
    )
    model_name = (
        os.getenv("CORG_AGENT_MODEL", DEFAULT_AGENT_MODEL).strip()
        or DEFAULT_AGENT_MODEL
    )

    logger.info(
        "Agent generation started model=%s host=%s history_messages=%s user_chars=%s retrieved_chunks=%s",
        model_name,
        ollama_host,
        len(message_history),
        len(clean_user_text),
        len(retrieved_chunks or []),
    )

    llm = get_chat_model()
    invoke_started_at = time.perf_counter()
    try:
        response = llm.invoke(messages)
    except Exception as exc:
        logger.exception(
            "Agent generation failed model=%s host=%s history_messages=%s",
            model_name,
            ollama_host,
            len(message_history),
        )
        raise RuntimeError(
            "Agent generation failed. Ensure Ollama is running and the model is available locally."
        ) from exc

    response_text = _normalize_response_content(getattr(response, "content", response))
    if not response_text:
        raise RuntimeError("Agent returned an empty response")

    logger.info(
        "Agent generation completed model=%s invoke_seconds=%.3f total_seconds=%.3f response_chars=%s",
        model_name,
        time.perf_counter() - invoke_started_at,
        time.perf_counter() - started_at,
        len(response_text),
    )

    return response_text
