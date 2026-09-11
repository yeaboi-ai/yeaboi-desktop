"""Tests for services.usage_recorder."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.app.models.session import Session
from src.app.models.usage_event import PricingOverride, UsageEvent
from src.app.services.usage_recorder import (
    UsageContext,
    clear_override_cache,
    record_anthropic_chat,
    record_cartesia_tts,
    record_deepgram_stt,
    record_elevenlabs_tts,
    record_livekit_egress,
    record_livekit_room_minutes,
    record_openai_chat,
    record_resend_email,
    record_usage,
    usage_span,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_override_cache()
    yield
    clear_override_cache()


@pytest.fixture
async def session_row(db_session, sample_org, sample_team, sample_user):
    sess = Session(
        org_id=sample_org.id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Cost Test",
        description="for tests",
        status="active",
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)
    return sess


class TestRecordUsage:
    async def test_writes_row_with_computed_cost(self, db_session, sample_org, session_row):
        ctx = UsageContext(org_id=sample_org.id, session_id=session_row.id)
        event = await record_usage(
            db_session,
            provider="anthropic",
            operation="chat",
            units={"tokens_in": 1000, "tokens_out": 500},
            ctx=ctx,
            model="claude-opus-4-7",
        )
        await db_session.commit()

        assert event.id is not None
        assert event.org_id == sample_org.id
        assert event.session_id == session_row.id
        assert event.provider == "anthropic"
        assert event.operation == "chat"
        assert event.model == "claude-opus-4-7"
        assert event.units == {"tokens_in": 1000, "tokens_out": 500}
        assert event.cost_usd == Decimal("0.052500")
        assert event.is_estimated is False
        assert event.source == "api"

    async def test_org_id_required(self, db_session, sample_org):
        with pytest.raises(ValueError, match="org_id is required"):
            await record_usage(
                db_session,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": 100},
                ctx=UsageContext(org_id=""),
                model="claude-opus-4-7",
            )

    async def test_unknown_provider_rejected(self, db_session, sample_org):
        with pytest.raises(ValueError, match="unknown usage provider"):
            await record_usage(
                db_session,
                provider="bogus",
                operation="chat",
                units={"tokens_in": 100},
                ctx=UsageContext(org_id=sample_org.id),
            )

    async def test_unknown_operation_rejected(self, db_session, sample_org):
        with pytest.raises(ValueError, match="unknown usage operation"):
            await record_usage(
                db_session,
                provider="anthropic",
                operation="weird",
                units={"tokens_in": 100},
                ctx=UsageContext(org_id=sample_org.id),
            )

    async def test_unknown_source_rejected(self, db_session, sample_org):
        with pytest.raises(ValueError, match="unknown usage source"):
            await record_usage(
                db_session,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": 100},
                ctx=UsageContext(org_id=sample_org.id),
                source="forged",
                model="claude-opus-4-7",
            )

    async def test_metadata_includes_user_and_request(self, db_session, sample_org):
        ctx = UsageContext(
            org_id=sample_org.id,
            user_id="u-123",
            request_id="r-456",
            extra={"trace_id": "t-789"},
        )
        event = await record_usage(
            db_session,
            provider="anthropic",
            operation="chat",
            units={"tokens_in": 100, "tokens_out": 50},
            ctx=ctx,
            model="claude-haiku-4-5",
            metadata={"caller": "facilitator"},
        )
        assert event.event_metadata == {
            "user_id": "u-123",
            "request_id": "r-456",
            "trace_id": "t-789",
            "caller": "facilitator",
        }

    async def test_metadata_omitted_when_empty(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_usage(
            db_session,
            provider="resend",
            operation="email_send",
            units={"count": 1},
            ctx=ctx,
        )
        assert event.event_metadata is None

    async def test_org_specific_override_beats_global(self, db_session, sample_org):
        # Global override at $0.001/1k tokens_in for anthropic chat.
        db_session.add(
            PricingOverride(
                org_id=None,
                provider="anthropic",
                operation="chat",
                model=None,
                unit="per_1k_tokens_in",
                price_usd=Decimal("0.001"),
            )
        )
        # Org-specific override at $0.0001 — must win for our org.
        db_session.add(
            PricingOverride(
                org_id=sample_org.id,
                provider="anthropic",
                operation="chat",
                model=None,
                unit="per_1k_tokens_in",
                price_usd=Decimal("0.0001"),
            )
        )
        await db_session.commit()

        event = await record_usage(
            db_session,
            provider="anthropic",
            operation="chat",
            units={"tokens_in": 10_000},
            ctx=UsageContext(org_id=sample_org.id),
            model="claude-opus-4-7",
        )
        # 10 * 0.0001 = 0.001 (org-specific override wins)
        assert event.cost_usd == Decimal("0.001000")

    async def test_expired_override_ignored(self, db_session, sample_org):
        # Expired global override — must not apply.
        db_session.add(
            PricingOverride(
                org_id=None,
                provider="elevenlabs",
                operation="tts",
                model=None,
                unit="per_character",
                price_usd=Decimal("0.999"),
                effective_until=datetime.now(UTC) - timedelta(days=1),
            )
        )
        await db_session.commit()

        event = await record_usage(
            db_session,
            provider="elevenlabs",
            operation="tts",
            units={"characters": 1000},
            ctx=UsageContext(org_id=sample_org.id),
        )
        # Falls back to static $0.00018/char → 0.18
        assert event.cost_usd == Decimal("0.180000")


class TestUsageSpan:
    async def test_writes_on_clean_exit(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)

        async with usage_span(
            db_session,
            provider="anthropic",
            operation="chat",
            ctx=ctx,
            model="claude-haiku-4-5",
        ) as span:
            span["tokens_in"] = 1000
            span["tokens_out"] = 500

        await db_session.commit()
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert len(rows) == 1
        # 1 * 0.0008 + 0.5 * 0.004 = 0.0028
        assert rows[0].cost_usd == Decimal("0.002800")

    async def test_writes_on_exception(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)

        with pytest.raises(RuntimeError):
            async with usage_span(
                db_session,
                provider="anthropic",
                operation="chat",
                ctx=ctx,
                model="claude-haiku-4-5",
            ) as span:
                span["tokens_in"] = 500
                # Provider call burned tokens before erroring — we still
                # want the row.
                raise RuntimeError("provider blew up")

        await db_session.commit()
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert len(rows) == 1
        assert rows[0].units == {"tokens_in": 500}

    async def test_skips_when_no_units_set(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)

        async with usage_span(db_session, provider="anthropic", operation="chat", ctx=ctx, model="claude-opus-4-7"):
            # Caller short-circuited (e.g. cache hit) — no units recorded.
            pass

        await db_session.commit()
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert rows == []

    async def test_skip_flag_short_circuits(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)

        async with usage_span(
            db_session, provider="anthropic", operation="chat", ctx=ctx, model="claude-opus-4-7"
        ) as span:
            span["tokens_in"] = 1000
            span.skip = True

        await db_session.commit()
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert rows == []


class TestProviderHelpers:
    """Convenience wrappers used by provider call sites — verify each shapes
    `units` correctly so downstream cost math doesn't depend on call-site
    discipline."""

    async def test_anthropic_chat_helper_includes_cache(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_anthropic_chat(
            db_session,
            ctx,
            model="claude-opus-4-7",
            input_tokens=1000,
            output_tokens=500,
            cache_read=2000,
            cache_write=1000,
        )
        assert event.units == {
            "tokens_in": 1000,
            "tokens_out": 500,
            "cache_read": 2000,
            "cache_write": 1000,
        }
        # 0.015 + 0.5*0.075 + 2*0.0015 + 1*0.01875 = 0.074250
        assert event.cost_usd == Decimal("0.074250")

    async def test_anthropic_chat_helper_omits_zero_cache(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_anthropic_chat(
            db_session,
            ctx,
            model="claude-haiku-4-5",
            input_tokens=100,
            output_tokens=50,
        )
        assert "cache_read" not in event.units
        assert "cache_write" not in event.units

    async def test_openai_chat_helper(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_openai_chat(
            db_session, ctx, model="gpt-4o", prompt_tokens=1000, completion_tokens=500
        )
        # 0.0025 + 0.5*0.01 = 0.0075
        assert event.cost_usd == Decimal("0.007500")

    async def test_elevenlabs_tts_helper(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_elevenlabs_tts(db_session, ctx, characters=5000)
        assert event.provider == "elevenlabs"
        assert event.units == {"characters": 5000}
        # 5000 * 0.00018 = 0.9
        assert event.cost_usd == Decimal("0.900000")

    async def test_cartesia_tts_helper(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_cartesia_tts(db_session, ctx, characters=10000)
        # 10000 * 0.000015 = 0.15
        assert event.cost_usd == Decimal("0.150000")

    async def test_deepgram_stt_helper(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_deepgram_stt(db_session, ctx, seconds=120)
        # 2 minutes * 0.0043 = 0.0086
        assert event.cost_usd == Decimal("0.008600")

    async def test_livekit_egress_helper_uses_webhook_source_default(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_livekit_egress(db_session, ctx, seconds=3600)
        assert event.source == "webhook"
        # 60 minutes * 0.0075 = 0.45
        assert event.cost_usd == Decimal("0.450000")

    async def test_livekit_room_minutes_helper(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_livekit_room_minutes(db_session, ctx, participant_minutes=60)
        # 60 * 0.0005 = 0.03
        assert event.cost_usd == Decimal("0.030000")

    async def test_resend_email_helper_default_count(self, db_session, sample_org):
        ctx = UsageContext(org_id=sample_org.id)
        event = await record_resend_email(db_session, ctx)
        assert event.units == {"count": 1}
        assert event.cost_usd == Decimal("0.000200")
