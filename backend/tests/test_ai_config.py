"""Tests for /api/orgs/{org_id}/ai-config — provider + model routing."""

import pytest
from sqlalchemy import select

from src.app.config import get_settings
from src.app.models.ai_config import OrgAIConfig
from src.app.models.organization import OrgMember
from src.app.models.user import User
from src.app.services.ai_provider import (
    _provider_for_model,
    get_ai_client,
    get_ai_client_for_role,
    get_org_ai_config,
)
from src.app.services.crypto import encrypt_api_key


def _config_url(org_id: str) -> str:
    return f"/api/orgs/{org_id}/ai-config"


@pytest.fixture
async def auth_user_as_org_admin(db_session, sample_org):
    """Ensure the auth_headers user (test@example.com) is an org admin."""
    email = "test@example.com"
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name="Test User", role="admin")
        db_session.add(user)
        await db_session.flush()

    existing = (
        await db_session.execute(
            select(OrgMember).where(OrgMember.org_id == sample_org.id, OrgMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db_session.add(OrgMember(org_id=sample_org.id, user_id=user.id, role="admin"))
    await db_session.commit()
    return user


@pytest.mark.anyio
async def test_get_returns_new_model_fields_as_null(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.get(_config_url(sample_org.id), headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    for field in (
        "byok_default_model",
        "byok_fast_model",
        "bedrock_fast_model",
        "self_hosted_fast_model",
    ):
        assert field in data
        assert data[field] is None


@pytest.mark.anyio
async def test_patch_byok_default_model_roundtrips(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"provider": "byok", "byok_provider": "anthropic", "byok_default_model": "claude-opus-4-7"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["byok_default_model"] == "claude-opus-4-7"

    # GET round-trip
    resp2 = await client.get(_config_url(sample_org.id), headers=auth_headers)
    assert resp2.json()["byok_default_model"] == "claude-opus-4-7"


@pytest.mark.anyio
async def test_patch_byok_fast_model_independent_of_default(client, auth_headers, sample_org, auth_user_as_org_admin):
    await client.patch(
        _config_url(sample_org.id),
        json={"provider": "byok", "byok_provider": "anthropic", "byok_default_model": "claude-sonnet-4-6"},
        headers=auth_headers,
    )
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"byok_fast_model": "claude-haiku-4-5-20251001"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Both should now be set; updating fast_model didn't clear default_model.
    assert data["byok_default_model"] == "claude-sonnet-4-6"
    assert data["byok_fast_model"] == "claude-haiku-4-5-20251001"


@pytest.mark.anyio
async def test_patch_empty_string_clears_override(client, auth_headers, sample_org, auth_user_as_org_admin):
    await client.patch(
        _config_url(sample_org.id),
        json={"provider": "byok", "byok_provider": "anthropic", "byok_default_model": "claude-opus-4-7"},
        headers=auth_headers,
    )
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"byok_default_model": ""},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["byok_default_model"] is None


@pytest.mark.anyio
async def test_patch_bedrock_fast_model(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"bedrock_fast_model": "anthropic.claude-3-5-haiku-20241022-v1:0"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["bedrock_fast_model"] == "anthropic.claude-3-5-haiku-20241022-v1:0"


@pytest.mark.anyio
async def test_patch_self_hosted_fast_model(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"self_hosted_fast_model": "llama-3.1-8b"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["self_hosted_fast_model"] == "llama-3.1-8b"


# ─── Model resolution in get_ai_client (BYOK + self-hosted only) ──────────────
# Bedrock paths perform STS AssumeRole on construction, which can't run in
# tests without mocking boto3. The resolution branch above it is structurally
# identical to the BYOK + self-hosted branches, so we test those two.


async def _seed_byok(db_session, org_id: str, **overrides):
    config = OrgAIConfig(
        org_id=org_id,
        provider="byok",
        byok_provider="anthropic",
        byok_api_key=encrypt_api_key("sk-test-fake-key"),
        **overrides,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    # Drop the cached config if get_org_ai_config keeps one
    _ = await get_org_ai_config(org_id, db_session)
    return config


@pytest.mark.anyio
async def test_byok_default_model_drives_default_task(db_session, sample_org):
    await _seed_byok(db_session, sample_org.id, byok_default_model="claude-opus-4-7")
    client = await get_ai_client(sample_org.id, db_session, task="default")
    assert client.model == "claude-opus-4-7"


@pytest.mark.anyio
async def test_byok_default_model_also_used_for_fast_when_no_fast_override(db_session, sample_org):
    await _seed_byok(db_session, sample_org.id, byok_default_model="claude-opus-4-7")
    client = await get_ai_client(sample_org.id, db_session, task="fast")
    # fast falls through to default_model when fast_model is unset.
    assert client.model == "claude-opus-4-7"


@pytest.mark.anyio
async def test_byok_fast_model_used_only_for_fast_task(db_session, sample_org):
    await _seed_byok(
        db_session,
        sample_org.id,
        byok_default_model="claude-sonnet-4-6",
        byok_fast_model="claude-haiku-4-5-20251001",
    )
    fast = await get_ai_client(sample_org.id, db_session, task="fast")
    deep = await get_ai_client(sample_org.id, db_session, task="default")
    assert fast.model == "claude-haiku-4-5-20251001"
    assert deep.model == "claude-sonnet-4-6"


@pytest.mark.anyio
async def test_byok_falls_back_to_hardcoded_tier_when_no_overrides(db_session, sample_org):
    await _seed_byok(db_session, sample_org.id)
    fast = await get_ai_client(sample_org.id, db_session, task="fast")
    deep = await get_ai_client(sample_org.id, db_session, task="default")
    # The hardcoded tier dict from services/ai_provider.py
    assert fast.model == "claude-haiku-4-5-20251001"
    assert deep.model == "claude-sonnet-4-6"


@pytest.mark.anyio
async def test_self_hosted_fast_model_routing(db_session, sample_org):
    config = OrgAIConfig(
        org_id=sample_org.id,
        provider="self_hosted",
        self_hosted_url="http://localhost:8080/v1",
        self_hosted_model="llama-3.1-70b",
        self_hosted_fast_model="llama-3.1-8b",
    )
    db_session.add(config)
    await db_session.commit()

    fast = await get_ai_client(sample_org.id, db_session, task="fast")
    deep = await get_ai_client(sample_org.id, db_session, task="default")
    assert fast.model == "llama-3.1-8b"
    assert deep.model == "llama-3.1-70b"


# ─── Per-task model overrides (flow / arch / wireframe) ───────────────────────


@pytest.mark.anyio
async def test_get_returns_per_task_model_fields_as_null(client, auth_headers, sample_org, auth_user_as_org_admin):
    data = (await client.get(_config_url(sample_org.id), headers=auth_headers)).json()
    for field in ("flow_model", "arch_model", "wireframe_model"):
        assert field in data and data[field] is None


@pytest.mark.anyio
async def test_patch_per_task_models_roundtrip(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"flow_model": "claude-sonnet-4-6", "arch_model": "claude-opus-4-7", "wireframe_model": "claude-opus-4-7"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["flow_model"] == "claude-sonnet-4-6"
    assert body["arch_model"] == "claude-opus-4-7"
    assert body["wireframe_model"] == "claude-opus-4-7"
    # round-trip via GET
    got = (await client.get(_config_url(sample_org.id), headers=auth_headers)).json()
    assert got["wireframe_model"] == "claude-opus-4-7"


@pytest.mark.anyio
async def test_patch_empty_string_clears_per_task_model(client, auth_headers, sample_org, auth_user_as_org_admin):
    await client.patch(_config_url(sample_org.id), json={"wireframe_model": "claude-opus-4-7"}, headers=auth_headers)
    resp = await client.patch(_config_url(sample_org.id), json={"wireframe_model": ""}, headers=auth_headers)
    assert resp.json()["wireframe_model"] is None


def test_provider_for_model_mapping():
    assert _provider_for_model("claude-opus-4-7") == "anthropic"
    assert _provider_for_model("gpt-5") == "openai"
    assert _provider_for_model("o3-mini") == "openai"
    assert _provider_for_model("gemini-2.5-pro") == "gemini"
    assert _provider_for_model("deepseek-chat") == "deepseek"
    assert _provider_for_model("qwen-max") == "qwen"
    assert _provider_for_model("mystery-model") is None
    assert _provider_for_model(None) is None


@pytest.fixture
def _platform_keys(monkeypatch):
    """Give the platform an Anthropic key so locked-role clients can build."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-platform-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _seed_role_models(db_session, org_id: str, **overrides):
    config = OrgAIConfig(org_id=org_id, provider="platform", **overrides)
    db_session.add(config)
    await db_session.commit()
    _ = await get_org_ai_config(org_id, db_session)
    return config


@pytest.mark.anyio
async def test_wireframe_role_honors_model_override(db_session, sample_org, _platform_keys):
    # wireframe defaults to DeepSeek; overriding to a Claude model must both
    # switch the model AND route to the Anthropic platform provider.
    await _seed_role_models(db_session, sample_org.id, wireframe_model="claude-opus-4-7")
    cli = await get_ai_client_for_role(sample_org.id, db_session, "wireframe")
    assert cli.model == "claude-opus-4-7"


@pytest.mark.anyio
async def test_flow_and_arch_roles_honor_overrides(db_session, sample_org, _platform_keys):
    await _seed_role_models(
        db_session, sample_org.id, flow_model="claude-sonnet-4-6", arch_model="claude-haiku-4-5-20251001"
    )
    flow = await get_ai_client_for_role(sample_org.id, db_session, "flow")
    arch = await get_ai_client_for_role(sample_org.id, db_session, "arch")
    assert flow.model == "claude-sonnet-4-6"
    assert arch.model == "claude-haiku-4-5-20251001"


@pytest.mark.anyio
async def test_role_without_override_uses_default_model(db_session, sample_org, _platform_keys):
    # No override row → flow keeps its anthropic role default (some claude-*).
    await _seed_role_models(db_session, sample_org.id)
    flow = await get_ai_client_for_role(sample_org.id, db_session, "flow")
    assert flow.model.startswith("claude")
    assert flow.model != "claude-sonnet-4-6"  # not our override value


@pytest.mark.anyio
async def test_subscreen_role_ignores_wireframe_override(db_session, sample_org, _platform_keys):
    # The 3-dropdown menu controls the hero wireframe role only; the
    # sub-screen pass must keep its own default model.
    await _seed_role_models(db_session, sample_org.id, wireframe_model="claude-opus-4-7")
    sub = await get_ai_client_for_role(sample_org.id, db_session, "wireframe_subscreen")
    assert sub.model != "claude-opus-4-7"


@pytest.mark.anyio
async def test_patch_wireframe_critic_model_roundtrips(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.patch(
        _config_url(sample_org.id),
        json={"wireframe_critic_model": "claude-opus-4-7"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["wireframe_critic_model"] == "claude-opus-4-7"
    got = (await client.get(_config_url(sample_org.id), headers=auth_headers)).json()
    assert got["wireframe_critic_model"] == "claude-opus-4-7"


@pytest.mark.anyio
async def test_patch_empty_string_clears_wireframe_critic_model(
    client, auth_headers, sample_org, auth_user_as_org_admin
):
    await client.patch(
        _config_url(sample_org.id),
        json={"wireframe_critic_model": "claude-opus-4-7"},
        headers=auth_headers,
    )
    resp = await client.patch(
        _config_url(sample_org.id), json={"wireframe_critic_model": ""}, headers=auth_headers
    )
    assert resp.json()["wireframe_critic_model"] is None


@pytest.mark.anyio
async def test_wireframe_role_defaults_to_deepseek(db_session, sample_org, monkeypatch):
    # The generator role now drafts on DeepSeek. With a deepseek key present
    # and no override, the resolved client must be a deepseek model.
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-deepseek")
    get_settings.cache_clear()
    try:
        await _seed_role_models(db_session, sample_org.id)
        cli = await get_ai_client_for_role(sample_org.id, db_session, "wireframe")
        assert cli.model.startswith("deepseek")
    finally:
        get_settings.cache_clear()


@pytest.mark.anyio
async def test_wireframe_critic_role_defaults_to_opus(db_session, sample_org, _platform_keys):
    await _seed_role_models(db_session, sample_org.id)
    cli = await get_ai_client_for_role(sample_org.id, db_session, "wireframe_critic")
    assert cli.model == "claude-opus-4-7"


@pytest.mark.anyio
async def test_wireframe_critic_role_honors_model_override(db_session, sample_org, _platform_keys):
    await _seed_role_models(db_session, sample_org.id, wireframe_critic_model="claude-sonnet-4-6")
    cli = await get_ai_client_for_role(sample_org.id, db_session, "wireframe_critic")
    assert cli.model == "claude-sonnet-4-6"
