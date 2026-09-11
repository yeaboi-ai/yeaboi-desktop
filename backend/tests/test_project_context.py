"""What a project hands its first planning session: the things it points at,
the screenshots it was described with, and the reading of those screenshots.
"""

import io

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
        "/api/sessions",
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
    session_id = proj.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
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
        "/api/sessions",
        json={"name": "Plain", "description": "A plain project."},
        headers=auth_headers,
    )
    session_id = proj.json()["id"]
    resp = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Just an idea"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    seeding = "\n".join(recording_ai.prompts)
    assert "Referenced" not in seeding
    assert "Attached screenshot" not in seeding


# --- the gate: only the first session reads the project's screenshots --------


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    """Point storage at a per-test temp dir and reset the singleton."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("ATTACHMENT_BACKEND", "local")

    from src.app.config import get_settings
    from src.app.services import attachment_storage

    get_settings.cache_clear()
    attachment_storage.reset_storage_for_tests()
    yield tmp_path
    attachment_storage.reset_storage_for_tests()
    get_settings.cache_clear()


@pytest.fixture
def screenshot_reads(monkeypatch):
    """Record every scheduling of the vision task instead of running it."""
    calls: list[tuple] = []

    async def _record(source_session_id, session_id, org_id, iteration_id):
        calls.append((source_session_id, session_id, org_id, iteration_id))

    from src.app.routers import sessions as sessions_router

    monkeypatch.setattr(sessions_router, "_read_project_screenshots_safe", _record)
    return calls


def _png() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 6), "teal").save(buf, format="PNG")
    return buf.getvalue()


async def _project_with_a_screenshot(client, headers) -> str:
    session_id = (await client.post("/api/sessions", json={"name": "Mockups"}, headers=headers)).json()["id"]
    files = {"file": ("login.png", io.BytesIO(_png()), "image/png")}
    resp = await client.post(f"/api/sessions/{session_id}/attachments", files=files, headers=headers)
    assert resp.status_code == 201, resp.text
    return session_id


async def test_the_first_session_reads_the_project_screenshots(
    client, auth_headers, recording_ai, upload_dir, screenshot_reads
):
    session_id = await _project_with_a_screenshot(client, auth_headers)
    resp = await client.post(
        f"/api/sessions/{session_id}/continuations", json={"initial_idea": "Build it"}, headers=auth_headers
    )
    assert resp.status_code == 201
    assert len(screenshot_reads) == 1
    read_from, written_to, _org, iteration_id = screenshot_reads[0]
    # The shots belong to the session this one continues; the reading of them
    # belongs to the new session's own blueprint. Two ids, deliberately.
    assert read_from == session_id
    assert written_to == resp.json()["id"]
    # The reading lands on the iteration the seeding used, not on a resolved guess.
    assert iteration_id


async def test_a_later_session_does_not_read_them_again(
    client, auth_headers, db_session, recording_ai, upload_dir, screenshot_reads
):
    from sqlalchemy import update

    from src.app.models.blueprint import BlueprintIteration

    session_id = await _project_with_a_screenshot(client, auth_headers)
    first = await client.post(
        f"/api/sessions/{session_id}/continuations", json={"initial_idea": "Build it"}, headers=auth_headers
    )
    assert first.status_code == 201
    assert len(screenshot_reads) == 1
    iteration_id = screenshot_reads[0][3]

    # A second session is refused while the first release is open, so lock it.
    await db_session.execute(
        update(BlueprintIteration).where(BlueprintIteration.id == iteration_id).values(status="locked")
    )
    await db_session.commit()

    second = await client.post(
        f"/api/sessions/{session_id}/continuations", json={"initial_idea": "Now the billing half"}, headers=auth_headers
    )
    assert second.status_code == 201, second.text
    # The reading is already in the blueprint; a second session must not pay for it twice.
    assert len(screenshot_reads) == 1


async def test_a_project_with_no_screenshots_schedules_no_reading(
    client, auth_headers, recording_ai, upload_dir, screenshot_reads
):
    session_id = (await client.post("/api/sessions", json={"name": "Plain"}, headers=auth_headers)).json()["id"]
    resp = await client.post(
        f"/api/sessions/{session_id}/continuations", json={"initial_idea": "Build it"}, headers=auth_headers
    )
    assert resp.status_code == 201
    assert screenshot_reads == []
