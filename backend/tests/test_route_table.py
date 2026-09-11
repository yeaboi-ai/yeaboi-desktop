"""No two handlers may answer the same (method, path).

FastAPI takes the first router that matches and says nothing about the second,
so a duplicate path silently makes one handler unreachable. That is not
hypothetical: collapsing `/api/projects/{id}` onto `/api/sessions/{id}` put two
different DELETE handlers and two different attachment uploads on one path
each, and both the type checker and the test suite stayed green while half of
those endpoints were dead.
"""

from collections import defaultdict

from src.app.main import create_app

_IGNORED_METHODS = {"HEAD", "OPTIONS"}


def test_no_two_handlers_share_a_method_and_path():
    seen: dict[tuple[str, str], list[str]] = defaultdict(list)
    for route in create_app().routes:
        path = getattr(route, "path", None)
        if not path:
            continue
        for method in getattr(route, "methods", None) or []:
            if method in _IGNORED_METHODS:
                continue
            seen[(method, path)].append(getattr(route, "name", "?"))

    shadowed = {key: names for key, names in seen.items() if len(names) > 1}
    assert not shadowed, "\n".join(
        f"{method} {path} is served by {names} — only the first is reachable"
        for (method, path), names in sorted(shadowed.items())
    )


def _matches(pattern: str, path: str) -> bool:
    """Would `pattern` (which may carry `{param}` segments) capture `path`?"""
    left, right = pattern.strip("/").split("/"), path.strip("/").split("/")
    if len(left) != len(right):
        return False
    return all(a.startswith("{") or a == b for a, b in zip(left, right, strict=True))


def test_a_static_segment_is_never_shadowed_by_an_earlier_parameter():
    """`/api/sessions/deepgram-token` must not be read as a session id.

    FastAPI matches in registration order, not by specificity, so a static
    segment registered after a `{param}` sibling that captures it — on the same
    method — can never be reached.
    """
    routes: list[tuple[str, str]] = []
    for route in create_app().routes:
        path = getattr(route, "path", None)
        if not path:
            continue
        for method in getattr(route, "methods", None) or []:
            if method not in _IGNORED_METHODS:
                routes.append((method, path))

    shadowed: set[str] = set()
    for index, (method, path) in enumerate(routes):
        if "{" not in path:
            continue
        for later_method, later in routes[index + 1 :]:
            if later_method == method and "{" not in later and _matches(path, later):
                shadowed.add(f"{method} {later} is registered after {path}, which captures it")
    assert not shadowed, "\n".join(sorted(shadowed))
