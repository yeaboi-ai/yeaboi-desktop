"""Tests for the references a project carries: [{source, subject, label, url}] on create, patch and get."""

import pytest

REF = {
    "source": "jira",
    "subject": "OPS-12",
    "label": "OPS-12 Fix login",
    "url": "https://x.atlassian.net/browse/OPS-12",
}


async def test_create_with_references_round_trips(client, auth_headers):
    resp = await client.post(
        "/api/sessions",
        json={
            "name": "Refs",
            "references": [REF, {"source": "aws", "subject": "us-east-1 lambda", "label": "AWS lambda"}],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["references"] == [
        REF,
        {"source": "aws", "subject": "us-east-1 lambda", "label": "AWS lambda", "url": None},
    ]
    assert body["attachments"] is None

    got = (await client.get(f"/api/sessions/{body['id']}", headers=auth_headers)).json()
    assert got["references"] == body["references"]
    assert got["attachments"] == []

    listed = (await client.get("/api/sessions", headers=auth_headers)).json()
    assert listed[0]["references"] == body["references"] and listed[0]["attachments"] is None


async def test_a_project_without_references_has_an_empty_list(client, auth_headers):
    resp = await client.post("/api/sessions", json={"name": "Plain"}, headers=auth_headers)
    assert resp.json()["references"] == []


async def test_patch_replaces_and_dedupes(client, auth_headers):
    created = (await client.post("/api/sessions", json={"name": "P", "references": [REF]}, headers=auth_headers)).json()
    resp = await client.patch(
        f"/api/sessions/{created['id']}",
        json={"references": [{"source": "github", "subject": "o/r", "label": "o/r"}, REF, {**REF, "label": "twice"}]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert [r["subject"] for r in resp.json()["references"]] == ["o/r", "OPS-12"]
    assert resp.json()["references"][1]["label"] == "OPS-12 Fix login"

    resp = await client.patch(f"/api/sessions/{created['id']}", json={"references": []}, headers=auth_headers)
    assert resp.json()["references"] == []

    # A PATCH that says nothing about references leaves them alone.
    await client.patch(f"/api/sessions/{created['id']}", json={"references": [REF]}, headers=auth_headers)
    resp = await client.patch(f"/api/sessions/{created['id']}", json={"name": "Renamed"}, headers=auth_headers)
    assert resp.json()["name"] == "Renamed" and resp.json()["references"] == [REF]


async def test_fields_are_stripped_and_a_blank_url_is_null(client, auth_headers):
    resp = await client.post(
        "/api/sessions",
        json={
            "name": "S",
            "references": [{"source": " jira ", "subject": "  OPS-1 ", "label": "OPS-1   Fix", "url": "  "}],
        },
        headers=auth_headers,
    )
    assert resp.json()["references"] == [{"source": "jira", "subject": "OPS-1", "label": "OPS-1 Fix", "url": None}]


@pytest.mark.parametrize(
    "bad",
    [
        [{"source": "", "subject": "x", "label": "x"}],
        [{"source": "jira", "subject": "x", "label": "y" * 201}],
        [{"source": "jira", "subject": "x", "label": "x", "url": "javascript:alert(1)"}],
        [{"source": "jira", "subject": "x", "label": "x", "url": "ftp://x"}],
        [{"source": "jira", "subject": f"K-{i}", "label": "x"} for i in range(25)],
        "not a list",
    ],
)
async def test_malformed_references_are_422(client, auth_headers, bad):
    resp = await client.post("/api/sessions", json={"name": "Bad", "references": bad}, headers=auth_headers)
    assert resp.status_code == 422, resp.text
    created = (await client.post("/api/sessions", json={"name": "Ok"}, headers=auth_headers)).json()
    resp = await client.patch(f"/api/sessions/{created['id']}", json={"references": bad}, headers=auth_headers)
    assert resp.status_code == 422


async def test_an_explicit_null_is_422_not_a_500(client, auth_headers):
    # references is NOT NULL, so writing None straight through would be an
    # IntegrityError the caller sees as a 500.
    created = (await client.post("/api/sessions", json={"name": "Ok"}, headers=auth_headers)).json()
    resp = await client.patch(f"/api/sessions/{created['id']}", json={"references": None}, headers=auth_headers)
    assert resp.status_code == 422, resp.text

    got = (await client.get(f"/api/sessions/{created['id']}", headers=auth_headers)).json()
    assert got["references"] == []
