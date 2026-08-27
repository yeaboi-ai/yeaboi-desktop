"""RunPod serverless GPU provisioner for PersonaPlex inference."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "")
RUNPOD_BASE_URL = "https://api.runpod.ai/v2"


async def start_personaplex_pod(text_prompt: str) -> dict:
    """Start a PersonaPlex inference pod and return connection info.

    Returns:
        {"pod_id": str, "status": "starting"} on success
        {"error": str} on failure
    """
    if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
        return {"error": "RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID not configured"}

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                f"{RUNPOD_BASE_URL}/{RUNPOD_ENDPOINT_ID}/run",
                headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
                json={
                    "input": {
                        "text_prompt": text_prompt,
                    }
                },
            )
            resp.raise_for_status()
            data = resp.json()
            pod_id = data.get("id")
            logger.info("RunPod job started: %s", pod_id)
            return {"pod_id": pod_id, "status": "starting"}
        except Exception as e:
            logger.error("RunPod provisioning failed: %s", e)
            return {"error": str(e)}


async def get_pod_status(pod_id: str) -> dict:
    """Poll RunPod job status. Returns ws_url when ready."""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                f"{RUNPOD_BASE_URL}/{RUNPOD_ENDPOINT_ID}/status/{pod_id}",
                headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")
            if status == "COMPLETED":
                output = data.get("output", {})
                return {"status": "ready", "ws_url": output.get("ws_url", "")}
            elif status == "FAILED":
                return {"status": "failed", "error": data.get("error", "unknown")}
            else:
                return {"status": "starting"}
        except Exception as e:
            logger.error("RunPod status check failed: %s", e)
            return {"status": "error", "error": str(e)}


async def stop_pod(pod_id: str) -> None:
    """Cancel a running RunPod job."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            await client.post(
                f"{RUNPOD_BASE_URL}/{RUNPOD_ENDPOINT_ID}/cancel/{pod_id}",
                headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            )
            logger.info("RunPod job cancelled: %s", pod_id)
        except Exception as e:
            logger.warning("RunPod cancel failed (non-fatal): %s", e)
