"""One-shot script: transitive-reduce existing card dependencies + recompute wave/sequence.

Older cards were generated under the previous prompt that produced an over-eager
``depends_on`` graph (every later card listing every foundational card as a
prereq). The Phase-0 migration converted each entry into a ``CardLink('blocks')``
row, so almost the entire backlog ends up in the synthetic Blocked lane.

This script walks each project independently, transitively reduces the
``Card.depends_on`` graph, deletes the now-redundant ``CardLink('blocks')``
rows, and recomputes ``wave`` + ``sequence`` so the board's exec-label numbering
makes sense.

Idempotent — running twice is a no-op once the graph is already reduced.

Run:
    cd backend && uv run python -m scripts.backfill_dep_reduction
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections import defaultdict

# Make src.* importable when this file is invoked as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select, update  # noqa: E402

from src.app.db import get_session_factory  # noqa: E402
from src.app.models.board import Board, BoardColumn, Card  # noqa: E402
from src.app.models.card_link import CardLink  # noqa: E402
from src.app.models.project import Project  # noqa: E402


def _transitive_reduce(deps_by_card: dict[str, set[str]]) -> tuple[dict[str, set[str]], int]:
    """Drop edges that are reachable via another path. Mirrors the algorithm in
    ``task_generator._transitive_reduce_indices`` but works on string ids."""
    # Forward index: card → set of cards that depend on it.
    children: dict[str, set[str]] = defaultdict(set)
    for tgt, deps in deps_by_card.items():
        for src in deps:
            children[src].add(tgt)

    reduced = {tgt: set(deps) for tgt, deps in deps_by_card.items()}
    dropped = 0

    for tgt, deps in deps_by_card.items():
        for src in list(deps):
            others = [d for d in reduced[tgt] if d != src]
            if not others:
                continue
            # BFS forward from src; if we can reach `tgt` via any of `others`,
            # the direct src→tgt edge is redundant.
            seen: set[str] = set()
            stack = [src]
            redundant = False
            while stack:
                node = stack.pop()
                if node in seen:
                    continue
                seen.add(node)
                for child in children.get(node, ()):  # children of `node`
                    if child == tgt:
                        # Reaches tgt — but only counts as redundant if it goes
                        # through one of the `others` (i.e. NOT the direct edge).
                        # Since `node != src` here for non-trivial paths, any
                        # path of length ≥ 2 reaching tgt qualifies.
                        if node != src:
                            redundant = True
                            break
                    else:
                        stack.append(child)
                if redundant:
                    break
            if redundant:
                reduced[tgt].discard(src)
                children[src].discard(tgt)
                dropped += 1

    return reduced, dropped


def _compute_waves(deps_by_card: dict[str, set[str]]) -> dict[str, int]:
    """Topological wave assignment. wave[c] = max(wave[d]+1 for d in deps) or 0."""
    waves: dict[str, int] = {}

    def resolve(card_id: str) -> int:
        if card_id in waves:
            return waves[card_id]
        deps = deps_by_card.get(card_id) or set()
        if not deps:
            waves[card_id] = 0
            return 0
        # Avoid infinite recursion if there's somehow a cycle (shouldn't happen
        # post-reduction but defensive). Mark as 0 temporarily.
        waves[card_id] = 0
        try:
            waves[card_id] = max((resolve(d) + 1) for d in deps)
        except RecursionError:
            waves[card_id] = 0
        return waves[card_id]

    for cid in deps_by_card:
        resolve(cid)
    return waves


def _compute_sequences(
    cards_by_id: dict[str, Card],
    waves: dict[str, int],
) -> dict[str, int]:
    """Stable per-wave sequence: cards within a wave are ordered by their
    existing position field then id, so the labels are deterministic."""
    by_wave: dict[int, list[Card]] = defaultdict(list)
    for cid, w in waves.items():
        if cid in cards_by_id:
            by_wave[w].append(cards_by_id[cid])
    sequences: dict[str, int] = {}
    for group in by_wave.values():
        ordered = sorted(group, key=lambda c: (c.position, c.id))
        for idx, c in enumerate(ordered):
            sequences[c.id] = idx
    return sequences


async def backfill_project(project: Project, db) -> dict:
    """Process a single project. Returns a summary dict for the per-project log."""
    # Load all cards in this project via Board → BoardColumn → Card.
    rows = (
        await db.execute(
            select(Card)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .where(Board.project_id == project.id)
        )
    ).scalars().all()
    cards_by_id: dict[str, Card] = {c.id: c for c in rows}
    if not cards_by_id:
        return {"project_id": project.id, "name": project.name, "cards": 0, "edges_dropped": 0}

    deps_by_card: dict[str, set[str]] = {
        c.id: {d for d in (c.depends_on or []) if isinstance(d, str) and d in cards_by_id}
        for c in rows
    }

    reduced, dropped = _transitive_reduce(deps_by_card)
    waves = _compute_waves(reduced)
    sequences = _compute_sequences(cards_by_id, waves)

    # Update Card rows: depends_on, wave, sequence.
    for cid, card in cards_by_id.items():
        new_deps = sorted(reduced.get(cid, set()))
        new_wave = waves.get(cid, 0)
        new_sequence = sequences.get(cid, 0)
        if (
            list(card.depends_on or []) != new_deps
            or card.wave != new_wave
            or card.sequence != new_sequence
        ):
            await db.execute(
                update(Card)
                .where(Card.id == cid)
                .values(depends_on=new_deps, wave=new_wave, sequence=new_sequence)
            )

    # Delete CardLink('blocks') rows whose (source, target) pair no longer
    # exists in the reduced depends_on graph. Iterate over the existing rows
    # so we only touch links scoped to this project.
    existing_links = (
        await db.execute(
            select(CardLink).where(
                CardLink.target_card_id.in_(cards_by_id.keys()),
                CardLink.link_type == "blocks",
            )
        )
    ).scalars().all()
    links_dropped = 0
    for link in existing_links:
        if link.source_card_id not in reduced.get(link.target_card_id, set()):
            await db.execute(delete(CardLink).where(CardLink.id == link.id))
            links_dropped += 1

    return {
        "project_id": project.id,
        "name": project.name,
        "cards": len(cards_by_id),
        "edges_dropped": dropped,
        "links_dropped": links_dropped,
    }


async def main() -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        projects = (await db.execute(select(Project))).scalars().all()
        if not projects:
            print("No projects found — nothing to backfill")
            return

        print(f"Backfilling dep reduction across {len(projects)} project(s)\n")
        totals = {"cards": 0, "edges_dropped": 0, "links_dropped": 0}
        for project in projects:
            summary = await backfill_project(project, db)
            print(
                f"  • {summary['name']:<40} cards={summary['cards']:<3}"
                f" edges_dropped={summary['edges_dropped']:<3}"
                f" links_dropped={summary.get('links_dropped', 0)}"
            )
            for key in totals:
                totals[key] += summary.get(key, 0)
        await db.commit()
        print(
            f"\nDone. {totals['cards']} cards processed, "
            f"{totals['edges_dropped']} redundant edges dropped, "
            f"{totals['links_dropped']} CardLink('blocks') rows removed."
        )


if __name__ == "__main__":
    asyncio.run(main())
