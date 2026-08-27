"""Extract text content from various document formats with security hardening."""

import asyncio
import csv
import io
import json
import logging
import re
from html.parser import HTMLParser
from pathlib import Path

logger = logging.getLogger(__name__)

# Max chars to extract from a single document
MAX_EXTRACT_CHARS = 15_000

# Extraction timeout (seconds) — prevents zip bombs and infinite loops
EXTRACTION_TIMEOUT = 30

# ─── Magic byte validation ────────────────────────────────────────────────────

# Map file extensions to expected MIME type prefixes
ALLOWED_MIME_MAP: dict[str, list[str]] = {
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".gif": ["image/gif"],
    ".webp": ["image/webp"],
    ".pdf": ["application/pdf"],
    ".docx": [
        "application/vnd.openxmlformats",
        "application/zip",  # docx is a zip archive
    ],
    ".xlsx": [
        "application/vnd.openxmlformats",
        "application/zip",
    ],
    ".csv": ["text/", "application/csv"],
    ".txt": ["text/"],
    ".md": ["text/"],
    ".markdown": ["text/"],
    ".html": ["text/html", "text/"],
    ".htm": ["text/html", "text/"],
    ".json": ["text/", "application/json"],
}


def validate_file_type(filepath: Path, claimed_extension: str) -> bool:
    """Verify the file's actual content matches its claimed extension.

    Returns True if valid, False if the file appears to be mismatched
    (e.g. an executable renamed to .pdf).
    """
    try:
        import magic
    except ImportError:
        logger.warning("python-magic not installed — skipping magic byte validation")
        return True

    try:
        detected = magic.from_file(str(filepath), mime=True)
    except Exception as e:
        logger.warning("Magic byte detection failed: %s", e)
        return True  # fail open if detection itself fails

    ext = claimed_extension.lower()
    allowed = ALLOWED_MIME_MAP.get(ext)
    if not allowed:
        logger.warning("No MIME map for extension %s, detected: %s", ext, detected)
        return False

    for prefix in allowed:
        if detected.startswith(prefix):
            return True

    logger.warning("MIME mismatch: extension=%s, expected=%s, detected=%s", ext, allowed, detected)
    return False


# ─── Prompt injection sanitisation ────────────────────────────────────────────

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.I),
    re.compile(r"ignore\s+(all\s+)?above\s+instructions", re.I),
    re.compile(r"you\s+are\s+now\s+(a|an)\s+", re.I),
    re.compile(r"system\s*:\s*you\s+are", re.I),
    re.compile(r"<\s*system\s*>", re.I),
    re.compile(r"new\s+instructions?\s*:", re.I),
    re.compile(r"override\s+(previous|all)\s+", re.I),
    re.compile(r"disregard\s+(all\s+)?(previous|prior)\s+", re.I),
    re.compile(r"forget\s+(all\s+)?(previous|prior)\s+", re.I),
    re.compile(r"jailbreak", re.I),
]


def sanitise_extracted_text(text: str) -> str:
    """Strip known prompt injection patterns from extracted document text."""
    for pattern in _INJECTION_PATTERNS:
        text = pattern.sub("[removed]", text)
    return text


# ─── Image re-encoding ────────────────────────────────────────────────────────


def reencode_image(filepath: Path) -> bytes:
    """Re-encode an image through Pillow to strip any embedded payloads."""
    from PIL import Image

    img = Image.open(filepath)
    img = img.convert("RGB") if img.mode not in ("RGB", "L") else img
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ─── HTML extractor ───────────────────────────────────────────────────────────


class _HTMLTextExtractor(HTMLParser):
    """Strip HTML tags and extract plain text."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False
        if tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def get_text(self) -> str:
        return "".join(self._parts).strip()


# ─── Per-format extractors ────────────────────────────────────────────────────


def _extract_html(filepath: Path) -> str:
    text = filepath.read_text(encoding="utf-8", errors="replace")
    parser = _HTMLTextExtractor()
    parser.feed(text)
    return parser.get_text()


def _extract_pdf(filepath: Path) -> str:
    import fitz  # pymupdf

    doc = fitz.open(str(filepath))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages).strip()


def _extract_docx(filepath: Path) -> str:
    from docx import Document

    doc = Document(str(filepath))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_xlsx(filepath: Path) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(str(filepath), read_only=True, data_only=True)
    parts = []
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        parts.append(f"## {sheet}")
        for row in rows[:200]:  # cap at 200 rows
            cells = [str(c) if c is not None else "" for c in row]
            parts.append(" | ".join(cells))
    wb.close()
    return "\n".join(parts)


def _extract_csv(filepath: Path) -> str:
    text = filepath.read_text(encoding="utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = []
    for i, row in enumerate(reader):
        if i >= 200:  # cap at 200 rows
            break
        rows.append(" | ".join(row))
    return "\n".join(rows)


# ─── Main extraction entry point ──────────────────────────────────────────────


def _extract_sync(filepath: Path, suffix: str, ct: str) -> str:
    """Synchronous extraction — runs inside a thread with timeout."""
    if suffix == ".pdf" or ct == "application/pdf":
        return _extract_pdf(filepath)

    elif suffix in (".docx",) or ct in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",):
        return _extract_docx(filepath)

    elif suffix in (".xlsx",) or ct in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",):
        return _extract_xlsx(filepath)

    elif suffix == ".csv" or ct == "text/csv":
        return _extract_csv(filepath)

    elif suffix in (".html", ".htm") or ct == "text/html":
        return _extract_html(filepath)

    elif suffix == ".json" or ct == "application/json":
        raw = filepath.read_text(encoding="utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
            return json.dumps(parsed, indent=2)
        except json.JSONDecodeError:
            return raw

    elif suffix in (".txt", ".md", ".markdown") or ct.startswith("text/"):
        return filepath.read_text(encoding="utf-8", errors="replace")

    else:
        return ""


async def extract_text(filepath: Path, content_type: str | None = None) -> str:
    """Extract text content from a file with security hardening.

    1. Validates magic bytes match claimed extension
    2. Re-encodes images to strip payloads
    3. Runs extraction with timeout
    4. Sanitises output for prompt injection
    """
    suffix = filepath.suffix.lower()
    ct = (content_type or "").lower()

    # Step 1: Magic byte validation
    if not validate_file_type(filepath, suffix):
        logger.warning("Rejected file %s: MIME type mismatch", filepath.name)
        return ""

    try:
        # Step 2: Image handling — re-encode + vision analysis
        if suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp") or ct.startswith("image/"):
            from .vision_service import analyze_screenshot

            image_bytes = reencode_image(filepath)
            result = await analyze_screenshot(
                image_bytes,
                prompt=(
                    "Analyze this image in the context of software project planning. "
                    "Extract all relevant information: text content, UI layouts, "
                    "architecture diagrams, data schemas, workflows, or any other "
                    "details useful for building a project blueprint. "
                    "Be specific and structured."
                ),
            )
            return sanitise_extracted_text(result or "")

        # Step 3: Run sync extraction in thread with timeout
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _extract_sync, filepath, suffix, ct),
            timeout=EXTRACTION_TIMEOUT,
        )

        # Step 4: Sanitise extracted text
        return sanitise_extracted_text(raw)

    except TimeoutError:
        logger.error("Extraction timed out after %ss: %s", EXTRACTION_TIMEOUT, filepath.name)
        return ""
    except Exception as e:
        logger.error("Failed to extract text from %s: %s", filepath, e)
        return ""
