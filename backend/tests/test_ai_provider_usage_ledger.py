"""Auto-record usage_events from AIClient chat calls.

The AI client schedules a fire-and-forget write to the usage_events ledger
on every successful chat completion. Verifies the row is persisted with the
right (org_id, session_id, project_id, provider, tokens) so the Analytics
"Cost Overview" page populates without the call sites having to remember
to call `record_*` themselves.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.app.models.usage_event import UsageEvent
from src.app.services import ai_provider


class _FakeAnthropic:
    """Minimal stand-in for the AsyncAnthropic SDK that returns one fixed
    response with usage. Avoids any network/SDK dependency in the test."""

    def __init__(self, *, in_tok: int = 1000, out_tok: int = 500, cache_read: int = 0, cache_write: int = 0):
        self._in = in_tok
        self._out = out_tok
        self._cr = cache_read
        self._cw = cache_write
        self.messages = self

    async def create(self, **_kwargs):
        return SimpleNamespace(
            content=[SimpleNamespace(text="hi")],
            usage=SimpleNamespace(
                input_tokens=self._in,
                output_tokens=self._out,
                cache_read_input_tokens=self._cr,
                cache_creation_input_tokens=self._cw,
            ),
            stop_reason="end_turn",
        )


@pytest.fixture
async def shared_session_factory(db_engine, monkeypatch):
    """Point `db.get_session_factory()` at the test engine so the background
    ledger task writes to the same in-memory DB the test reads from."""
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    from src.app import db as db_mod

    monkeypatch.setattr(db_mod, "_session_factory", factory, raising=False)
    monkeypatch.setattr(db_mod, "_engine", db_engine, raising=False)
    yield factory


async def _wait_for_event(db_session, *, org_id: str, timeout: float = 2.0) -> UsageEvent:
    """Poll for the background ledger task to land its row."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        row = (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.org_id == org_id)
            )
        ).scalar_one_or_none()
        if row is not None:
            return row
        await asyncio.sleep(0.05)
    pytest.fail(f"No UsageEvent row appeared for org {org_id} within {timeout}s")


async def test_chat_writes_usage_event(db_session, sample_org, shared_session_factory):
    """A plain client.chat() lands an anthropic/chat row attributed to the org."""
    client = ai_provider.AIClient(
        provider="platform",
        anthropic_client=_FakeAnthropic(in_tok=1000, out_tok=500),
        model="claude-opus-4-7",
        underlying_provider="anthropic",
        org_id=sample_org.id,
        db=db_session,
    )

    text = await client.chat(messages=[{"role": "user", "content": "hi"}], max_tokens=100)
    assert text == "hi"

    row = await _wait_for_event(db_session, org_id=sample_org.id)
    assert row.provider == "anthropic"
    assert row.operation == "chat"
    assert row.units["tokens_in"] == 1000
    assert row.units["tokens_out"] == 500
    assert float(row.cost_usd) > 0  # static pricing fills in a non-zero cost


async def test_chat_attributes_session_and_project(
    db_session, sample_org, shared_session_factory
):
    """Per-session attribution lands when the client was built with the IDs."""
    client = ai_provider.AIClient(
        provider="platform",
        anthropic_client=_FakeAnthropic(in_tok=10, out_tok=20),
        model="claude-opus-4-7",
        underlying_provider="anthropic",
        org_id=sample_org.id,
        db=db_session,
        project_id="proj-xyz",
        session_id="sess-abc",
        user_id="user-1",
    )

    await client.chat(messages=[{"role": "user", "content": "hi"}], max_tokens=10)

    row = await _wait_for_event(db_session, org_id=sample_org.id)
    assert row.session_id == "sess-abc"
    assert row.project_id == "proj-xyz"


async def test_no_org_skips_ledger(db_session, shared_session_factory):
    """Without org_id we never bill anyone — no UsageEvent row should land."""
    client = ai_provider.AIClient(
        provider="platform",
        anthropic_client=_FakeAnthropic(in_tok=10, out_tok=20),
        model="claude-opus-4-7",
        underlying_provider="anthropic",
        org_id=None,
        db=db_session,
    )

    await client.chat(messages=[{"role": "user", "content": "hi"}], max_tokens=10)
    # Background task might still be scheduled (it won't) — give it a tick.
    await asyncio.sleep(0.1)

    rows = (await db_session.execute(select(UsageEvent))).scalars().all()
    assert rows == []


async def test_chat_with_full_usage_also_records(db_session, sample_org, shared_session_factory):
    """The token-returning variant also schedules a ledger write."""
    client = ai_provider.AIClient(
        provider="platform",
        anthropic_client=_FakeAnthropic(in_tok=200, out_tok=80),
        model="claude-opus-4-7",
        underlying_provider="anthropic",
        org_id=sample_org.id,
        db=db_session,
    )

    text, in_tok, out_tok = await client.chat_with_full_usage(
        messages=[{"role": "user", "content": "hi"}], max_tokens=50
    )
    assert (text, in_tok, out_tok) == ("hi", 200, 80)

    row = await _wait_for_event(db_session, org_id=sample_org.id)
    assert row.units == {"tokens_in": 200, "tokens_out": 80}
