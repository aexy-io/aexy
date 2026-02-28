"""Streaming agentic AI service for the Ask feature."""

import json
import logging
from collections.abc import AsyncGenerator
from uuid import uuid4

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import get_settings
from aexy.models.ask import AskConversation, AskMessage
from aexy.services.ask_tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
MAX_TOOL_ITERATIONS = 10

SYSTEM_PROMPT = """You are an AI assistant for Aexy, an Engineering OS platform. You help users manage their sprints, tasks, tickets, and other workspace data.

IMPORTANT: ALWAYS use the available tools to look up workspace data. NEVER answer questions about sprints, tasks, tickets, or any workspace data from memory or previous conversation context — always call the appropriate tool to get fresh, real-time data. Even if the user asks the same question again or says "what about now", you MUST call the tool again.

When presenting results, format them clearly. Use bullet points or numbered lists for multiple items. Include relevant details like status, dates, and counts.

If a tool returns an error, explain what happened and suggest alternatives. If a tool returns empty results, tell the user clearly that no records were found."""


def _anthropic_tool_defs() -> list[dict]:
    """Return tool definitions in Anthropic format."""
    return TOOL_DEFINITIONS


def _gemini_tool_defs() -> list[dict]:
    """Convert tool definitions to Gemini function_declarations format."""
    declarations = []
    for tool in TOOL_DEFINITIONS:
        decl = {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"],
        }
        declarations.append(decl)
    return [{"function_declarations": declarations}]


def _openai_tool_defs() -> list[dict]:
    """Convert tool definitions to OpenAI function calling format."""
    tools = []
    for tool in TOOL_DEFINITIONS:
        tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        })
    return tools


class AskService:
    """Service for AI conversations with streaming and tool execution."""

    def __init__(self, db: AsyncSession):
        self.db = db
        settings = get_settings()
        llm = settings.llm
        # Prefer Anthropic, then OpenAI, then Gemini
        if settings.anthropic_api_key:
            self._provider = "anthropic"
            self._api_key = settings.anthropic_api_key
            self._model = "claude-sonnet-4-20250514"
        elif llm.openai_api_key:
            self._provider = "openai"
            self._api_key = llm.openai_api_key
            self._model = llm.openai_model or "gpt-4o-mini"
        elif llm.gemini_api_key:
            self._provider = "gemini"
            self._api_key = llm.gemini_api_key
            self._model = llm.gemini_model or "gemini-2.0-flash"
        else:
            self._provider = "none"
            self._api_key = ""
            self._model = ""

    # --- CRUD ---

    async def list_conversations(
        self, workspace_id: str, developer_id: str, limit: int = 50
    ) -> list[dict]:
        """List conversations for a user, newest first."""
        stmt = (
            select(AskConversation)
            .where(
                AskConversation.workspace_id == workspace_id,
                AskConversation.developer_id == developer_id,
            )
            .order_by(AskConversation.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        conversations = result.scalars().all()

        out = []
        for c in conversations:
            count_stmt = (
                select(func.count())
                .select_from(AskMessage)
                .where(AskMessage.conversation_id == c.id)
            )
            count_result = await self.db.execute(count_stmt)
            msg_count = count_result.scalar() or 0

            out.append({
                "id": str(c.id),
                "workspace_id": str(c.workspace_id),
                "developer_id": str(c.developer_id),
                "title": c.title,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                "message_count": msg_count,
            })
        return out

    async def create_conversation(
        self, workspace_id: str, developer_id: str, title: str | None = None
    ) -> AskConversation:
        """Create a new conversation."""
        conv = AskConversation(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            title=title or "New conversation",
        )
        self.db.add(conv)
        await self.db.flush()
        await self.db.refresh(conv)
        return conv

    async def get_conversation(
        self, conversation_id: str, workspace_id: str, developer_id: str | None = None
    ) -> AskConversation | None:
        """Get a conversation with its messages.

        Args:
            developer_id: If provided, enforces ownership check.
        """
        conditions = [
            AskConversation.id == conversation_id,
            AskConversation.workspace_id == workspace_id,
        ]
        if developer_id:
            conditions.append(AskConversation.developer_id == developer_id)
        stmt = (
            select(AskConversation)
            .where(*conditions)
            .options(selectinload(AskConversation.messages))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_conversation(
        self, conversation_id: str, workspace_id: str, developer_id: str | None = None
    ) -> bool:
        """Delete a conversation. If developer_id is provided, enforces ownership."""
        conv = await self.get_conversation(conversation_id, workspace_id, developer_id)
        if not conv:
            return False
        await self.db.delete(conv)
        await self.db.flush()
        return True

    # --- Streaming ---

    async def stream_response(
        self,
        conversation_id: str,
        workspace_id: str,
        developer_id: str,
        user_content: str,
    ) -> AsyncGenerator[str, None]:
        """Stream an AI response with tool execution."""
        if self._provider == "none":
            yield self._sse({"type": "error", "message": "No LLM API key configured"})
            return

        conv = await self.get_conversation(conversation_id, workspace_id, developer_id)
        if not conv:
            yield self._sse({"type": "error", "message": "Conversation not found"})
            return

        msg_count = len(conv.messages)

        user_msg = AskMessage(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="user",
            content=user_content,
            message_index=msg_count,
        )
        self.db.add(user_msg)
        await self.db.flush()

        # Auto-title on first message
        if msg_count == 0:
            title = user_content[:100].strip()
            if len(user_content) > 100:
                title += "..."
            conv.title = title
            await self.db.flush()

        # Route to provider
        if self._provider == "openai":
            async for chunk in self._stream_openai(
                conv, user_content, workspace_id, developer_id, msg_count
            ):
                yield chunk
        elif self._provider == "gemini":
            async for chunk in self._stream_gemini(
                conv, user_content, workspace_id, developer_id, msg_count
            ):
                yield chunk
        else:
            async for chunk in self._stream_anthropic(
                conv, user_content, workspace_id, developer_id, msg_count
            ):
                yield chunk

    # --- OpenAI Provider ---

    async def _stream_openai(
        self,
        conv: AskConversation,
        user_content: str,
        workspace_id: str,
        developer_id: str,
        msg_count: int,
    ) -> AsyncGenerator[str, None]:
        """Stream response using OpenAI API with tool calling."""
        messages = self._build_openai_messages(conv.messages, user_content)

        full_text = ""
        all_tool_calls = []
        total_input_tokens = 0
        total_output_tokens = 0

        for iteration in range(MAX_TOOL_ITERATIONS):
            text_this_round = ""
            tool_calls_this_round = []

            payload = {
                "model": self._model,
                "messages": messages,
                "tools": _openai_tool_defs(),
                "max_tokens": 4096,
                "temperature": 0.7,
                "stream": True,
                "stream_options": {"include_usage": True},
            }

            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    OPENAI_API_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        logger.error(f"OpenAI API error {response.status_code}: {body.decode()}")
                        yield self._sse({"type": "text_delta", "text": f"API error: {response.status_code}"})
                        break

                    # Track tool call assembly during streaming
                    tc_index_map: dict[int, dict] = {}

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break

                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        # Usage info (appears in the final chunk)
                        usage = data.get("usage")
                        if usage:
                            total_input_tokens += usage.get("prompt_tokens", 0)
                            total_output_tokens += usage.get("completion_tokens", 0)

                        choices = data.get("choices", [])
                        if not choices:
                            continue

                        delta = choices[0].get("delta", {})

                        # Text content
                        content = delta.get("content")
                        if content:
                            text_this_round += content
                            yield self._sse({"type": "text_delta", "text": content})

                        # Tool calls (streamed incrementally)
                        tc_deltas = delta.get("tool_calls", [])
                        for tc_delta in tc_deltas:
                            idx = tc_delta.get("index", 0)
                            if idx not in tc_index_map:
                                tc_id = tc_delta.get("id", str(uuid4())[:8])
                                fn = tc_delta.get("function", {})
                                tc_index_map[idx] = {
                                    "id": tc_id,
                                    "name": fn.get("name", ""),
                                    "arguments": fn.get("arguments", ""),
                                }
                                yield self._sse({
                                    "type": "tool_use_start",
                                    "id": tc_id,
                                    "name": fn.get("name", ""),
                                    "input": {},
                                })
                            else:
                                fn = tc_delta.get("function", {})
                                if fn.get("arguments"):
                                    tc_index_map[idx]["arguments"] += fn["arguments"]

                    # Finalize tool calls
                    for idx in sorted(tc_index_map.keys()):
                        tc = tc_index_map[idx]
                        try:
                            tc["input"] = json.loads(tc["arguments"]) if tc["arguments"] else {}
                        except json.JSONDecodeError:
                            tc["input"] = {}
                        tool_calls_this_round.append(tc)

            full_text += text_this_round

            if not tool_calls_this_round:
                break

            # Build assistant message with tool calls for conversation
            assistant_msg_content = {
                "role": "assistant",
                "content": text_this_round or None,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc["input"]),
                        },
                    }
                    for tc in tool_calls_this_round
                ],
            }
            messages.append(assistant_msg_content)

            # Execute tools and add results
            for tc in tool_calls_this_round:
                result = await execute_tool(
                    tc["name"], tc["input"], self.db, workspace_id, developer_id
                )
                status = "error" if "error" in result else "success"

                yield self._sse({
                    "type": "tool_result",
                    "id": tc["id"],
                    "name": tc["name"],
                    "result": result,
                    "status": status,
                })

                all_tool_calls.append({
                    "id": tc["id"],
                    "tool_name": tc["name"],
                    "tool_input": tc["input"],
                    "tool_result": result,
                    "status": status,
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

        # Save assistant message
        assistant_msg = AskMessage(
            id=str(uuid4()),
            conversation_id=conv.id,
            role="assistant",
            content=full_text,
            tool_calls=all_tool_calls if all_tool_calls else None,
            token_usage={
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
            message_index=msg_count + 1,
        )
        self.db.add(assistant_msg)
        await self.db.flush()

        yield self._sse({
            "type": "usage",
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
        })
        yield self._sse({"type": "done", "message_id": str(assistant_msg.id)})

    def _build_openai_messages(
        self, existing_messages: list[AskMessage], new_user_content: str
    ) -> list[dict]:
        """Build OpenAI API messages from conversation history."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in existing_messages:
            if msg.role == "user":
                messages.append({"role": "user", "content": msg.content or ""})
            elif msg.role == "assistant":
                assistant_entry: dict = {"role": "assistant", "content": msg.content or ""}

                if msg.tool_calls:
                    assistant_entry["tool_calls"] = [
                        {
                            "id": tc.get("id", str(uuid4())),
                            "type": "function",
                            "function": {
                                "name": tc.get("tool_name", ""),
                                "arguments": json.dumps(tc.get("tool_input", {})),
                            },
                        }
                        for tc in msg.tool_calls
                    ]
                    if not assistant_entry["content"]:
                        assistant_entry["content"] = None

                messages.append(assistant_entry)

                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.get("id", ""),
                            "content": json.dumps(tc.get("tool_result", {})),
                        })

        messages.append({"role": "user", "content": new_user_content})
        return messages

    # --- Gemini Provider ---

    async def _stream_gemini(
        self,
        conv: AskConversation,
        user_content: str,
        workspace_id: str,
        developer_id: str,
        msg_count: int,
    ) -> AsyncGenerator[str, None]:
        """Stream response using Gemini API with tool calling."""
        # Build Gemini conversation history
        contents = self._build_gemini_contents(conv.messages, user_content)

        full_text = ""
        all_tool_calls = []
        total_input_tokens = 0
        total_output_tokens = 0

        for iteration in range(MAX_TOOL_ITERATIONS):
            text_this_round = ""
            function_calls = []

            # Non-streaming Gemini call (streaming + function calling is complex)
            url = f"{GEMINI_API_URL}/models/{self._model}:generateContent"
            payload = {
                "contents": contents,
                "tools": _gemini_tool_defs(),
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "generationConfig": {
                    "maxOutputTokens": 4096,
                    "temperature": 0.7,
                },
            }

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"x-goog-api-key": self._api_key},
                )

                if response.status_code != 200:
                    logger.error(f"Gemini API error {response.status_code}: {response.text}")
                    yield self._sse({"type": "text_delta", "text": f"API error: {response.status_code}"})
                    break

                data = response.json()

                # Parse usage
                usage_meta = data.get("usageMetadata", {})
                total_input_tokens += usage_meta.get("promptTokenCount", 0)
                total_output_tokens += usage_meta.get("candidatesTokenCount", 0)

                # Parse response parts
                candidates = data.get("candidates", [])
                if not candidates:
                    break

                parts = candidates[0].get("content", {}).get("parts", [])
                for part in parts:
                    if "text" in part:
                        text = part["text"]
                        text_this_round += text
                        yield self._sse({"type": "text_delta", "text": text})
                    elif "functionCall" in part:
                        fc = part["functionCall"]
                        fc_id = str(uuid4())[:8]
                        function_calls.append({
                            "id": fc_id,
                            "name": fc["name"],
                            "input": fc.get("args", {}),
                        })
                        yield self._sse({
                            "type": "tool_use_start",
                            "id": fc_id,
                            "name": fc["name"],
                            "input": fc.get("args", {}),
                        })

            full_text += text_this_round

            if not function_calls:
                break

            # Execute tools
            # Add model response to contents
            model_parts = []
            if text_this_round:
                model_parts.append({"text": text_this_round})
            for fc in function_calls:
                model_parts.append({
                    "functionCall": {
                        "name": fc["name"],
                        "args": fc["input"],
                    }
                })
            contents.append({"role": "model", "parts": model_parts})

            # Execute each tool and build function responses
            function_response_parts = []
            for fc in function_calls:
                result = await execute_tool(
                    fc["name"], fc["input"], self.db, workspace_id, developer_id
                )
                status = "error" if "error" in result else "success"

                yield self._sse({
                    "type": "tool_result",
                    "id": fc["id"],
                    "name": fc["name"],
                    "result": result,
                    "status": status,
                })

                all_tool_calls.append({
                    "id": fc["id"],
                    "tool_name": fc["name"],
                    "tool_input": fc["input"],
                    "tool_result": result,
                    "status": status,
                })

                function_response_parts.append({
                    "functionResponse": {
                        "name": fc["name"],
                        "response": result,
                    }
                })

            contents.append({"role": "user", "parts": function_response_parts})

        # Save assistant message
        assistant_msg = AskMessage(
            id=str(uuid4()),
            conversation_id=conv.id,
            role="assistant",
            content=full_text,
            tool_calls=all_tool_calls if all_tool_calls else None,
            token_usage={
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
            message_index=msg_count + 1,
        )
        self.db.add(assistant_msg)
        await self.db.flush()

        yield self._sse({
            "type": "usage",
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
        })
        yield self._sse({"type": "done", "message_id": str(assistant_msg.id)})

    def _build_gemini_contents(
        self, existing_messages: list[AskMessage], new_user_content: str
    ) -> list[dict]:
        """Build Gemini API contents from conversation history."""
        contents = []
        for msg in existing_messages:
            if msg.role == "user":
                contents.append({
                    "role": "user",
                    "parts": [{"text": msg.content or ""}],
                })
            elif msg.role == "assistant":
                parts = []
                if msg.content:
                    parts.append({"text": msg.content})
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        parts.append({
                            "functionCall": {
                                "name": tc.get("tool_name", ""),
                                "args": tc.get("tool_input", {}),
                            }
                        })
                if parts:
                    contents.append({"role": "model", "parts": parts})

                    # Add tool results
                    if msg.tool_calls:
                        fr_parts = []
                        for tc in msg.tool_calls:
                            fr_parts.append({
                                "functionResponse": {
                                    "name": tc.get("tool_name", ""),
                                    "response": tc.get("tool_result", {}),
                                }
                            })
                        if fr_parts:
                            contents.append({"role": "user", "parts": fr_parts})

        contents.append({
            "role": "user",
            "parts": [{"text": new_user_content}],
        })
        return contents

    # --- Anthropic Provider ---

    async def _stream_anthropic(
        self,
        conv: AskConversation,
        user_content: str,
        workspace_id: str,
        developer_id: str,
        msg_count: int,
    ) -> AsyncGenerator[str, None]:
        """Stream response using Anthropic API."""
        api_messages = self._build_anthropic_messages(conv.messages, user_content)

        full_text = ""
        all_tool_calls = []
        total_input_tokens = 0
        total_output_tokens = 0

        for iteration in range(MAX_TOOL_ITERATIONS):
            tool_calls_this_round = []
            text_this_round = ""

            async for event in self._call_anthropic_stream(api_messages):
                event_type = event.get("type")

                if event_type == "text_delta":
                    text = event.get("text", "")
                    text_this_round += text
                    yield self._sse({"type": "text_delta", "text": text})

                elif event_type == "tool_use_start":
                    tool_calls_this_round.append({
                        "id": event["id"],
                        "name": event["name"],
                        "input": {},
                        "input_json": "",
                    })
                    yield self._sse({
                        "type": "tool_use_start",
                        "id": event["id"],
                        "name": event["name"],
                        "input": {},
                    })

                elif event_type == "input_json_delta":
                    if tool_calls_this_round:
                        tool_calls_this_round[-1]["input_json"] += event.get("partial_json", "")

                elif event_type == "tool_use_end":
                    if tool_calls_this_round:
                        tc = tool_calls_this_round[-1]
                        try:
                            tc["input"] = json.loads(tc["input_json"]) if tc["input_json"] else {}
                        except json.JSONDecodeError:
                            tc["input"] = {}

                elif event_type == "usage":
                    total_input_tokens += event.get("input_tokens", 0)
                    total_output_tokens += event.get("output_tokens", 0)

            full_text += text_this_round

            if not tool_calls_this_round:
                break

            assistant_content = []
            if text_this_round:
                assistant_content.append({"type": "text", "text": text_this_round})

            tool_results = []
            for tc in tool_calls_this_round:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["input"],
                })

                result = await execute_tool(
                    tc["name"], tc["input"], self.db, workspace_id, developer_id
                )

                status = "error" if "error" in result else "success"
                yield self._sse({
                    "type": "tool_result",
                    "id": tc["id"],
                    "name": tc["name"],
                    "result": result,
                    "status": status,
                })

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": json.dumps(result),
                })

                all_tool_calls.append({
                    "id": tc["id"],
                    "tool_name": tc["name"],
                    "tool_input": tc["input"],
                    "tool_result": result,
                    "status": status,
                })

            api_messages.append({"role": "assistant", "content": assistant_content})
            api_messages.append({"role": "user", "content": tool_results})

        assistant_msg = AskMessage(
            id=str(uuid4()),
            conversation_id=conv.id,
            role="assistant",
            content=full_text,
            tool_calls=all_tool_calls if all_tool_calls else None,
            token_usage={
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
            message_index=msg_count + 1,
        )
        self.db.add(assistant_msg)
        await self.db.flush()

        yield self._sse({
            "type": "usage",
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
        })
        yield self._sse({"type": "done", "message_id": str(assistant_msg.id)})

    async def _call_anthropic_stream(
        self, messages: list[dict]
    ) -> AsyncGenerator[dict, None]:
        """Call Anthropic API with streaming and yield parsed events."""
        payload = {
            "model": self._model,
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": messages,
            "tools": _anthropic_tool_defs(),
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                ANTHROPIC_API_URL,
                json=payload,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error(f"Anthropic API error {response.status_code}: {body.decode()}")
                    yield {"type": "text_delta", "text": f"API error: {response.status_code}"}
                    return

                current_block_type = None
                current_block_id = None
                current_block_name = None

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break

                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    event_type = data.get("type")

                    if event_type == "content_block_start":
                        block = data.get("content_block", {})
                        current_block_type = block.get("type")
                        if current_block_type == "tool_use":
                            current_block_id = block.get("id")
                            current_block_name = block.get("name")
                            yield {
                                "type": "tool_use_start",
                                "id": current_block_id,
                                "name": current_block_name,
                            }

                    elif event_type == "content_block_delta":
                        delta = data.get("delta", {})
                        delta_type = delta.get("type")

                        if delta_type == "text_delta":
                            yield {"type": "text_delta", "text": delta.get("text", "")}
                        elif delta_type == "input_json_delta":
                            yield {
                                "type": "input_json_delta",
                                "partial_json": delta.get("partial_json", ""),
                            }

                    elif event_type == "content_block_stop":
                        if current_block_type == "tool_use":
                            yield {"type": "tool_use_end"}
                        current_block_type = None
                        current_block_id = None
                        current_block_name = None

                    elif event_type == "message_delta":
                        usage = data.get("usage", {})
                        if usage:
                            yield {
                                "type": "usage",
                                "input_tokens": usage.get("input_tokens", 0),
                                "output_tokens": usage.get("output_tokens", 0),
                            }

                    elif event_type == "message_start":
                        usage = data.get("message", {}).get("usage", {})
                        if usage:
                            yield {
                                "type": "usage",
                                "input_tokens": usage.get("input_tokens", 0),
                                "output_tokens": usage.get("output_tokens", 0),
                            }

    def _build_anthropic_messages(
        self, existing_messages: list[AskMessage], new_user_content: str
    ) -> list[dict]:
        """Build Anthropic API messages from conversation history."""
        messages = []
        for msg in existing_messages:
            if msg.role == "user":
                messages.append({"role": "user", "content": msg.content or ""})
            elif msg.role == "assistant":
                content_parts = []
                if msg.content:
                    content_parts.append({"type": "text", "text": msg.content})

                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        content_parts.append({
                            "type": "tool_use",
                            "id": tc.get("id", str(uuid4())),
                            "name": tc.get("tool_name", ""),
                            "input": tc.get("tool_input", {}),
                        })

                if content_parts:
                    messages.append({"role": "assistant", "content": content_parts})

                    if msg.tool_calls:
                        tool_results = []
                        for tc in msg.tool_calls:
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tc.get("id", ""),
                                "content": json.dumps(tc.get("tool_result", {})),
                            })
                        if tool_results:
                            messages.append({"role": "user", "content": tool_results})

        messages.append({"role": "user", "content": new_user_content})
        return messages

    @staticmethod
    def _sse(data: dict) -> str:
        """Format a dict as an SSE data line."""
        return f"data: {json.dumps(data)}\n\n"
