import pytest
from sqlalchemy.exc import IntegrityError

from src.app.models.project_output import ProjectOutput


async def test_project_output_requires_type_and_project(db_session):
    """ProjectOutput must have project_id + output_type; uniqueness enforced."""
    # This test requires a project to FK against — create a minimal project row
    from src.app.models.organization import Organization, Team, OrgMember, TeamMember
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
    await db_session.flush()

    out = ProjectOutput(project_id=project.id, output_type="code_scaffold", status="not_generated")
    db_session.add(out)
    await db_session.flush()

    # Duplicate (project_id, output_type) must be rejected
    dup = ProjectOutput(project_id=project.id, output_type="code_scaffold", status="not_generated")
    db_session.add(dup)
    with pytest.raises(IntegrityError):
        await db_session.flush()
