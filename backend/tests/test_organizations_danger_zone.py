"""Tests for the org danger zone — transfer ownership + delete."""

import pytest
from sqlalchemy import select

from src.app.models.organization import OrgMember, Organization
from src.app.models.user import User


@pytest.fixture
async def auth_user_as_org_admin(db_session, sample_org):
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


async def _add_member(db_session, org_id, email, role="member"):
    u = User(email=email, name=email.split("@")[0], role=role)
    db_session.add(u)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org_id, user_id=u.id, role=role))
    await db_session.commit()
    return u


# ─── Transfer ownership ───────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_transfer_ownership_promotes_target_and_demotes_self(
    client, auth_headers, db_session, sample_org, auth_user_as_org_admin
):
    target = await _add_member(db_session, sample_org.id, "target@example.com", role="member")

    resp = await client.post(
        f"/api/orgs/{sample_org.id}/transfer-ownership",
        json={"new_owner_user_id": target.id, "demote_self": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["new_owner_user_id"] == target.id

    # Target is now admin, caller is now member
    target_mem = (
        await db_session.execute(
            select(OrgMember).where(OrgMember.org_id == sample_org.id, OrgMember.user_id == target.id)
        )
    ).scalar_one()
    self_mem = (
        await db_session.execute(
            select(OrgMember).where(
                OrgMember.org_id == sample_org.id, OrgMember.user_id == auth_user_as_org_admin.id
            )
        )
    ).scalar_one()
    assert target_mem.role == "admin"
    assert self_mem.role == "member"


@pytest.mark.anyio
async def test_transfer_ownership_can_keep_self_admin(
    client, auth_headers, db_session, sample_org, auth_user_as_org_admin
):
    target = await _add_member(db_session, sample_org.id, "co-admin@example.com")
    resp = await client.post(
        f"/api/orgs/{sample_org.id}/transfer-ownership",
        json={"new_owner_user_id": target.id, "demote_self": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    self_mem = (
        await db_session.execute(
            select(OrgMember).where(
                OrgMember.org_id == sample_org.id, OrgMember.user_id == auth_user_as_org_admin.id
            )
        )
    ).scalar_one()
    assert self_mem.role == "admin"


@pytest.mark.anyio
async def test_transfer_ownership_rejects_self(
    client, auth_headers, sample_org, auth_user_as_org_admin
):
    resp = await client.post(
        f"/api/orgs/{sample_org.id}/transfer-ownership",
        json={"new_owner_user_id": auth_user_as_org_admin.id},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_transfer_ownership_rejects_non_member(
    client, auth_headers, db_session, sample_org, auth_user_as_org_admin
):
    stranger = User(email="stranger@example.com", name="Stranger", role="member")
    db_session.add(stranger)
    await db_session.commit()
    resp = await client.post(
        f"/api/orgs/{sample_org.id}/transfer-ownership",
        json={"new_owner_user_id": stranger.id},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_transfer_ownership_requires_admin(client, auth_headers, sample_org, sample_user):
    # auth_headers user not made admin → 403
    resp = await client.post(
        f"/api/orgs/{sample_org.id}/transfer-ownership",
        json={"new_owner_user_id": sample_user.id},
        headers=auth_headers,
    )
    assert resp.status_code == 403


# ─── Delete organization ─────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_delete_org_requires_exact_name(
    client, auth_headers, sample_org, auth_user_as_org_admin
):
    resp = await client.request(
        "DELETE",
        f"/api/orgs/{sample_org.id}",
        json={"confirm_name": "wrong name"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_delete_org_soft_deletes(
    client, auth_headers, db_session, sample_org, auth_user_as_org_admin
):
    resp = await client.request(
        "DELETE",
        f"/api/orgs/{sample_org.id}",
        json={"confirm_name": sample_org.name},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # A subsequent GET should now 404 since deleted_at is set. (Verifying via
    # the API rather than the test session because the test conftest uses an
    # in-memory SQLite pool where the request session's commit isn't visible
    # to the test session's connection.)
    follow_up = await client.get(f"/api/orgs/{sample_org.id}", headers=auth_headers)
    assert follow_up.status_code == 404


@pytest.mark.anyio
async def test_delete_org_requires_admin(client, auth_headers, sample_org):
    resp = await client.request(
        "DELETE",
        f"/api/orgs/{sample_org.id}",
        json={"confirm_name": sample_org.name},
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_delete_org_returns_404_for_already_deleted(
    client, auth_headers, db_session, sample_org, auth_user_as_org_admin
):
    from datetime import UTC, datetime

    sample_org.deleted_at = datetime.now(UTC)
    await db_session.commit()
    resp = await client.request(
        "DELETE",
        f"/api/orgs/{sample_org.id}",
        json={"confirm_name": sample_org.name},
        headers=auth_headers,
    )
    assert resp.status_code == 404
