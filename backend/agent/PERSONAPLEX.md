# PersonaPlex Voice Integration

## Required Environment Variables

Set these on the agent service (Railway livekit-aiagent):

| Variable | Required | Description |
|----------|----------|-------------|
| `PERSONAPLEX_ENABLED` | Yes | Set to `true` to enable PersonaPlex voice |
| `RUNPOD_API_KEY` | Yes | RunPod API key for GPU provisioning |
| `RUNPOD_ENDPOINT_ID` | Yes | RunPod serverless endpoint ID |
| `ANTHROPIC_API_KEY` | Yes | Already set — used for blueprint extraction |

## RunPod Setup

1. Create a RunPod account at runpod.io
2. Create a serverless endpoint with the PersonaPlex Docker template
3. Select A10G GPU tier (24GB VRAM)
4. Copy the endpoint ID and API key to env vars

## Testing

1. Set `PERSONAPLEX_ENABLED=true` on Railway
2. Join a planning session voice call
3. Verify full-duplex conversation works
4. Check blueprint extraction still populates

## Fallback

If PersonaPlex fails (GPU unavailable, connection error), the agent automatically falls back to the standard Deepgram + Claude + Cartesia stack. No user intervention needed.
