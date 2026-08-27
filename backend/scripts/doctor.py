"""Preflight check for local dev — runs from `make doctor`.

Reports the state of every dependency the platform needs to run locally
(Docker services, ports, env vars, LAN IP, alembic head). Each failure
prints the exact command to fix it. Exits 1 on any ✗ so it's CI-friendly.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env"
DETECT_IP = ROOT / "backend" / "scripts" / "detect_lan_ip.sh"

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
WARN = "\033[33m○\033[0m"
DIM = "\033[2m"
RESET = "\033[0m"

failures: list[str] = []


def report(status: str, label: str, detail: str = "", fix: str = "") -> None:
    line = f"  {status} {label}"
    if detail:
        line += f"  {DIM}{detail}{RESET}"
    print(line)
    if status == FAIL:
        if fix:
            print(f"      {DIM}fix:{RESET} {fix}")
        failures.append(label)


def check_tcp(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def check_http(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= resp.status < 500
    except (urllib.error.URLError, TimeoutError, ConnectionResetError):
        return False


def check_docker_running() -> bool:
    try:
        return (
            subprocess.run(
                ["docker", "info"],
                capture_output=True,
                timeout=3,
            ).returncode
            == 0
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def parse_env_file() -> dict[str, str]:
    if not ENV_FILE.exists():
        return {}
    out: dict[str, str] = {}
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip("\"'")
    return out


def section(title: str) -> None:
    print(f"\n{title}")


def main() -> int:
    print("planning-platform — local dev doctor\n")

    # ── Tooling ───────────────────────────────────────────────────────────
    section("Tooling")
    docker_ok = check_docker_running()
    report(
        PASS if docker_ok else FAIL,
        "Docker daemon",
        "" if docker_ok else "not reachable",
        fix="open Docker Desktop (or `colima start`)",
    )

    if DETECT_IP.exists():
        try:
            ip = subprocess.check_output([str(DETECT_IP)], timeout=3, text=True).strip()
            looks_loopback = ip in ("", "127.0.0.1")
            report(
                WARN if looks_loopback else PASS,
                "LAN IP detected",
                ip or "(empty)",
                fix=""
                if not looks_loopback
                else "ensure your machine is on a network — LiveKit needs a real LAN address for WebRTC",
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            report(FAIL, "LAN IP detected", str(e), fix="check backend/scripts/detect_lan_ip.sh")
    else:
        report(FAIL, "LAN IP detected", "detect_lan_ip.sh missing")

    # ── Docker services ───────────────────────────────────────────────────
    section("Docker services")
    services = [
        ("Postgres", "localhost", 5432, "make db-up"),
        ("Redis", "localhost", 6379, "make db-up"),
        ("Mailpit (SMTP)", "localhost", 1025, "make db-up"),
        ("Mailpit (web UI)", "localhost", 8025, "make db-up"),
        ("LiveKit", "localhost", 7880, "make db-up"),
    ]
    for name, host, port, fix in services:
        ok = check_tcp(host, port)
        report(
            PASS if ok else FAIL,
            f"{name} on :{port}",
            "" if ok else "not reachable",
            fix=fix,
        )

    # ── Required env vars ────────────────────────────────────────────────
    section("Required env vars (.env)")
    if not ENV_FILE.exists():
        report(FAIL, ".env file", "missing", fix="cp .env.example .env")
        env: dict[str, str] = {}
    else:
        report(PASS, ".env file", str(ENV_FILE.relative_to(ROOT)))
        env = parse_env_file()

    required = [
        ("DATABASE_URL", "default: postgresql://planning:planning@localhost:5432/planning_platform"),
        ("REDIS_URL", "default: redis://localhost:6379/0"),
        ("NEXTAUTH_SECRET", "any non-empty string for dev"),
        ("INTERNAL_API_SECRET", "shared backend↔agent secret (any string)"),
        ("BACKEND_URL", "default: http://localhost:8000"),
        ("LIVEKIT_URL", "default: ws://localhost:7880"),
        ("LIVEKIT_API_KEY", "default: devkey"),
        ("LIVEKIT_API_SECRET", "default: devsecret"),
        ("ANTHROPIC_API_KEY", "https://console.anthropic.com — required for AI"),
    ]
    for key, hint in required:
        val = env.get(key, "") or os.environ.get(key, "")
        report(
            PASS if val else FAIL,
            key,
            "" if val else hint,
            fix=f"set {key}= in .env" if not val else "",
        )

    # ── Optional env vars ────────────────────────────────────────────────
    section("Optional env vars (features they unlock)")
    optional = [
        ("DEEPGRAM_API_KEY", "voice agent speech-to-text"),
        ("ELEVENLABS_API_KEY", "voice agent text-to-speech"),
        ("OPENAI_API_KEY", "DALL-E mockups + Whisper STT"),
        ("GOOGLE_API_KEY", "Gemini vision (screenshot analysis)"),
        ("TAVUS_API_KEY", "live video avatars"),
    ]
    for key, feature in optional:
        val = env.get(key, "") or os.environ.get(key, "")
        status = PASS if val else WARN
        report(status, key, feature if val else f"(disabled — {feature})")

    # ── Backend (only if running) ─────────────────────────────────────────
    section("Running services")
    backend_url = env.get("BACKEND_URL", "http://localhost:8000")
    if check_tcp("localhost", 8000):
        if check_http(f"{backend_url}/api/health"):
            report(PASS, "Backend /api/health", "200 OK")
        else:
            report(FAIL, "Backend /api/health", "port open but health check failed", fix="check .dev/backend.log")
    else:
        report(WARN, "Backend on :8000", "not running (run `make dev`)")

    if check_tcp("localhost", 8081):
        report(PASS, "Voice agent on :8081", "running")
    else:
        report(WARN, "Voice agent on :8081", "not running (run `make dev` or `make agent`)")

    if check_tcp("localhost", 3001):
        report(PASS, "Frontend on :3001", "running")
    else:
        report(WARN, "Frontend on :3001", "not running (run `make dev`)")

    # ── Alembic ───────────────────────────────────────────────────────────
    section("Database migrations")

    def _first_revision(output: str) -> str:
        for raw in output.splitlines():
            line = raw.strip()
            if not line or line.startswith("INFO"):
                continue
            tok = line.split()[0]
            if all(c in "0123456789abcdef" for c in tok.lower()) and len(tok) >= 8:
                return tok
        return ""

    try:
        cur_out = subprocess.check_output(
            ["uv", "run", "alembic", "current"],
            cwd=ROOT / "backend",
            stderr=subprocess.STDOUT,
            timeout=15,
            text=True,
        )
        head_out = subprocess.check_output(
            ["uv", "run", "alembic", "heads"],
            cwd=ROOT / "backend",
            stderr=subprocess.STDOUT,
            timeout=15,
            text=True,
        )
        cur_rev = _first_revision(cur_out)
        head_rev = _first_revision(head_out)
        if cur_rev and head_rev and cur_rev == head_rev:
            report(PASS, "alembic head", cur_rev[:12])
        elif not cur_rev:
            report(FAIL, "alembic", "no migration applied yet", fix="make db-migrate")
        else:
            report(
                FAIL,
                "alembic",
                f"current {cur_rev[:12]} ≠ head {head_rev[:12]}",
                fix="make db-migrate",
            )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        report(WARN, "alembic", "could not introspect (DB may be down)")

    # ── Summary ───────────────────────────────────────────────────────────
    print()
    if failures:
        print(f"{FAIL} {len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print(f"{PASS} all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
