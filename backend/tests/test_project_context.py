"""What a project hands its first planning session: the things it points at,
the screenshots it was described with, and the reading of those screenshots.
"""

import pytest

from src.app.services.attachment_storage import LocalDiskStorage
from src.app.services.image_insight import VISION_PROMPT, describe_image
from src.app.services.project_context import MAX_REFERENCE_LINES, attachment_line, reference_lines


class _FakeAI:
    """Minimal stand-in for AIClient.chat — records what it was asked."""

    def __init__(self, response: str = "a reading"):
        self._response = response
        self.messages = None

    async def chat(self, *, system=None, messages=None, max_tokens=1024):
        self.messages = messages
        return self._response


# --- reference_lines --------------------------------------------------------


def test_reference_line_names_the_source_subject_label_and_url():
    lines = reference_lines(
        [{"source": "jira", "subject": "PROJ-12", "label": "Login fails on Safari", "url": "https://j/PROJ-12"}]
    )
    assert lines == ['Referenced jira PROJ-12 "Login fails on Safari" — https://j/PROJ-12']


def test_reference_line_survives_a_missing_url():
    assert reference_lines([{"source": "github", "subject": "yeaboi-ai/yeaboi", "label": "yeaboi"}]) == [
        'Referenced github yeaboi-ai/yeaboi "yeaboi"'
    ]


def test_reference_line_does_not_repeat_a_label_equal_to_the_subject():
    assert reference_lines([{"source": "link", "subject": "https://x", "label": "https://x"}]) == [
        "Referenced link https://x"
    ]


def test_reference_lines_skips_empty_and_malformed_rows():
    assert reference_lines([None, {}, "nope", {"source": "  "}]) == []


def test_reference_lines_takes_no_more_than_an_opening_holds():
    rows = [{"source": "jira", "subject": f"P-{n}", "label": f"issue {n}"} for n in range(40)]
    assert len(reference_lines(rows)) == MAX_REFERENCE_LINES


def test_reference_lines_of_nothing_is_nothing():
    assert reference_lines(None) == []
    assert reference_lines([]) == []


# --- attachment_line --------------------------------------------------------


def test_attachment_line_counts_and_names_the_screenshots():
    assert attachment_line(["a.png"]) == "Attached screenshot: a.png"
    assert attachment_line(["a.png", "b.png"]) == "Attached screenshots: a.png, b.png"
    assert attachment_line([]) == ""


# --- describe_image ---------------------------------------------------------


@pytest.mark.asyncio
async def test_describe_image_sends_the_bytes_and_the_prompt():
    ai = _FakeAI("layout: sidebar")
    out = await describe_image(ai, b"\x89PNG fake", "image/png")
    assert out == "layout: sidebar"
    content = ai.messages[0]["content"]
    assert content[0]["type"] == "image"
    assert content[0]["source"]["media_type"] == "image/png"
    assert content[0]["source"]["data"]  # base64, not raw bytes
    assert content[1]["text"] == VISION_PROMPT


# --- storage round-trip -----------------------------------------------------


@pytest.mark.asyncio
async def test_local_disk_storage_reads_back_what_it_stored(tmp_path):
    storage = LocalDiskStorage(tmp_path)
    key = await storage.put(b"bytes on disk", mime_type="image/png", suffix=".png", prefix="projects")
    assert await storage.get(key) == b"bytes on disk"


@pytest.mark.asyncio
async def test_local_disk_storage_get_raises_on_a_missing_key(tmp_path):
    with pytest.raises(OSError):
        await LocalDiskStorage(tmp_path).get("projects/gone.png")


# --- the wiring: what a new session's blueprint seeding is told ---------------


class _RecordingAI:
    """Answers everything, and keeps every prompt it was handed."""

    def __init__(self):
        self.prompts: list[str] = []

    async def chat(self, *, system=None, messages=None, max_tokens=1024):
        for message in messages or []:
            content = message.get("content")
            if isinstance(content, str):
                self.prompts.append(content)
        return "{}"


@pytest.fixture
def recording_ai(monkeypatch):
    ai = _RecordingAI()

    async def _get_ai_client(*args, **kwargs):
        return ai

    from src.app.services import ai_provider

    monkeypatch.setattr(ai_provider, "get_ai_client", _get_ai_client)
    return ai


async def test_first_session_is_told_what_the_project_points_at(client, auth_headers, recording_ai):
    proj = await client.post(
        "/api/projects",
        json={
            "name": "Safari login",
            "description": "Users cannot sign in on Safari.",
            "references": [
                {
                    "source": "jira",
                    "subject": "PROJ-12",
                    "label": "Login fails on Safari",
                    "url": "https://example.atlassian.net/browse/PROJ-12",
                }
            ],
        },
        headers=auth_headers,
    )
    assert proj.status_code == 201
    project_id = proj.json()["id"]

    resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "Work out why the cookie is dropped"},
        headers=auth_headers,
    )
    assert resp.status_code == 201

    seeding = "\n".join(recording_ai.prompts)
    assert "PROJ-12" in seeding
    assert "Login fails on Safari" in seeding
    # The description and the typed idea still get there too.
    assert "Users cannot sign in on Safari" in seeding
    assert "cookie is dropped" in seeding


async def test_a_project_pointing_at_nothing_seeds_as_it_always_did(client, auth_headers, recording_ai):
    proj = await client.post(
        "/api/projects",
        json={"name": "Plain", "description": "A plain project."},
        headers=auth_headers,
    )
    project_id = proj.json()["id"]
    resp = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "Just an idea"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    seeding = "\n".join(recording_ai.prompts)
    assert "Referenced" not in seeding
    assert "Attached screenshot" not in seeding
