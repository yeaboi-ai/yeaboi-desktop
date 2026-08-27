"""Moshi protocol WebSocket client for PersonaPlex.

Protocol:
  0x00 = handshake (server→client)
  0x01 = Opus audio data (bidirectional)
  0x02 = text token (server→client, UTF-8)
  0x03 = error (server→client)
  0x04 = keepalive ping
"""

import asyncio
import logging

import websockets

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000

# Message type prefixes
MSG_HANDSHAKE = 0x00
MSG_AUDIO = 0x01
MSG_TEXT = 0x02
MSG_ERROR = 0x03
MSG_KEEPALIVE = 0x04


class MoshiClient:
    """WebSocket client for PersonaPlex's Moshi protocol."""

    def __init__(self, ws_url: str, text_prompt: str = ""):
        self.ws_url = ws_url
        self.text_prompt = text_prompt
        self._ws = None
        self._connected = False
        self._text_buffer: list[str] = []
        self._audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=100)
        self._text_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=50)
        self._recv_task: asyncio.Task | None = None

    async def connect(self) -> None:
        """Open WebSocket connection to PersonaPlex server."""
        try:
            import urllib.parse

            url = self.ws_url
            if self.text_prompt:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}text_prompt={urllib.parse.quote(self.text_prompt)}"
            self._ws = await websockets.connect(
                url,
                max_size=2**20,
                ping_interval=20,
                ping_timeout=10,
                open_timeout=120,
                close_timeout=10,
            )
            self._connected = True
            self._recv_task = asyncio.create_task(self._receive_loop())
            logger.info("Connected to PersonaPlex at %s", self.ws_url)
        except Exception as e:
            logger.error("Failed to connect to PersonaPlex: %s", e)
            raise

    async def disconnect(self) -> None:
        """Close the WebSocket connection."""
        self._connected = False
        if self._recv_task:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()
            logger.info("Disconnected from PersonaPlex")

    async def send_audio(self, opus_data: bytes) -> None:
        """Send Opus-encoded audio to PersonaPlex.

        Args:
            opus_data: Opus-encoded audio bytes (will be prefixed with 0x01)
        """
        if not self._connected or not self._ws:
            return
        try:
            await self._ws.send(bytes([MSG_AUDIO]) + opus_data)
        except Exception as e:
            logger.warning("Failed to send audio: %s", e)
            self._connected = False

    async def receive_audio(self) -> bytes | None:
        """Get next Opus audio frame from PersonaPlex output.

        Returns:
            Opus-encoded audio bytes (without prefix) or None.
        """
        try:
            return await asyncio.wait_for(self._audio_queue.get(), timeout=0.1)
        except TimeoutError:
            return None

    async def receive_text(self) -> str | None:
        """Get next complete text utterance from PersonaPlex."""
        try:
            return self._text_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def _receive_loop(self) -> None:
        """Background task: read WebSocket messages, route by type prefix."""
        try:
            async for message in self._ws:
                if not isinstance(message, bytes) or len(message) < 1:
                    continue

                msg_type = message[0]
                payload = message[1:]

                if msg_type == MSG_AUDIO:
                    # Opus audio from PersonaPlex
                    try:
                        self._audio_queue.put_nowait(payload)
                    except asyncio.QueueFull:
                        try:
                            self._audio_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                        self._audio_queue.put_nowait(payload)

                elif msg_type == MSG_TEXT:
                    # Text token
                    text = payload.decode("utf-8", errors="ignore").strip()
                    if text:
                        self._handle_text_token(text)

                elif msg_type == MSG_HANDSHAKE:
                    logger.info("PersonaPlex handshake received")

                elif msg_type == MSG_ERROR:
                    error = payload.decode("utf-8", errors="ignore")
                    logger.error("PersonaPlex error: %s", error)

                elif msg_type == MSG_KEEPALIVE:
                    pass  # Heartbeat

        except websockets.ConnectionClosed:
            logger.info("PersonaPlex WebSocket closed")
        except Exception as e:
            logger.error("PersonaPlex receive error: %s", e)
        finally:
            self._connected = False

    def _handle_text_token(self, text: str) -> None:
        """Buffer text tokens into complete utterances."""
        if text.endswith((".", "!", "?", "\n")) or len(self._text_buffer) > 20:
            self._text_buffer.append(text)
            full_text = " ".join(self._text_buffer).strip()
            self._text_buffer.clear()
            if full_text:
                try:
                    self._text_queue.put_nowait(full_text)
                except asyncio.QueueFull:
                    pass
        else:
            self._text_buffer.append(text)
