from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.app.config import get_settings
from src.app.db import get_db
from src.app.main import create_app
from src.app.models.base import Base
from src.app.models.organization import Organization, OrgMember, Team, TeamMember
from src.app.models.user import User

TEST_SECRET = "test-secret"
TEST_USER_EMAIL = "test@example.com"
TEST_USER_NAME = "Test User"


@pytest.fixture(autouse=True)
def _override_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///")
    monkeypatch.setenv("NEXTAUTH_SECRET", TEST_SECRET)
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def _reset_provider_health():
    """Clear the provider-health snapshot before and after every test.

    Tests that exercise AIClient or call /api/system/health-summary write
    to a shared (Redis or in-memory) snapshot. Without this, a failure
    recorded by one test bleeds into the next and causes 402 responses
    where the test expected 200.
    """
    from src.app.services import provider_health

    await provider_health.reset_for_tests_async()
    yield
    await provider_health.reset_for_tests_async()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Disable slowapi rate limits during tests. Rate limiters track usage
    per source IP globally across the suite, and once /api/health or /metrics
    hit their per-minute cap the remaining tests against those endpoints fail
    with 429. Tests don't care about rate limiting; disabling is cleaner than
    resetting in a fixture, which the /metrics path doesn't fully honour."""
    from src.app.middleware.rate_limit import limiter

    was_enabled = limiter.enabled
    limiter.reset()
    limiter.enabled = False
    yield
    limiter.enabled = was_enabled
    limiter.reset()


@pytest.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest.fixture
def app(db_engine):
    application = create_app()
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _make_jwt(email: str, name: str, exp_delta: timedelta = timedelta(hours=1)) -> str:
    payload = {
        "email": email,
        "name": name,
        "exp": datetime.now(tz=UTC) + exp_delta,
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


@pytest.fixture
def auth_headers():
    token = _make_jwt(TEST_USER_EMAIL, TEST_USER_NAME)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def expired_auth_headers():
    token = _make_jwt(TEST_USER_EMAIL, TEST_USER_NAME, exp_delta=timedelta(hours=-1))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    token = _make_jwt("other@example.com", "Other User")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def sample_user(db_session):
    user = User(email="fixture@example.com", name="Fixture User", role="admin")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def sample_org(db_session, sample_user):
    org = Organization(name="Fixture Org", slug="fixture-org")
    db_session.add(org)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org.id, user_id=sample_user.id, role="admin"))
    await db_session.commit()
    await db_session.refresh(org)
    return org


@pytest.fixture
async def sample_team(db_session, sample_org, sample_user):
    team = Team(org_id=sample_org.id, name="Fixture Team", slug="fixture-team")
    db_session.add(team)
    await db_session.flush()
    db_session.add(TeamMember(team_id=team.id, user_id=sample_user.id, role="admin"))
    await db_session.commit()
    await db_session.refresh(team)
    return team
