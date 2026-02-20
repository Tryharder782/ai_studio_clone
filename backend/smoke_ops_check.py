import json
import uuid

from fastapi.testclient import TestClient

import main


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_status(response, expected: int, step: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{step} failed: expected {expected}, got {response.status_code}, body={response.text[:500]}"
        )


def run_smoke() -> None:
    client = TestClient(main.app)
    store_snapshot = json.loads(json.dumps(main.ensure_ops_store(), ensure_ascii=False))
    suffix = uuid.uuid4().hex[:8]
    smoke_title = f"Smoke Opportunity {suffix}"
    created_opportunity_id = ""
    created_usage_event_id = ""

    try:
        phase1_res = client.get("/api/ops/phase1")
        require_status(phase1_res, 200, "phase1 load")

        create_opp_res = client.post(
            "/api/ops/opportunity",
            json={
                "title": smoke_title,
                "client": "Smoke Client",
                "stage": "discovery",
                "summary": "Need urgent WebGL optimization and one more feature change request.",
                "notes": "Budget around $1800, estimated 20-30 hours.",
                "expected_revenue_usd": 1800,
                "estimated_hours": 24,
                "platform": "Upwork",
            },
        )
        require_status(create_opp_res, 200, "create opportunity")
        create_payload = create_opp_res.json()
        created_opportunity = next(
            (item for item in create_payload.get("opportunities", []) if item.get("title") == smoke_title),
            None,
        )
        require(created_opportunity is not None, "created opportunity not found in payload")
        created_opportunity_id = str(created_opportunity.get("id"))

        proposal_res = client.post(
            "/api/ops/proposal_pack",
            json={"opportunity_id": created_opportunity_id, "include_ai_draft": False},
        )
        require_status(proposal_res, 200, "proposal pack v2")
        proposal_pack = proposal_res.json().get("pack", {})
        require("playbook_recommendations" in proposal_pack, "proposal pack is missing playbook_recommendations")

        suggest_res = client.post(
            "/api/ops/playbook/suggest",
            json={
                "opportunity_id": created_opportunity_id,
                "context_text": "Client is urgent and asks for one more feature out of scope.",
                "limit": 3,
            },
        )
        require_status(suggest_res, 200, "playbook suggest")
        suggestions = suggest_res.json().get("suggestions", [])
        require(len(suggestions) > 0, "playbook suggestions are empty")
        playbook_id = str(suggestions[0].get("playbook_id", ""))
        require(bool(playbook_id), "suggestion does not contain playbook_id")

        mark_used_res = client.post(
            "/api/ops/playbook/mark_used",
            json={
                "id": playbook_id,
                "opportunity_id": created_opportunity_id,
                "notes": "smoke usage event",
                "matched_triggers": suggestions[0].get("matched_triggers", []),
                "source": "smoke_check",
            },
        )
        require_status(mark_used_res, 200, "mark playbook used")
        created_usage_event_id = str(mark_used_res.json().get("playbook_usage_event", {}).get("id", ""))
        require(bool(created_usage_event_id), "playbook usage event id is missing")

        feedback_res = client.post(
            "/api/ops/playbook/usage/feedback",
            json={
                "id": created_usage_event_id,
                "feedback_score": 1,
                "feedback_note": "Worked well in negotiation smoke test.",
            },
        )
        require_status(feedback_res, 200, "usage feedback update")

        stage_res = client.post(
            "/api/ops/opportunity/stage",
            json={"id": created_opportunity_id, "stage": "won"},
        )
        require_status(stage_res, 200, "opportunity stage update")

        refresh_res = client.get("/api/ops/phase1")
        require_status(refresh_res, 200, "phase1 refresh")
        refresh_payload = refresh_res.json()
        usage_events = refresh_payload.get("playbook_usage_events", [])
        event_row = next((item for item in usage_events if str(item.get("id")) == created_usage_event_id), None)
        require(event_row is not None, "usage event missing after stage update")
        require(str(event_row.get("outcome")) == "won", "usage event outcome was not auto-linked to won")
        require(str(event_row.get("feedback_label")) == "helpful", "usage event feedback label mismatch")

        backup_res = client.post("/api/ops/backup/create", json={})
        require_status(backup_res, 200, "backup create")
        require(bool(backup_res.json().get("created_backup")), "backup response missing created_backup")

        delete_usage_res = client.post("/api/ops/playbook/usage/delete", json={"id": created_usage_event_id})
        require_status(delete_usage_res, 200, "usage event delete")
        created_usage_event_id = ""

        delete_opp_res = client.post("/api/ops/opportunity/delete", json={"id": created_opportunity_id})
        require_status(delete_opp_res, 200, "opportunity delete")
        created_opportunity_id = ""

        print("Smoke check passed: phase1/proposal/playbook/feedback/backup flow is healthy.")
    finally:
        main.save_ops_store(store_snapshot)


if __name__ == "__main__":
    run_smoke()
