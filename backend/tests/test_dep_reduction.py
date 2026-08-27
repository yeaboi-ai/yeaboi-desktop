"""Pure-unit tests for the transitive-reduction + wave/sequence computation."""

from src.app.services.task_generator import (
    _compute_waves_and_sequences,
    _sanitize_dep_indices,
    _transitive_reduce_indices,
)


def _task(deps: list[int] | None = None, sequence: int | None = None) -> dict:
    t: dict = {"depends_on_indices": deps or [], "related_to_indices": []}
    if sequence is not None:
        t["sequence"] = sequence
    return t


def test_chain_drops_redundant_edge():
    """A→B, B→C, A→C → drops A→C."""
    tasks = [_task(), _task(deps=[0]), _task(deps=[0, 1])]
    _transitive_reduce_indices(tasks)
    assert tasks[0]["depends_on_indices"] == []
    assert tasks[1]["depends_on_indices"] == [0]
    assert tasks[2]["depends_on_indices"] == [1]  # A→C dropped


def test_diamond_keeps_all_edges():
    """A→B, A→C, B→D, C→D — none redundant."""
    tasks = [_task(), _task(deps=[0]), _task(deps=[0]), _task(deps=[1, 2])]
    _transitive_reduce_indices(tasks)
    assert tasks[0]["depends_on_indices"] == []
    assert tasks[1]["depends_on_indices"] == [0]
    assert tasks[2]["depends_on_indices"] == [0]
    assert tasks[3]["depends_on_indices"] == [1, 2]


def test_disjoint_subgraphs():
    """Two independent chains don't interfere with each other."""
    tasks = [
        _task(),
        _task(deps=[0]),
        _task(),
        _task(deps=[2]),
    ]
    _transitive_reduce_indices(tasks)
    assert tasks[1]["depends_on_indices"] == [0]
    assert tasks[3]["depends_on_indices"] == [2]


def test_no_deps_is_noop():
    tasks = [_task() for _ in range(5)]
    _transitive_reduce_indices(tasks)
    for t in tasks:
        assert t["depends_on_indices"] == []


def test_aggressive_chain_collapses():
    """The real-world case the user hit: every later card depends on every earlier
    foundational card. After reduction each task should depend only on its
    immediate predecessor."""
    n = 6
    tasks = [_task(deps=list(range(i))) for i in range(n)]
    _transitive_reduce_indices(tasks)
    assert tasks[0]["depends_on_indices"] == []
    for i in range(1, n):
        assert tasks[i]["depends_on_indices"] == [i - 1], (
            f"task {i} kept extra deps: {tasks[i]['depends_on_indices']}"
        )


def test_compute_waves_and_sequences_assigns_layers():
    tasks = [_task(), _task(), _task(deps=[0]), _task(deps=[0, 1]), _task(deps=[2])]
    _compute_waves_and_sequences(tasks)
    waves = [t["wave"] for t in tasks]
    assert waves == [0, 0, 1, 1, 2]
    # Within each wave sequence is dense and 0-indexed.
    seqs = [t["sequence"] for t in tasks]
    assert sorted(seqs[0:2]) == [0, 1]  # wave 0 has 2 tasks
    assert sorted(seqs[2:4]) == [0, 1]  # wave 1 has 2 tasks
    assert seqs[4] == 0  # wave 2 has 1 task


def test_compute_waves_respects_ai_sequence_hint():
    """When the AI gives a sequence hint, it's honoured for ordering within a wave."""
    tasks = [
        _task(sequence=2),
        _task(sequence=0),
        _task(sequence=1),
    ]
    _compute_waves_and_sequences(tasks)
    # All in wave 0 since none have deps. Sequences should reflect the hint
    # ordering: hint 0 → seq 0, hint 1 → seq 1, hint 2 → seq 2.
    expected = {0: 2, 1: 0, 2: 1}  # original-index → final-sequence
    for original_idx, final_seq in expected.items():
        assert tasks[original_idx]["sequence"] == final_seq


def test_sanitize_then_reduce_pipeline():
    """The two passes compose: sanitize drops invalid refs, reduce collapses."""
    tasks = [
        _task(),
        _task(deps=[0, 99]),  # 99 is out of range
        _task(deps=[0, 1]),  # 0 is reachable via 1, should drop
    ]
    _sanitize_dep_indices(tasks)
    _transitive_reduce_indices(tasks)
    assert tasks[1]["depends_on_indices"] == [0]
    assert tasks[2]["depends_on_indices"] == [1]
