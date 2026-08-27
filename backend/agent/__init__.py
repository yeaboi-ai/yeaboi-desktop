# Layout shim: in the packaged wheel the API package installs as `app`; in
# the repo it lives at backend/src/app with nothing putting src/ on sys.path
# for the worker. Make `app` importable either way, so the worker's
# `from app.services...` imports are one spelling in both worlds.
try:
    import app  # noqa: F401  (wheel layout)
except ImportError:  # repo layout
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
