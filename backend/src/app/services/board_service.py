import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.board import Board, BoardColumn, Card
from ..models.session import Session

logger = logging.getLogger(__name__)

DEFAULT_COLUMNS = ["Backlog", "To Do", "In Progress", "Review", "Done"]

# Role flags applied to the default columns at board creation. Keeps the
# orchestrator's flag-based lookup happy without forcing operators to set them
# manually. The 4-tuple is (is_start_state, agent_trigger_state, agent_review_state, is_done_state).
_DEFAULT_COLUMN_ROLES: dict[str, tuple[bool, bool, bool, bool]] = {
    "Backlog":     (True,  False, False, False),
    "To Do":       (False, True,  False, False),
    "In Progress": (False, False, False, False),
    "Review":      (False, False, True,  False),
    "Done":        (False, False, False, True),
}


def _register_board_columns(board: Board) -> None:
    """Register column→board mapping in the WS manager so broadcasts can route."""
    try:
        from ..ws.board_ws import board_manager

        for col in board.columns:
            board_manager.register_column(col.id, board.id)
    except Exception:
        pass  # best-effort


async def get_or_create_board(
    session_id: str, db: AsyncSession,
    iteration_id: str | None = None,
) -> Board:
    """Get an existing board for a project/iteration or create one."""
    query = select(Board).where(Board.session_id == session_id)
    if iteration_id:
        query = query.where(Board.iteration_id == iteration_id)
    result = await db.execute(
        query.options(
            selectinload(Board.columns)
            .selectinload(BoardColumn.cards)
            .selectinload(Card.assignee)
        )
    )
    board = result.scalar_one_or_none()

    if not board:
        proj_result = await db.execute(
            select(Session.org_id).where(Session.id == session_id)
        )
        org_id = proj_result.scalar_one_or_none()
        board = Board(
            session_id=session_id,
            org_id=org_id,
            iteration_id=iteration_id,
        )
        db.add(board)
        await db.flush()

        for i, name in enumerate(DEFAULT_COLUMNS):
            roles = _DEFAULT_COLUMN_ROLES.get(name, (False, False, False, False))
            col = BoardColumn(
                board_id=board.id,
                name=name,
                position=i,
                is_start_state=roles[0],
                agent_trigger_state=roles[1],
                agent_review_state=roles[2],
                is_done_state=roles[3],
            )
            db.add(col)

        await db.commit()
        result = await db.execute(
            select(Board)
            .where(Board.id == board.id)
            .options(selectinload(Board.columns).selectinload(BoardColumn.cards).selectinload(Card.assignee))
        )
        board = result.scalar_one()

    _register_board_columns(board)
    return board


async def get_board_by_id(board_id: str, db: AsyncSession) -> Board | None:
    """Get a board by ID with all columns and cards loaded."""
    result = await db.execute(
        select(Board)
        .where(Board.id == board_id)
        .options(selectinload(Board.columns).selectinload(BoardColumn.cards).selectinload(Card.assignee))
    )
    board = result.scalar_one_or_none()
    if board:
        _register_board_columns(board)
    return board
