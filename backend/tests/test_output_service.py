import pytest
from sqlalchemy import select

from src.app.models.project_output import ProjectOutput
from src.app.services.output_service import OutputServiceError, generate_output, get_output_catalogue


async def _seed_project(db_session):
    from src.app.models.organization import Organization, OrgMember, Team, TeamMember
    from src.app.models.project import Project
    from src.app.models.user import User

    user = User(email="x@y.com", name="X")
    org = Organization(name="O", slug="test-org")
    db_session.add_all([user, org])
    await db_session.flush()
    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="admin"))
    team = Team(org_id=org.id, name="T", slug="test-team")
    db_session.add(team)
    await db_session.flush()
    db_session.add(TeamMember(team_id=team.id, user_id=user.id, role="admin"))
    project = Project(name="P", owner_id=user.id, org_id=org.id, team_id=team.id)
    db_session.add(project)
    await db_session.commit()
    return project


async def test_unknown_output_type_raises(db_session):
    project = await _seed_project(db_session)
    with pytest.raises(OutputServiceError) as exc:
        await generate_output(project.id, "no_such_type", {}, db_session)
    assert "unknown output_type" in str(exc.value).lower()


async def test_slot_only_types_raise_not_implemented(db_session):
    project = await _seed_project(db_session)
    for slot in ("design_bundle", "terraform_stack", "decision_doc"):
        with pytest.raises(OutputServiceError) as exc:
            await generate_output(project.id, slot, {}, db_session)
        assert "not implemented" in str(exc.value).lower()


async def test_code_scaffold_creates_row(db_session, monkeypatch):
    """Generating code_scaffold writes a project_outputs row and calls the harness service."""
    from src.app.services import output_service

    async def fake_generate_scaffold(name, content):
        return {"AGENTS.md": "x", "ARCHITECTURE.md": "y"}

    monkeypatch.setattr(output_service, "generate_scaffold", fake_generate_scaffold)

    project = await _seed_project(db_session)
    row = await generate_output(project.id, "code_scaffold", {"create_repo": False}, db_session)
    assert row.status == "ready"
    assert row.output_type == "code_scaffold"
    assert "files_generated" in (row.artifacts or {})


async def test_regeneration_updates_same_row(db_session, monkeypatch):
    from src.app.services import output_service

    async def fake_generate_scaffold(name, content):
        return {"AGENTS.md": "x"}

    monkeypatch.setattr(output_service, "generate_scaffold", fake_generate_scaffold)
    project = await _seed_project(db_session)
    first = await generate_output(project.id, "code_scaffold", {"repo_name": "first"}, db_session)
    second = await generate_output(project.id, "code_scaffold", {"repo_name": "second"}, db_session)
    assert first.id == second.id
    # Row must reflect the most recent call's payload (update-in-place, not a stale read)
    assert second.payload == {"repo_name": "second"}

    result = await db_session.execute(select(ProjectOutput).where(ProjectOutput.project_id == project.id))
    assert len(result.scalars().all()) == 1


async def test_catalogue_lists_every_type(db_session):
    project = await _seed_project(db_session)
    catalogue = await get_output_catalogue(project.id, db_session)
    types = {entry.output_type for entry in catalogue}
    assert types == {"code_scaffold", "design_bundle", "terraform_stack", "decision_doc"}
    # Slots are marked implemented=False
    by_type = {e.output_type: e for e in catalogue}
    assert by_type["code_scaffold"].implemented is True
    assert by_type["terraform_stack"].implemented is False
