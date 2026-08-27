"""Tests for the Niko AI agent endpoints."""

from unittest.mock import AsyncMock, patch

# ─── Magic Prompts ───────────────────────────────────────────────────────────


async def test_magic_prompts_default(client, auth_headers):
    resp = await client.get("/api/niko/magic-prompts?page=/projects", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "label" in data[0]
    assert "prompt" in data[0]


async def test_magic_prompts_studio(client, auth_headers):
    resp = await client.get("/api/niko/magic-prompts?page=/studio", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    labels = [p["label"] for p in data]
    assert any("persona" in label.lower() for label in labels)


async def test_magic_prompts_board(client, auth_headers):
    resp = await client.get(
        "/api/niko/magic-prompts?page=/projects/abc/board&project_id=abc",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0


async def test_magic_prompts_requires_auth(client):
    resp = await client.get("/api/niko/magic-prompts?page=/projects")
    assert resp.status_code == 401


# ─── Conversations ───────────────────────────────────────────────────────────


async def test_list_conversations_empty(client, auth_headers):
    resp = await client.get("/api/niko/conversations", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_conversations_requires_auth(client):
    resp = await client.get("/api/niko/conversations")
    assert resp.status_code == 401


async def test_get_conversation_not_found(client, auth_headers):
    resp = await client.get("/api/niko/conversations/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


async def test_delete_conversation_not_found(client, auth_headers):
    resp = await client.delete("/api/niko/conversations/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


# ─── Chat ────────────────────────────────────────────────────────────────────


async def test_chat_requires_auth(client):
    resp = await client.post(
        "/api/niko/chat",
        json={"message": "hello", "context": {"page": "/projects"}},
    )
    assert resp.status_code == 401


async def test_chat_returns_sse_stream(client, auth_headers):
    """Test that the chat endpoint returns an SSE stream with mocked AI."""
    mock_response = {
        "role": "assistant",
        "content": [{"type": "text", "text": "Hello! I'm Niko."}],
        "stop_reason": "end_turn",
    }

    with patch(
        "src.app.services.niko_service.get_ai_client",
        new_callable=AsyncMock,
    ) as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat_with_tools = AsyncMock(return_value=mock_response)
        mock_client.chat = AsyncMock(return_value="Chat Title")
        mock_get_client.return_value = mock_client

        resp = await client.post(
            "/api/niko/chat",
            json={"message": "hello", "context": {"page": "/projects"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        # Parse the SSE body
        body = resp.text
        assert "event: text" in body
        assert "event: done" in body
        assert "Niko" in body


async def test_chat_with_tool_call(client, auth_headers):
    """Test that tool calls are executed and returned in the stream."""
    # First call: AI wants to use a tool
    tool_response = {
        "role": "assistant",
        "content": [
            {"type": "tool_use", "id": "tool_1", "name": "list_projects", "input": {}},
        ],
        "stop_reason": "tool_use",
    }
    # Second call: AI gives final text response
    final_response = {
        "role": "assistant",
        "content": [{"type": "text", "text": "You have no projects yet."}],
        "stop_reason": "end_turn",
    }

    call_count = 0

    async def mock_chat_with_tools(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return tool_response
        return final_response

    with patch(
        "src.app.services.niko_service.get_ai_client",
        new_callable=AsyncMock,
    ) as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat_with_tools = AsyncMock(side_effect=mock_chat_with_tools)
        mock_client.chat = AsyncMock(return_value="Chat Title")
        mock_get_client.return_value = mock_client

        resp = await client.post(
            "/api/niko/chat",
            json={"message": "list my projects", "context": {"page": "/projects"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.text
        assert "event: tool_call" in body
        assert "event: tool_result" in body
        assert "event: done" in body


async def test_chat_creates_conversation(client, auth_headers):
    """Test that a new conversation is created on first chat."""
    mock_response = {
        "role": "assistant",
        "content": [{"type": "text", "text": "Hi there!"}],
        "stop_reason": "end_turn",
    }

    with patch(
        "src.app.services.niko_service.get_ai_client",
        new_callable=AsyncMock,
    ) as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat_with_tools = AsyncMock(return_value=mock_response)
        mock_client.chat = AsyncMock(return_value="New Chat")
        mock_get_client.return_value = mock_client

        resp = await client.post(
            "/api/niko/chat",
            json={"message": "hello", "context": {"page": "/projects"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Now conversations should have one entry
        list_resp = await client.get("/api/niko/conversations", headers=auth_headers)
        assert list_resp.status_code == 200
        convs = list_resp.json()
        assert len(convs) == 1
        assert convs[0]["title"] is not None


async def test_chat_resume_conversation(client, auth_headers):
    """Test resuming an existing conversation."""
    mock_response = {
        "role": "assistant",
        "content": [{"type": "text", "text": "Response"}],
        "stop_reason": "end_turn",
    }

    with patch(
        "src.app.services.niko_service.get_ai_client",
        new_callable=AsyncMock,
    ) as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat_with_tools = AsyncMock(return_value=mock_response)
        mock_client.chat = AsyncMock(return_value="Title")
        mock_get_client.return_value = mock_client

        # First message creates a conversation
        resp1 = await client.post(
            "/api/niko/chat",
            json={"message": "first", "context": {"page": "/projects"}},
            headers=auth_headers,
        )
        assert resp1.status_code == 200
        # Extract conversation_id from the done event
        body = resp1.text
        import json

        for line in body.split("\n"):
            if line.startswith("data: ") and "conversation_id" in line:
                data = json.loads(line[6:])
                conv_id = data.get("conversation_id")
                break

        # Second message resumes the conversation
        resp2 = await client.post(
            "/api/niko/chat",
            json={
                "conversation_id": conv_id,
                "message": "second",
                "context": {"page": "/projects"},
            },
            headers=auth_headers,
        )
        assert resp2.status_code == 200

        # Conversation should have messages from both exchanges
        detail_resp = await client.get(f"/api/niko/conversations/{conv_id}", headers=auth_headers)
        assert detail_resp.status_code == 200
        messages = detail_resp.json()["messages"]
        # Should have: user1, assistant1, user2, assistant2
        assert len(messages) >= 4


async def test_archive_conversation(client, auth_headers):
    """Test archiving a conversation."""
    mock_response = {
        "role": "assistant",
        "content": [{"type": "text", "text": "Hi"}],
        "stop_reason": "end_turn",
    }

    with patch(
        "src.app.services.niko_service.get_ai_client",
        new_callable=AsyncMock,
    ) as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat_with_tools = AsyncMock(return_value=mock_response)
        mock_client.chat = AsyncMock(return_value="Title")
        mock_get_client.return_value = mock_client

        # Create conversation
        resp = await client.post(
            "/api/niko/chat",
            json={"message": "hello", "context": {"page": "/projects"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Get conversation ID
        list_resp = await client.get("/api/niko/conversations", headers=auth_headers)
        conv_id = list_resp.json()[0]["id"]

        # Archive it
        del_resp = await client.delete(f"/api/niko/conversations/{conv_id}", headers=auth_headers)
        assert del_resp.status_code == 204

        # Should not appear in list anymore
        list_resp2 = await client.get("/api/niko/conversations", headers=auth_headers)
        assert len(list_resp2.json()) == 0
