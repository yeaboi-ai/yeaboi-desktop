"""PersonaPlex LiveKit Agent — full-duplex voice facilitator.

Bridges audio between LiveKit room and PersonaPlex inference server.
Captures transcript for background blueprint extraction via Claude.

Replaces the Deepgram+Claude+Cartesia pipeline when PERSONAPLEX_ENABLED=true.
"""

import asyncio
import logging
import os
from collections import deque

import httpx
import numpy as np
from livekit import rtc
from livekit.agents import AutoSubscribe, JobContext

from .moshi_client import SAMPLE_RATE, MoshiClient
from .opus_codec import FRAME_SIZE, OPUS_SAMPLE_RATE, OggDemuxer, OggMuxer, OpusDecoder, OpusEncoder
from .prompt_builder import build_text_prompt

logger = logging.getLogger("personaplex-agent")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET", "change-me-in-production")
HEADERS = {"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"}
PERSONAPLEX_WS_URL = os.getenv("PERSONAPLEX_WS_URL", "")


async def run_personaplex_agent(ctx: JobContext) -> None:
    """Entry point for the PersonaPlex voice agent."""
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    room_name = ctx.room.name or ""
    session_id = room_name.replace("session-", "") if room_name.startswith("session-") else room_name
    logger.info("PersonaPlex agent joining session %s", session_id)

    ai_config, blueprint, initial_idea = await _load_session_context(session_id)

    ws_url = PERSONAPLEX_WS_URL
    if not ws_url:
        raise RuntimeError("PERSONAPLEX_WS_URL not configured")

    # Wait for participant first
    participant = await ctx.wait_for_participant()
    logger.info("Participant joined: %s", participant.identity)

    # Build persona prompt
    text_prompt = build_text_prompt(ai_config, blueprint, initial_idea)
    if len(text_prompt) > 500:
        text_prompt = text_prompt[:500]

    # Connect with retry
    moshi = MoshiClient(ws_url, text_prompt=text_prompt)
    for attempt in range(3):
        logger.info("Connecting to PersonaPlex (attempt %s/3)", attempt + 1)
        try:
            await moshi.connect()
            await asyncio.sleep(1)
            if moshi.is_connected:
                logger.info("PersonaPlex connection stable")
                break
            logger.warning("Connection dropped (attempt %s)", attempt + 1)
        except Exception as e:
            logger.warning("Connect failed (attempt %s): %s", attempt + 1, e)
        if attempt < 2:
            await asyncio.sleep(5)

    if not moshi.is_connected:
        raise RuntimeError("Failed to connect to PersonaPlex after 3 attempts")

    # Conversation tracking
    conversation_buffer: deque[dict] = deque(maxlen=30)
    extraction_counter = 0

    # Publish audio track to LiveKit
    audio_source = rtc.AudioSource(SAMPLE_RATE, 1)
    track = rtc.LocalAudioTrack.create_audio_track("personaplex-voice", audio_source)
    options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    await ctx.room.local_participant.publish_track(track, options)

    # Single shared encoder/muxer for all outgoing audio
    shared_encoder = OpusEncoder(OPUS_SAMPLE_RATE)
    shared_muxer = OggMuxer(OPUS_SAMPLE_RATE)

    tasks = [
        asyncio.create_task(_send_audio_to_personaplex(ctx.room, moshi, shared_encoder, shared_muxer)),
        asyncio.create_task(_forward_personaplex_audio(moshi, audio_source)),
        asyncio.create_task(_capture_transcript(moshi, session_id, conversation_buffer, extraction_counter)),
    ]

    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
    finally:
        await moshi.disconnect()
        logger.info("PersonaPlex agent shut down")


async def _send_audio_to_personaplex(
    room: rtc.Room,
    moshi: MoshiClient,
    encoder: OpusEncoder,
    muxer: OggMuxer,
) -> None:
    """Send audio to PersonaPlex — silence until mic audio arrives, then real audio.

    Uses a single encoder/muxer to maintain one continuous Ogg stream.
    """
    audio_stream = None

    # Check for already-published tracks
    for p in room.remote_participants.values():
        for pub in p.track_publications.values():
            if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                audio_stream = rtc.AudioStream(pub.track, sample_rate=SAMPLE_RATE, num_channels=1)
                logger.info("Found existing audio track from %s", p.identity)
                break
        if audio_stream:
            break

    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication, participant):
        nonlocal audio_stream
        if audio_stream is None and track.kind == rtc.TrackKind.KIND_AUDIO:
            audio_stream = rtc.AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=1)
            logger.info("Subscribed to audio track from %s", participant.identity)

    # Send Ogg headers first (one time, before any audio)
    silence = np.zeros(FRAME_SIZE, dtype=np.float32)
    header_opus = encoder.encode(silence)
    header_ogg = muxer.mux(header_opus)  # This sends OpusHead + OpusTags + first audio page
    await moshi.send_audio(header_ogg)
    logger.info("Sent Ogg headers + first silence frame (%s bytes)", len(header_ogg))

    # Continue sending silence until audio stream is available
    while audio_stream is None and moshi.is_connected:
        try:
            raw_opus = encoder.encode(silence)
            ogg_data = muxer.mux(raw_opus)
            await moshi.send_audio(ogg_data)
        except Exception as e:
            logger.warning("Silence send error: %s", e)
        await asyncio.sleep(0.02)  # 20ms per frame

    if not moshi.is_connected:
        return

    logger.info("Switching to real audio forwarding")
    pcm_buffer = np.array([], dtype=np.float32)

    async for frame in audio_stream:
        if not moshi.is_connected:
            break
        try:
            audio_frame = getattr(frame, "frame", frame)
            pcm_bytes = audio_frame.data.tobytes()
            pcm_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
            pcm_float = pcm_int16.astype(np.float32) / 32768.0

            # Resample 24kHz → 48kHz
            pcm_48k = np.interp(
                np.linspace(0, len(pcm_float), len(pcm_float) * 2, endpoint=False),
                np.arange(len(pcm_float)),
                pcm_float,
            ).astype(np.float32)

            pcm_buffer = np.concatenate([pcm_buffer, pcm_48k])
            while len(pcm_buffer) >= FRAME_SIZE:
                chunk = pcm_buffer[:FRAME_SIZE]
                pcm_buffer = pcm_buffer[FRAME_SIZE:]
                raw_opus = encoder.encode(chunk)
                ogg_data = muxer.mux(raw_opus)
                await moshi.send_audio(ogg_data)
        except Exception as e:
            logger.warning("Audio encode error: %s", e)


async def _forward_personaplex_audio(moshi: MoshiClient, audio_source: rtc.AudioSource) -> None:
    """Forward PersonaPlex Opus audio to LiveKit room (decoded to PCM)."""
    decoder = OpusDecoder(OPUS_SAMPLE_RATE)
    demuxer = OggDemuxer()
    decode_count = 0

    while moshi.is_connected:
        ogg_data = await moshi.receive_audio()
        if ogg_data:
            try:
                if decode_count < 10:
                    logger.info("Recv audio #%s: len=%s, head=%s", decode_count, len(ogg_data), ogg_data[:8].hex())
                    decode_count += 1

                # Demux Ogg into raw Opus packets
                opus_packets = demuxer.demux(ogg_data)
                if decode_count <= 11:
                    logger.info("  Demuxed %s packets", len(opus_packets))
                for pkt in opus_packets:
                    if len(pkt) < 2:
                        continue
                    pcm_48k = decoder.decode(pkt)
                    if len(pcm_48k) > 0:
                        # Downsample 48kHz → 24kHz for LiveKit
                        pcm_float = pcm_48k[::2]  # Simple decimation (48k→24k = keep every 2nd sample)
                        pcm_int16 = (pcm_float * 32768.0).clip(-32768, 32767).astype(np.int16)
                        pcm_bytes = pcm_int16.tobytes()
                        if len(pcm_bytes) >= 2:
                            frame = rtc.AudioFrame(
                                data=pcm_bytes,
                                sample_rate=SAMPLE_RATE,
                                num_channels=1,
                                samples_per_channel=len(pcm_int16),
                            )
                            await audio_source.capture_frame(frame)
            except Exception as e:
                logger.warning("Audio decode error: %s", e)


async def _capture_transcript(
    moshi: MoshiClient,
    session_id: str,
    conversation_buffer: deque,
    extraction_counter: int,
) -> None:
    """Capture PersonaPlex text output and post to backend."""
    while moshi.is_connected:
        text = await moshi.receive_text()
        if text:
            msg = {"content": text, "message_type": "ai", "session_id": session_id}
            conversation_buffer.append(msg)
            extraction_counter += 1

            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    await client.post(f"{BACKEND_URL}/api/internal/messages", headers=HEADERS, json=msg)
                except Exception as e:
                    logger.warning("Failed to post transcript: %s", e)

            if extraction_counter % 2 == 0:
                asyncio.create_task(_extract_blueprint(session_id, conversation_buffer))

        await asyncio.sleep(0.05)


async def _extract_blueprint(session_id: str, conversation_buffer: deque) -> None:
    """Run Claude Haiku blueprint extraction on recent conversation."""
    import json

    # Need at least one provider key to bother making the call. The wrapper
    # below handles failover between providers; this check just avoids
    # waking up the AIClient builder when nothing is configured at all.
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("OPENAI_API_KEY")):
        return

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint",
                headers=HEADERS,
            )
            blueprint = resp.json() if resp.status_code == 200 else {}
        except Exception:
            blueprint = {}

    recent = list(conversation_buffer)[-15:]
    transcript = "\n".join(f"[{m.get('message_type', 'unknown')}]: {m['content']}" for m in recent)

    try:
        from app.services.ai_provider import get_ai_client_for_role

        ai_client = await get_ai_client_for_role(org_id=None, db=None, role="agent_extract")
        text = await ai_client.chat(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Extract blueprint updates from this planning conversation.\n"
                        f"Current blueprint: {blueprint}\n\n"
                        f"Recent conversation:\n{transcript}\n\n"
                        f'Return a JSON array: [{{"section": "key", "content": "new content"}}]\n'
                        f"Only include sections with NEW information."
                    ),
                }
            ],
            max_tokens=1024,
        )
        if "[" in text:
            updates = json.loads(text[text.index("[") : text.rindex("]") + 1])
            async with httpx.AsyncClient(timeout=10) as client:
                for update in updates:
                    if "section" in update and "content" in update:
                        await client.patch(
                            f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint",
                            headers=HEADERS,
                            json=update,
                        )
    except Exception as e:
        logger.warning("Blueprint extraction failed: %s", e)


async def _load_session_context(session_id: str) -> tuple[dict, dict, str | None]:
    """Load ai_config, blueprint, and initial idea from backend."""
    ai_config, blueprint, initial_idea = {}, {}, None

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{BACKEND_URL}/api/internal/sessions/{session_id}/ai-config", headers=HEADERS)
            if resp.status_code == 200:
                ai_config = resp.json()
        except Exception as e:
            logger.warning("Failed to load ai_config: %s", e)

        try:
            resp = await client.get(f"{BACKEND_URL}/api/internal/sessions/{session_id}/blueprint", headers=HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                blueprint = data.get("content", {})
                initial_idea = data.get("initial_idea")
        except Exception as e:
            logger.warning("Failed to load blueprint: %s", e)

    return ai_config, blueprint, initial_idea
