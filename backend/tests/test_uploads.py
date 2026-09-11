import io


async def test_upload_file(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Upload test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    file_content = b"fake image data"
    resp = await client.post(
        f"/api/sessions/{session_id}/uploads",
        files={"file": ("test.png", io.BytesIO(file_content), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["original_name"] == "test.png"
    assert data["size"] == len(file_content)
    assert "url" in data


async def test_upload_requires_participant(client, auth_headers, other_auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/uploads",
        files={"file": ("test.png", io.BytesIO(b"data"), "image/png")},
        headers=other_auth_headers,
    )
    assert resp.status_code == 403
