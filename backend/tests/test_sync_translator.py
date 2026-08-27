"""Pure unit tests for the Markdown → Jira ADF / Markdown → ADO HTML translators."""

from src.app.services.sync.translator import (
    FieldMappings,
    card_to_ado_patch_doc,
    card_to_jira_payload,
    markdown_to_adf,
)


def _mappings() -> FieldMappings:
    return FieldMappings.from_row(None)


def test_markdown_to_adf_paragraph():
    doc = markdown_to_adf("hello world")
    assert doc == {
        "version": 1,
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "hello world"}]}
        ],
    }


def test_markdown_to_adf_heading_and_list():
    doc = markdown_to_adf("# Title\n\n- one\n- two")
    types = [c["type"] for c in doc["content"]]
    assert types == ["heading", "bulletList"]
    assert doc["content"][1]["content"][0]["type"] == "listItem"


def test_markdown_to_adf_link():
    doc = markdown_to_adf("see [docs](https://x.com)")
    nodes = doc["content"][0]["content"]
    assert nodes[0]["type"] == "text" and nodes[0]["text"] == "see "
    assert nodes[1]["marks"][0]["type"] == "link"
    assert nodes[1]["marks"][0]["attrs"]["href"] == "https://x.com"


def test_markdown_to_adf_code_block():
    doc = markdown_to_adf("```python\nprint(1)\n```")
    block = doc["content"][0]
    assert block["type"] == "codeBlock"
    assert block["attrs"]["language"] == "python"
    assert block["content"][0]["text"] == "print(1)"


def test_card_to_jira_payload_full():
    payload = card_to_jira_payload(
        title="Add login",
        description="Users should sign in via SSO.",
        priority="critical",
        story_points=5,
        labels=["auth", " front end "],
        acceptance_criteria=["Email + password", "MFA via TOTP"],
        issue_type="Story",
        project_id="10001",
        field_mappings=_mappings(),
    )

    fields = payload["fields"]
    assert fields["summary"] == "Add login"
    assert fields["issuetype"] == {"name": "Story"}
    assert fields["project"] == {"id": "10001"}
    assert fields["priority"] == {"name": "Highest"}
    assert fields["customfield_10016"] == 5
    assert fields["labels"] == ["auth", "front-end"]  # whitespace squashed to dashes
    # Description ADF includes the AC heading from _merge_adf.
    types = [c["type"] for c in fields["description"]["content"]]
    assert "heading" in types
    assert "bulletList" in types


def test_card_to_jira_payload_drops_blank_description_keeps_ac():
    payload = card_to_jira_payload(
        title="x",
        description=None,
        priority=None,
        story_points=None,
        labels=None,
        acceptance_criteria=["AC1"],
        issue_type="Task",
        project_id="P1",
        field_mappings=_mappings(),
    )
    fields = payload["fields"]
    assert "priority" not in fields
    assert "labels" not in fields
    # Even with no description, AC alone produces an ADF block.
    assert fields["description"]["content"][0]["type"] == "heading"


def test_card_to_jira_payload_unknown_priority_is_dropped():
    payload = card_to_jira_payload(
        title="x",
        description=None,
        priority="cosmic",  # not in the default mapping
        story_points=None,
        labels=None,
        acceptance_criteria=None,
        issue_type="Task",
        project_id="P1",
        field_mappings=_mappings(),
    )
    assert "priority" not in payload["fields"]


def test_field_mappings_custom_overrides():
    mappings = FieldMappings.from_row(
        {
            "priority": {"high": "Top", "low": "Bottom"},
            "story_points_field": "customfield_99",
        }
    )
    payload = card_to_jira_payload(
        title="x",
        description=None,
        priority="high",
        story_points=8,
        labels=None,
        acceptance_criteria=None,
        issue_type="Task",
        project_id="P1",
        field_mappings=mappings,
    )
    assert payload["fields"]["priority"] == {"name": "Top"}
    assert payload["fields"]["customfield_99"] == 8


def test_card_to_ado_patch_doc():
    ops = card_to_ado_patch_doc(
        title="Bug: timeout",
        description="**Steps**\n1. Trigger fetch\n2. Wait",
        priority="critical",  # → Highest → 1
        story_points=2,
        labels=["regression"],
        acceptance_criteria=["No timeouts"],
        field_mappings=_mappings(),
    )
    paths = [op["path"] for op in ops]
    assert "/fields/System.Title" in paths
    assert "/fields/System.Description" in paths
    assert "/fields/Microsoft.VSTS.Common.AcceptanceCriteria" in paths
    assert "/fields/Microsoft.VSTS.Common.Priority" in paths
    assert "/fields/Microsoft.VSTS.Scheduling.StoryPoints" in paths
    assert "/fields/System.Tags" in paths

    pri_op = next(op for op in ops if op["path"] == "/fields/Microsoft.VSTS.Common.Priority")
    assert pri_op["value"] == 1


def test_ado_html_inline():
    ops = card_to_ado_patch_doc(
        title="x",
        description="see [docs](https://x.com) **bold**",
        priority=None,
        story_points=None,
        labels=None,
        acceptance_criteria=None,
        field_mappings=_mappings(),
    )
    desc = next(op for op in ops if op["path"] == "/fields/System.Description")
    assert '<a href="https://x.com">docs</a>' in desc["value"]
    assert "<strong>bold</strong>" in desc["value"]
