"""W6.6.2 — Highlight clip endpoints."""


async def _create_session(client, auth_headers) -> str:
    proj = await client.post("/api/projects", json={"name": "ClipP"}, headers=auth_headers)
    s = await client.post(
        f"/api/projects/{proj.json()['id']}/sessions",
        json={"initial_idea": "clip"},
        headers=auth_headers,
    )
    return s.json()["id"]


async def test_create_and_fetch_clip_round_trip(client, auth_headers):
    sid = await _create_session(client, auth_headers)
    create = await client.post(
        f"/api/sessions/{sid}/clips",
        json={
            "title": "Auth scope debate",
            "transcript": [
                {"ts": "2026-05-04T10:00:00Z", "speaker": "Alice", "text": "we should do it in two phases"},
                {"ts": "2026-05-04T10:00:08Z", "speaker": "Bob", "text": "agreed"},
            ],
            "start_ts": "2026-05-04T10:00:00Z",
            "end_ts": "2026-05-04T10:00:30Z",
        },
        headers=auth_headers,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["share_token"]
    assert body["share_url"].startswith("/clip/")
    assert len(body["transcript"]) == 2

    # Public fetch via share token (no auth headers).
    public = await client.get(f"/api/clips/{body['share_token']}")
    assert public.status_code == 200
    assert public.json()["title"] == "Auth scope debate"


async def test_create_clip_rejects_empty_transcript(client, auth_headers):
    sid = await _create_session(client, auth_headers)
    bad = await client.post(
        f"/api/sessions/{sid}/clips",
        json={"transcript": []},
        headers=auth_headers,
    )
    assert bad.status_code == 422


async def test_create_clip_403_for_non_participant(client, auth_headers, other_auth_headers):
    sid = await _create_session(client, auth_headers)
    bad = await client.post(
        f"/api/sessions/{sid}/clips",
        json={"transcript": [{"text": "hi"}]},
        headers=other_auth_headers,
    )
    assert bad.status_code in (403, 404)


async def test_get_clip_404_for_unknown_token(client):
    resp = await client.get("/api/clips/does-not-exist-zzz")
    assert resp.status_code == 404


async def test_list_clips_for_session(client, auth_headers):
    sid = await _create_session(client, auth_headers)
    await client.post(
        f"/api/sessions/{sid}/clips",
        json={"transcript": [{"text": "first"}]},
        headers=auth_headers,
    )
    await client.post(
        f"/api/sessions/{sid}/clips",
        json={"transcript": [{"text": "second"}]},
        headers=auth_headers,
    )
    resp = await client.get(f"/api/sessions/{sid}/clips", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
