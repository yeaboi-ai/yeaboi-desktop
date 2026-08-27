"""Opus encoder/decoder with Ogg framing support.

Uses ctypes to call libopus directly (no pip package dependency).
Includes Ogg page parser/writer for PersonaPlex's Ogg/Opus streams.
Requires libopus.so (apt-get install libopus0).
"""

import ctypes
import ctypes.util
import logging
import os
import struct

import numpy as np

logger = logging.getLogger(__name__)

# Find and load libopus
_lib_path = ctypes.util.find_library("opus")
if _lib_path is None:
    for p in [
        "/usr/lib/x86_64-linux-gnu/libopus.so.0",
        "/usr/lib/libopus.so.0",
        "/usr/local/lib/libopus.so.0",
    ]:
        if os.path.exists(p):
            _lib_path = p
            break
    if _lib_path is None:
        import glob

        matches = glob.glob("/nix/store/*/lib/libopus.so*")
        if matches:
            _lib_path = matches[0]

if _lib_path is None:
    raise ImportError("libopus not found")

_opus = ctypes.cdll.LoadLibrary(_lib_path)
logger.info("Loaded libopus from %s", _lib_path)

# Constants
APPLICATION_VOIP = 2048
OPUS_SAMPLE_RATE = 48000  # Opus always operates at 48kHz
SAMPLE_RATE = 24000  # PersonaPlex model native rate
CHANNELS = 1
FRAME_SIZE = 960  # 20ms at 48kHz (Opus standard)

# opus_encoder_get_size
_opus.opus_encoder_get_size.argtypes = [ctypes.c_int]
_opus.opus_encoder_get_size.restype = ctypes.c_int
_opus.opus_encoder_init.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
_opus.opus_encoder_init.restype = ctypes.c_int
_opus.opus_encode_float.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_float),
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_ubyte),
    ctypes.c_int,
]
_opus.opus_encode_float.restype = ctypes.c_int
_opus.opus_decoder_get_size.argtypes = [ctypes.c_int]
_opus.opus_decoder_get_size.restype = ctypes.c_int
_opus.opus_decoder_init.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
_opus.opus_decoder_init.restype = ctypes.c_int
_opus.opus_decode_float.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_ubyte),
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_float),
    ctypes.c_int,
    ctypes.c_int,
]
_opus.opus_decode_float.restype = ctypes.c_int


class OpusEncoder:
    def __init__(self, sample_rate=OPUS_SAMPLE_RATE, channels=CHANNELS):
        size = _opus.opus_encoder_get_size(channels)
        self._state = ctypes.create_string_buffer(size)
        err = _opus.opus_encoder_init(self._state, sample_rate, channels, APPLICATION_VOIP)
        if err < 0:
            raise RuntimeError(f"opus_encoder_init failed: {err}")
        self.channels = channels
        self.sample_rate = sample_rate

    def encode(self, pcm_float: np.ndarray) -> bytes:
        """Encode float32 PCM to raw Opus packet."""
        frame_size = len(pcm_float) // self.channels
        pcm_ptr = pcm_float.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        out_buf = (ctypes.c_ubyte * 4000)()
        n = _opus.opus_encode_float(self._state, pcm_ptr, frame_size, out_buf, 4000)
        if n < 0:
            raise RuntimeError(f"opus_encode_float failed: {n}")
        return bytes(out_buf[:n])


class OpusDecoder:
    def __init__(self, sample_rate=OPUS_SAMPLE_RATE, channels=CHANNELS):
        size = _opus.opus_decoder_get_size(channels)
        self._state = ctypes.create_string_buffer(size)
        err = _opus.opus_decoder_init(self._state, sample_rate, channels)
        if err < 0:
            raise RuntimeError(f"opus_decoder_init failed: {err}")
        self.channels = channels
        self.sample_rate = sample_rate

    def decode(self, opus_data: bytes, frame_size=5760) -> np.ndarray:
        """Decode raw Opus packet to float32 PCM."""
        data_ptr = (ctypes.c_ubyte * len(opus_data))(*opus_data)
        out_buf = (ctypes.c_float * (frame_size * self.channels))()
        n = _opus.opus_decode_float(self._state, data_ptr, len(opus_data), out_buf, frame_size, 0)
        if n < 0:
            raise RuntimeError(f"opus_decode_float failed: {n}")
        return np.frombuffer(out_buf, dtype=np.float32, count=n * self.channels)


class OggDemuxer:
    """Parse Ogg pages and extract raw Opus packets.

    Ogg page format:
    - 4 bytes: "OggS" capture pattern
    - 1 byte: version (0)
    - 1 byte: header type
    - 8 bytes: granule position
    - 4 bytes: serial number
    - 4 bytes: page sequence number
    - 4 bytes: CRC checksum
    - 1 byte: number of segments
    - N bytes: segment table
    - variable: segment data (the actual Opus packets)
    """

    def __init__(self):
        self._buffer = bytearray()
        self._header_parsed = False

    def demux(self, data: bytes) -> list[bytes]:
        """Feed Ogg data, return list of extracted Opus packets."""
        self._buffer.extend(data)
        packets = []

        while True:
            # Find OggS sync
            idx = self._buffer.find(b"OggS")
            if idx == -1:
                # No Ogg header found — might be raw Opus
                if len(self._buffer) > 0 and not self._buffer.startswith(b"OggS"):
                    # Not Ogg-framed, return as raw packet
                    raw = bytes(self._buffer)
                    self._buffer.clear()
                    if len(raw) > 0:
                        packets.append(raw)
                break

            if idx > 0:
                self._buffer = self._buffer[idx:]

            # Need at least 27 bytes for the fixed header
            if len(self._buffer) < 27:
                break

            # Parse header
            n_segments = self._buffer[26]
            header_size = 27 + n_segments

            if len(self._buffer) < header_size:
                break

            # Calculate total segment data size
            segment_table = self._buffer[27:header_size]
            data_size = sum(segment_table)
            page_size = header_size + data_size

            if len(self._buffer) < page_size:
                break

            # Extract segment data
            segment_data = bytes(self._buffer[header_size:page_size])
            self._buffer = self._buffer[page_size:]

            # Skip Ogg header pages (OpusHead, OpusTags)
            if segment_data.startswith(b"OpusHead") or segment_data.startswith(b"OpusTags"):
                self._header_parsed = True
                continue

            # Split segment data into Opus packets using segment table
            # Segments of 255 bytes are continuations; shorter segments end a packet
            offset = 0
            current_packet = bytearray()
            for seg_len in segment_table:
                current_packet.extend(segment_data[offset : offset + seg_len])
                offset += seg_len
                if seg_len < 255:
                    # End of packet
                    if len(current_packet) > 0:
                        packets.append(bytes(current_packet))
                    current_packet = bytearray()

            # If last segment was 255, packet continues in next page
            if len(current_packet) > 0:
                packets.append(bytes(current_packet))

        return packets


class OggMuxer:
    """Wrap raw Opus packets in Ogg pages for PersonaPlex.

    Creates a valid Ogg/Opus stream with OpusHead + OpusTags headers.
    Uses proper CRC-32 checksums.
    """

    def __init__(self, sample_rate=OPUS_SAMPLE_RATE, channels=CHANNELS):
        self._serial = 1
        self._page_seq = 0
        self._granule = 0
        self._sample_rate = sample_rate
        self._channels = channels
        self._header_sent = False

    def mux(self, opus_packet: bytes) -> bytes:
        """Wrap a raw Opus packet in Ogg pages. Returns Ogg bytes."""
        result = bytearray()

        if not self._header_sent:
            result.extend(self._make_header_pages())
            self._header_sent = True

        self._granule += FRAME_SIZE
        result.extend(self._make_page(opus_packet, self._granule))
        return bytes(result)

    def _make_header_pages(self) -> bytes:
        """Create OpusHead + OpusTags header pages."""
        result = bytearray()

        # OpusHead
        opus_head = bytearray()
        opus_head.extend(b"OpusHead")
        opus_head.append(1)  # version
        opus_head.append(self._channels)
        opus_head.extend(struct.pack("<H", 312))  # pre-skip (standard)
        opus_head.extend(struct.pack("<I", self._sample_rate))
        opus_head.extend(struct.pack("<h", 0))  # output gain
        opus_head.append(0)  # channel mapping family
        result.extend(self._make_page(bytes(opus_head), 0, header_type=2))  # BOS

        # OpusTags
        opus_tags = bytearray()
        opus_tags.extend(b"OpusTags")
        vendor = b"personaplex-agent"
        opus_tags.extend(struct.pack("<I", len(vendor)))
        opus_tags.extend(vendor)
        opus_tags.extend(struct.pack("<I", 0))  # no user comments
        result.extend(self._make_page(bytes(opus_tags), 0))

        return bytes(result)

    def _make_page(self, data: bytes, granule: int, header_type: int = 0) -> bytes:
        """Create a single Ogg page with valid CRC-32."""
        segments = []
        remaining = len(data)
        while remaining >= 255:
            segments.append(255)
            remaining -= 255
        segments.append(remaining)

        page = bytearray()
        page.extend(b"OggS")
        page.append(0)  # version
        page.append(header_type)
        page.extend(struct.pack("<q", granule))
        page.extend(struct.pack("<I", self._serial))
        page.extend(struct.pack("<I", self._page_seq))
        page.extend(struct.pack("<I", 0))  # CRC placeholder
        page.append(len(segments))
        page.extend(bytes(segments))
        page.extend(data)

        # Calculate CRC-32 (Ogg uses a specific polynomial)
        crc = _ogg_crc32(bytes(page))
        page[22:26] = struct.pack("<I", crc)

        self._page_seq += 1
        return bytes(page)


def _ogg_crc32(data: bytes) -> int:
    """Ogg CRC-32 using polynomial 0x04C11DB7."""
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            if crc & 0x80000000:
                crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF
            else:
                crc = (crc << 1) & 0xFFFFFFFF
    return crc
