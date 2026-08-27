from src.app.services.output_maturity import maturity_for


def test_code_scaffold_needs_tech_stack_and_architecture():
    blueprint = {"tech_stack": "", "architecture": "", "infrastructure": ""}
    assert maturity_for("code_scaffold", blueprint) == 0

    blueprint = {
        "tech_stack": (
            "React with Next.js on the frontend; FastAPI + Postgres on the backend. "
            "Paragraphs of detail on framework choices and trade-offs."
        ),
        "architecture": (
            "Microservice boundaries, REST APIs between them, JWT auth, async workers "
            "for long jobs. Multiple paragraphs covering component layering and data flow."
        ),
        "infrastructure": "",
    }
    # two of three populated → ~66
    assert 50 <= maturity_for("code_scaffold", blueprint) <= 70


def test_design_bundle_needs_ui_ux():
    assert maturity_for("design_bundle", {"ui_ux": ""}) == 0
    assert (
        maturity_for(
            "design_bundle",
            {
                "ui_ux": (
                    "Dark mode first, responsive layout, sidebar navigation, minimal typography, "
                    "system fonts. Several paragraphs covering interaction patterns and motion."
                ),
            },
        )
        >= 80
    )


def test_terraform_stack_needs_infrastructure_and_tech_stack():
    assert maturity_for("terraform_stack", {"infrastructure": "", "tech_stack": ""}) == 0
    populated = {
        "infrastructure": (
            "AWS ECS for app containers, RDS Postgres Multi-AZ, CloudFront in front of S3 "
            "for assets. Many paragraphs covering networking, secrets, and scaling."
        ),
        "tech_stack": (
            "Python 3.11, FastAPI, async SQLAlchemy, Pydantic v2. Multiple paragraphs "
            "describing service layout, dependency choices, and runtime characteristics."
        ),
    }
    assert maturity_for("terraform_stack", populated) >= 80


def test_decision_doc_needs_overview_goals_scope():
    assert (
        maturity_for(
            "decision_doc",
            {"project_overview": "", "goals_constraints": "", "out_of_scope": ""},
        )
        == 0
    )
    populated = {
        "project_overview": (
            "We are building a smart task manager that prioritises items based on "
            "learned signals from user behaviour. Long description follows in more paragraphs."
        ),
        "goals_constraints": (
            "Goals: automatic prioritisation, cross-device sync, offline-first. "
            "Constraints: budget under 10k, 8-week build window, two engineers only."
        ),
        "out_of_scope": (
            "Not building native mobile apps this quarter; no calendar integration; "
            "no team collaboration features until phase 2."
        ),
    }
    assert maturity_for("decision_doc", populated) >= 80


def test_unknown_output_type_returns_zero():
    assert maturity_for("nonexistent", {}) == 0
