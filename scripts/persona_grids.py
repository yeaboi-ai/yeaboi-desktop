"""The eight personas as pixel grids, on the duck's own 64-cell art grid.

The duck in the vendored art faces left: the bill is at the left edge, the
tail at the right, the crown at row 1, the shades across rows 9-14, the wing
over rows 28-46. A layer is a block of rows placed at a cell offset; rows
above the crown are negative, down to ``-HEADROOM_CELLS``. Letters are the
duck's own colours, so a persona never wears a colour the duck does not:

    a amber   w white   k shade black   n outline navy
    t teal    m mint    s steel light   d steel dark   . clear
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

#: Cells above the crown a layer may use (OUTFIT_HEADROOM / 2).
HEADROOM_CELLS = 20
#: The art grid: 64 cells wide, 68 tall.
GRID = (64, 68)

Cells = dict[tuple[int, int], str]


@dataclass
class Layer:
    persona: str
    slot: str  # "top" over everything; "body" between the body and the wing
    cells: Cells = field(default_factory=dict)

    def grid(self, x0: int, y0: int, rows: list[str]) -> Layer:
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch != ".":
                    self.cells[(x0 + dx, y0 + dy)] = ch
        return self

    def ring(
        self,
        cx: float,
        cy: float,
        rx: float,
        ry: float,
        edge: float,
        fill: str,
        *,
        rim: str = "n",
        keep=lambda x, y: True,
    ) -> Layer:
        """An elliptical band ``edge`` cells thick, rimmed on both sides."""
        for y in range(-HEADROOM_CELLS, GRID[1]):
            for x in range(GRID[0]):
                if not keep(x, y):
                    continue
                r = math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
                inner = 1 - edge / max(rx, ry)
                if inner <= r <= 1:
                    outer_rim = r > 1 - 1 / max(rx, ry)
                    inner_rim = r < inner + 1 / max(rx, ry)
                    self.cells[(x, y)] = rim if (outer_rim or inner_rim) else fill
        return self


def engineer() -> list[Layer]:
    hat = Layer("engineer", "top").grid(
        4,
        -11,
        [
            "...........nnnnnnnnnn...........",
            "........nnnaaaaaaaaaannn........",
            "......nnaaaaaaaawwaaaaaann......",
            ".....naaaaaaaaawwaaaaaaaaan.....",
            "....naaaaaaaaaaaaaaaaaaaaaan....",
            "...naaaaaaaaaaaaaaaaaaaaaaaan...",
            "..nnwwnaaaaaaaaaaaaaaaaaaaaan...",
            ".nwwwwnaaaaaaaaaaaaaaaaaaaaaan..",
            ".nwwwwnaaaaaaaaaaaaaaaaaaaaaan..",
            "..nnwwnaaaaaaaaaaaaaaaaaaaaan...",
            "...naaaaaaaaaaaaaaaaaaaaaaaan...",
            "...naaaaaaaaaaaaaaaaaaaaaaaan...",
            ".nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn.",
            "naaaaaaaaaaaaaaaaaaaaaaaaaaaaaan",
            "naaaaaaaaaaaaaaaaaaaaaaaaaaaaaan",
            ".nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn.",
        ],
    )
    hat.grid(
        13,
        32,
        [
            "nsssn.nsssn",
            "nsddn.nddsn",
            "nsddn.nddsn",
            ".nsddndddsn",
            "..nsddddsn.",
            "...nsddsn..",
            "...nsddsn..",
            "...nsddsn..",
            "...nsddsn..",
            "...nsddsn..",
            "...nsddsn..",
            "...nsddsn..",
            "..nsdddsn..",
            "..nsdddsn..",
            "...nsssn...",
            "....nnn....",
        ],
    )
    return [hat]


def teacher() -> list[Layer]:
    top = Layer("teacher", "top").grid(
        1,
        -7,
        [
            "......nnnnnnnnnnnnnnnnnnnnnnnnnnnnn...",
            "....nnkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn..",
            "..nnkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn.",
            ".nkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn.",
            ".nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn..",
            ".na.......nkkkkkkkkkkkkkkkkkkn.........",
            ".na.......nkkkkkkkkkkkkkkkkkkn.........",
            ".na......nkkkkkkkkkkkkkkkkkkkkn........",
            ".na......nkkkkkkkkkkkkkkkkkkkkn........",
            ".na.....nkkkkkkkkkkkkkkkkkkkkkkn.......",
            "naaa....nkkkkkkkkkkkkkkkkkkkkkkn.......",
            "naaa....nnnnnnnnnnnnnnnnnnnnnnnn.......",
            ".nn....................................",
        ],
    )
    top.grid(
        20,
        28,
        [
            "..............naan",
            ".............nann.",
            "............nann..",
            "...........nann...",
            "..........nnn.....",
            ".........nnn......",
            "........nnn.......",
            ".......nnn........",
            "......nnn.........",
            ".....nnn..........",
            "....nnn...........",
            "...nnn............",
            "..nnn.............",
            ".nnn..............",
            "nnn...............",
        ],
    )
    return [top]


def martial() -> list[Layer]:
    band = Layer("martial", "top").grid(
        7,
        5,
        [
            ".nnnnnnnnnnnnnnnnnnnnnnnnnnn..........",
            "nwwwaaawwwwwwwwwwwwwwwwwwwwwnnn.......",
            "nwwaaaaawwwwwwwwwwwwwwwwwwwwwwwnnnn...",
            "nwwwaaawwwwwwwwwwwwwwwwwwwwnnwwwwwnnn.",
            ".nnnnnnnnnnnnnnnnnnnnnnnnnn..nnnwwwwwn",
            "..........................nn..nnwwwwn.",
            "...........................nwwn..nnnn.",
            "...........................nwwwn......",
            "............................nnwwn.....",
            ".............................nnn......",
        ],
    )
    belt = Layer("martial", "body").grid(
        7,
        43,
        [
            "..nnnnnnn...........................................",
            ".nkkkkkkknnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn..",
            ".nkkknkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn.",
            ".nkkknkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn.",
            ".nkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn..",
            "..nkkknkkknnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn...",
            "..nkkknkkkn.........................................",
            "..nkkknkkkn.........................................",
            "...nkknkkkn.........................................",
            "...nkknkkkn.........................................",
            "...nkkn.nkkn........................................",
            "....nn...nn.........................................",
        ],
    )
    return [belt, band]


def chef() -> list[Layer]:
    top = Layer("chef", "top").grid(
        6,
        -18,
        [
            ".......nnnn....nnnn...........",
            ".....nnwwwwnn.nwwwwnn.........",
            "....nwwwwwwwwnwwwwwwwn........",
            "...nwwwwwwwwwwwwwwwwwwn.......",
            "..nwwwwwwwwwwwwwwwwwwwwn......",
            "..nwwwwwwwwwwwwwwwwwwwwwn.....",
            ".nwwwwwwwwwwwwwwwwwwwwwwn.....",
            ".nwwwwwwwwwwwwwwwwwwwwwwwn....",
            ".nwwwwwwwwwwwwwwwwwwwwwwwn....",
            "..nwwwwwwwwwwwwwwwwwwwwwn.....",
            "..nwwwwwwwwwwwwwwwwwwwwwn.....",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nwwwwwwwwwwwwwwwwwwwn......",
            "...nnnnnnnnnnnnnnnnnnnnn......",
            "...nnnnnnnnnnnnnnnnnnnnn......",
            "...nnnnnnnnnnnnnnnnnnnnn......",
            "...nnnnnnnnnnnnnnnnnnnnn......",
        ],
    )
    top.grid(
        9,
        25,
        [
            "..naaaaaaaaaaaaaan..",
            ".naaaaaaaaaaaaaaaan.",
            ".naaannaaaaaaaaaaan.",
            "naaan..naaaaaaaaaan.",
            "naaan...nnaaaaaannn.",
            ".naan.....nnnnnn....",
            ".naan...............",
            "..nan...............",
            "..nn................",
        ],
    )
    return [top]


def astronaut() -> list[Layer]:
    top = Layer("astronaut", "top")
    # The helmet: a band around the whole head, open at the front so the bill
    # and the shades look out of the raised visor.
    top.ring(21.5, 12, 17, 16.5, 5, "w", keep=lambda x, y: not (x < 14 and 8 <= y <= 26))
    top.grid(
        52,
        24,
        [
            ".nnnnnnnnnn.",
            "nssssssssssn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddaaddddsn",
            "nsddaaddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nsddddddddsn",
            "nssssssssssn",
            ".nnnnnnnnnn.",
        ],
    )
    return [top]


def dj() -> list[Layer]:
    top = Layer("dj", "top")
    # The band: the upper half of a ring over the crown, temple to temple.
    top.ring(21, 12, 17, 17, 3, "n", keep=lambda x, y: y <= 7)
    top.grid(
        29,
        7,
        [
            "..nnnnn..",
            ".naaaaan.",
            "naaaaaaan",
            "naakkkaan",
            "naakkkaan",
            "naakkkaan",
            "naaaaaaan",
            ".naaaaan.",
            "..nnnnn..",
        ],
    )
    return [top]


def detective() -> list[Layer]:
    top = Layer("detective", "top").grid(
        1,
        -9,
        [
            ".................nnnn...................",
            "................nssssn..................",
            "................nssssn..................",
            "...........nnnnnnssssnnnnnnn............",
            ".........nnssssssssssssssssssnn.........",
            ".......nnssdsssdsssdsssdsssdssnn........",
            "......nssssssssssssssssssssssssssn......",
            ".....nsssdsssdsssdsssdsssdsssdsssn......",
            "....nssssssssssssssssssssssssssssssn....",
            "....nsdsssdsssdsssdsssdsssdsssdsssssn...",
            "....nssssssssssssssssssssssssssssssn....",
            "...nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn...",
            "nssssssnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssn",
            "nssssssn........................nssssssn",
            ".nnnnnn..........................nnnnnn.",
        ],
    )
    top.grid(
        13,
        33,
        [
            "...nnnnn........",
            "..nww..wn.......",
            ".nw.....wn......",
            "n.........n.....",
            "n.........n.....",
            "n.........n.....",
            ".n.......n......",
            "..n.....nn......",
            "...nnnnnnnn.....",
            ".........nnn....",
            "..........nnn...",
            "...........nnn..",
            "............nnn.",
            ".............nn.",
        ],
    )
    return [top]


def wizard() -> list[Layer]:
    top = Layer("wizard", "top").grid(
        2,
        -20,
        [
            "..........................nn.........",
            ".........................naan........",
            "........................naaan........",
            ".......................nnaan.........",
            "......................nddn...........",
            ".....................nddn............",
            "....................ndddn............",
            "...................nddddn............",
            "..................ndddddn............",
            ".................ndddaddn............",
            ".................nddaaadn............",
            "................nddddaddn............",
            "...............nddddddddn............",
            "..............nddddddddddn...........",
            "..............nddddddadddn...........",
            ".............nddddddaaaddn...........",
            "............ndddddddddadddn..........",
            "...........nddddaddddddddddn.........",
            "...........ndddaaaddddddddddn........",
            "..........nddddddadddddddddddn.......",
            "..........ndddddddddddddddddddn......",
            ".........nddddddddddddddddddddn......",
            ".........nddddddddddddddddddddn......",
            "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
            "ndddddddddddddddddddddddddddddddddddn",
            "naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan",
            "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
        ],
    )
    top.grid(
        8,
        30,
        [
            "....naan........",
            "...naaaan.......",
            "....naan........",
            ".....nn.........",
            "......nn........",
            ".......nn.......",
            "........nn......",
            ".........nn.....",
            "..........nn....",
            "...........nn...",
            "............nn..",
            ".............nn.",
        ],
    )
    return [top]


DRAW = {
    "engineer": engineer,
    "teacher": teacher,
    "martial": martial,
    "chef": chef,
    "astronaut": astronaut,
    "dj": dj,
    "detective": detective,
    "wizard": wizard,
}


def layers(persona: str) -> list[Layer]:
    return DRAW[persona]()
