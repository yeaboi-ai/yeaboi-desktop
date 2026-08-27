"""Tests for the deterministic bullet-merge that powers the voice agent's
blueprint writes."""

from src.app.services.blueprint_merge import (
    compute_bullet_sources,
    detect_removed,
    merge_bullets,
    split_bullets,
)


def test_split_bullets_handles_dash_star_and_dot():
    text = "- React frontend\n* Node backend\n• Postgres"
    pairs = split_bullets(text)
    assert [norm for _, norm in pairs] == ["react frontend", "node backend", "postgres"]


def test_split_bullets_dedupes_within_input():
    text = "- React\n- react\n-   REACT  "
    pairs = split_bullets(text)
    assert len(pairs) == 1


def test_split_bullets_treats_plain_text_as_one_bullet():
    pairs = split_bullets("React frontend, Node backend")
    assert len(pairs) == 1
    assert pairs[0][1] == "react frontend, node backend"


def test_merge_preserves_existing_bullets_when_incoming_omits_them():
    """Core bug this whole change fixes: under-generation by the LLM must NOT
    drop prior content. The agent now sends ONLY new bullets; the merge keeps
    everything else."""
    existing = "- React frontend\n- Node backend\n- Postgres"
    incoming = "- Redis cache"  # agent only discovered this in latest turn
    merged = merge_bullets(existing, incoming)
    assert "React frontend" in merged
    assert "Node backend" in merged
    assert "Postgres" in merged
    assert "Redis cache" in merged


def test_merge_dedupes_when_same_bullet_arrives_twice():
    existing = "- React frontend"
    incoming = "- react frontend\n- Tailwind"
    merged = merge_bullets(existing, incoming)
    lines = [line for line in merged.split("\n") if line.strip()]
    assert len(lines) == 2  # React (existing wins), Tailwind


def test_merge_respects_removed_bullets():
    """If the user deleted a bullet, agent merge must NOT re-add it."""
    existing = "- React frontend"
    incoming = "- React frontend\n- Vue frontend"
    removed = {"vue frontend"}  # user explicitly deleted earlier
    merged = merge_bullets(existing, incoming, removed=removed)
    assert "Vue" not in merged
    assert "React" in merged


def test_merge_normalizes_to_dash_prefix():
    """Bare-text incoming becomes a properly-bulleted line in output."""
    existing = ""
    incoming = "React frontend\nNode backend"
    merged = merge_bullets(existing, incoming)
    assert merged.startswith("- React frontend")
    assert "- Node backend" in merged


def test_detect_removed_finds_dropped_bullets():
    prior = "- React\n- Node\n- Postgres"
    after_user_edit = "- React\n- Postgres"
    removed = detect_removed(prior, after_user_edit)
    assert removed == {"node"}


def test_detect_removed_empty_when_only_added():
    prior = "- React"
    after = "- React\n- Node"
    assert detect_removed(prior, after) == set()


# ─── compute_bullet_sources ────────────────────────────────────────────────


def test_compute_bullet_sources_carries_prior_through_unchanged_bullets():
    """Bullets that were in the prior snapshot keep their recorded source —
    a re-extraction pass shouldn't downgrade user-stated content to
    ai_inferred just because the agent emitted it again."""
    final = "- React frontend\n- Node backend"
    prior = {"react frontend": "user_stated"}
    out = compute_bullet_sources(final, prior, "ai_inferred")
    assert out["react frontend"] == "user_stated"
    assert out["node backend"] == "ai_inferred"


def test_compute_bullet_sources_drops_removed_bullets():
    """Bullets no longer present in final_text are not carried over."""
    final = "- React frontend"
    prior = {"react frontend": "user_stated", "vue frontend": "ai_inferred"}
    out = compute_bullet_sources(final, prior, "user_stated")
    assert "vue frontend" not in out
    assert out["react frontend"] == "user_stated"


def test_compute_bullet_sources_handles_empty_prior():
    out = compute_bullet_sources("- Postgres", None, "ai_inferred")
    assert out == {"postgres": "ai_inferred"}
