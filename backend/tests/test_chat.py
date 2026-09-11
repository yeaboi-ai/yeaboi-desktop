"""Platform chatbot tests."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.services.ai_provider import AIClient
from src.app.services.chat_tools import TOOL_SCHEMAS, execute_tool

# ── AIClient tool-calling ───────────────────────────────────────────────────


@pytest.fixture
def mock_anthropic():
    client = AsyncMock()
    return client


@pytest.fixture
def ai_client(mock_anthropic):
    return AIClient(provider="platform", anthropic_client=mock_anthropic, model="claude-sonnet-4-20250514")


def _mock_block(**fields):
    """Build a mock Anthropic content block whose .model_dump() returns the
    same fields as a dict — matching the shape AIClient normalises to."""
    block = MagicMock()
    block.type = fields.get("type")
    block.model_dump = MagicMock(return_value=fields)
    return block


@pytest.mark.asyncio
async def test_chat_with_tools_passes_tools(ai_client, mock_anthropic):
    """chat_with_tools should forward tool definitions and return a normalised dict."""
    mock_response = MagicMock()
    mock_response.stop_reason = "end_turn"
    mock_response.content = [_mock_block(type="text", text="Hello")]
    mock_anthropic.messages.create = AsyncMock(return_value=mock_response)

    tools = [
        {
            "name": "list_projects",
            "description": "List projects",
            "input_schema": {"type": "object", "properties": {}},
        }
    ]

    response = await ai_client.chat_with_tools(
        system="You are a helper.",
        messages=[{"role": "user", "content": "Hi"}],
        tools=tools,
        max_tokens=1024,
    )

    assert response["stop_reason"] == "end_turn"
    assert response["content"][0]["type"] == "text"
    call_kwargs = mock_anthropic.messages.create.call_args[1]
    assert call_kwargs["tools"] == tools
    assert call_kwargs["model"] == "claude-sonnet-4-20250514"


@pytest.mark.asyncio
async def test_chat_with_tools_returns_tool_use(ai_client, mock_anthropic):
    """When Claude wants to call a tool, chat_with_tools surfaces the tool_use block."""
    tool_block = _mock_block(
        type="tool_use", id="toolu_123", name="list_projects", input={}
    )
    mock_response = MagicMock()
    mock_response.stop_reason = "tool_use"
    mock_response.content = [tool_block]
    mock_anthropic.messages.create = AsyncMock(return_value=mock_response)

    tools = [
        {
            "name": "list_projects",
            "description": "List projects",
            "input_schema": {"type": "object", "properties": {}},
        }
    ]

    response = await ai_client.chat_with_tools(
        system="You are a helper.",
        messages=[{"role": "user", "content": "List my projects"}],
        tools=tools,
    )

    assert response["stop_reason"] == "tool_use"
    assert response["content"][0]["type"] == "tool_use"
    assert response["content"][0]["name"] == "list_projects"


@pytest.mark.asyncio
async def test_chat_with_tools_openai_converts_format():
    """OpenAI path should convert Anthropic tool schemas to OpenAI function format."""
    mock_openai = AsyncMock()
    mock_response = MagicMock()
    mock_openai.chat.completions.create = AsyncMock(return_value=mock_response)

    client = AIClient(provider="byok", openai_client=mock_openai, model="gpt-4o")

    tools = [
        {
            "name": "list_projects",
            "description": "List projects",
            "input_schema": {"type": "object", "properties": {}},
        }
    ]

    await client.chat_with_tools(
        system="Helper",
        messages=[{"role": "user", "content": "Hi"}],
        tools=tools,
    )

    call_kwargs = mock_openai.chat.completions.create.call_args[1]
    assert call_kwargs["tools"] == [
        {
            "type": "function",
            "function": {
                "name": "list_projects",
                "description": "List projects",
                "parameters": {"type": "object", "properties": {}},
            },
        }
    ]
    # System message should be prepended to messages for OpenAI
    assert call_kwargs["messages"][0] == {"role": "system", "content": "Helper"}


# ── Tool schemas ────────────────────────────────────────────────────────────


def test_tool_schemas_are_valid():
    """All tool schemas have required fields. Count is checked loosely so
    adding a new tool doesn't break the test — only reducing below the
    original 11 would."""
    assert len(TOOL_SCHEMAS) >= 11
    for schema in TOOL_SCHEMAS:
        assert "name" in schema
        assert "description" in schema
        assert "input_schema" in schema
        assert schema["input_schema"]["type"] == "object"


# ── Tool execution ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_execute_tool_list_projects(app, client, auth_headers, db_session):
    """list_projects returns projects for the org."""
    from src.app.models.organization import Organization, OrgMember, Team, TeamMember
    from src.app.models.session import Session
    from src.app.models.user import User

    # Setup: user, org, team, project
    user = User(email="test@example.com", name="Test User", role="admin")
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="admin"))
    team = Team(org_id=org.id, name="Test Team", slug="test-team")
    db_session.add(team)
    await db_session.flush()

    db_session.add(TeamMember(team_id=team.id, user_id=user.id, role="admin"))
    project = Session(name="My Session", description="A test project", org_id=org.id, team_id=team.id, owner_id=user.id)
    db_session.add(project)
    await db_session.commit()

    result = await execute_tool("list_projects", {}, org_id=org.id, team_id=team.id, db=db_session)
    assert len(result) == 1
    assert result[0]["name"] == "My Session"


@pytest.mark.asyncio
async def test_execute_tool_unknown_tool(db_session):
    """Unknown tool names return an error dict."""
    result = await execute_tool("nonexistent_tool", {}, org_id="x", team_id="x", db=db_session)
    assert "error" in result


# ── Chat endpoint ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_endpoint_streams_response(client, auth_headers):
    """POST /api/chat should return an SSE stream."""
    with patch("src.app.routers.chat.get_ai_client") as mock_get_client:
        mock_ai = AsyncMock()
        mock_get_client.return_value = mock_ai

        # chat_with_tools returns a dict (not the raw Anthropic response)
        mock_ai.chat_with_tools = AsyncMock(return_value={
            "role": "assistant",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "You have 2 projects."}],
        })

        response = await client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "List my projects"}]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        # Words are sent as separate SSE events
        assert "You" in response.text
        assert "projects." in response.text


@pytest.mark.asyncio
async def test_chat_endpoint_requires_auth(client):
    """POST /api/chat without auth should return 401."""
    response = await client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_chat_endpoint_requires_messages(client, auth_headers):
    """POST /api/chat with empty messages should return 422."""
    response = await client.post(
        "/api/chat",
        json={"messages": []},
        headers=auth_headers,
    )
    assert response.status_code == 422
