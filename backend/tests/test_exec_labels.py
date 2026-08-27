"""Tests for the exec-label rendering helper used by the global board endpoint."""

from dataclasses import dataclass

from src.app.routers.boards import _compute_exec_labels


@dataclass
class FakeCard:
    id: str
    wave: int | None
    sequence: int | None
    position: int = 0


def test_solo_waves_render_plain_numbers():
    """A wave with a single card renders as 'N' (no decimal)."""
    cards = [
        FakeCard(id="a", wave=0, sequence=0),
        FakeCard(id="b", wave=1, sequence=0),
        FakeCard(id="c", wave=2, sequence=0),
    ]
    labels = _compute_exec_labels(cards)
    assert labels == {"a": "1", "b": "2", "c": "3"}


def test_parallel_waves_render_with_dot_suffix():
    """A wave with multiple parallel cards uses 'N.M' for each."""
    cards = [
        FakeCard(id="a", wave=0, sequence=0),
        FakeCard(id="b", wave=1, sequence=0),
        FakeCard(id="c", wave=1, sequence=1),
        FakeCard(id="d", wave=1, sequence=2),
        FakeCard(id="e", wave=2, sequence=0),
    ]
    labels = _compute_exec_labels(cards)
    assert labels == {
        "a": "1",
        "b": "2.1",
        "c": "2.2",
        "d": "2.3",
        "e": "3",
    }


def test_no_wave_yields_no_label():
    """Cards without wave (legacy / not yet processed) get no exec label."""
    cards = [
        FakeCard(id="a", wave=None, sequence=None),
        FakeCard(id="b", wave=0, sequence=0),
    ]
    labels = _compute_exec_labels(cards)
    assert labels == {"b": "1"}


def test_sequence_ties_break_by_position():
    """When sequence is None for both, the position tiebreaker wins."""
    cards = [
        FakeCard(id="late", wave=0, sequence=None, position=2),
        FakeCard(id="early", wave=0, sequence=None, position=0),
        FakeCard(id="middle", wave=0, sequence=None, position=1),
    ]
    labels = _compute_exec_labels(cards)
    assert labels == {"early": "1.1", "middle": "1.2", "late": "1.3"}


def test_empty_input_returns_empty():
    assert _compute_exec_labels([]) == {}


def test_single_card_in_each_of_many_waves():
    """The user's adaptive numbering: each wave has one card → 1, 2, 3, 4, ..."""
    cards = [FakeCard(id=f"c{i}", wave=i, sequence=0) for i in range(5)]
    labels = _compute_exec_labels(cards)
    assert labels == {"c0": "1", "c1": "2", "c2": "3", "c3": "4", "c4": "5"}
