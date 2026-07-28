"""ICY / Shoutcast metadata parser.

Connects to a radio stream URL via TCP, reads the ICY header to find
the metadata interval, then reads the stream until a metadata block
with StreamTitle is found.

Returns the current song title or empty string on failure/timeout.
"""
import asyncio
import logging
import re
import socket
import ssl
import struct
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

ICY_TIMEOUT = 5.0  # seconds
ICY_HEADER_RE = re.compile(rb"Icy-MetaData\s*:\s*(\d+)", re.IGNORECASE)
STREAM_TITLE_RE = re.compile(rb"StreamTitle='([^']*)'")


def _open_socket(host: str, port: int, use_tls: bool = False) -> socket.socket:
    """Open a raw TCP socket, optionally with TLS."""
    sock = socket.create_connection((host, port), timeout=ICY_TIMEOUT)
    if use_tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        sock = ctx.wrap_socket(sock, server_hostname=host)
    sock.settimeout(ICY_TIMEOUT)
    return sock


async def fetch_icy_metadata(stream_url: str) -> dict:
    """Fetch current song title from an ICY/Shoutcast stream.

    Returns {'title': '...'} on success, {'title': ''} on failure.
    """
    try:
        url = urlparse(stream_url)
        host = url.hostname or ""
        port = url.port or (443 if url.scheme == "https" else 80)
        use_tls = url.scheme == "https"

        if not host:
            return {"title": ""}

        # Open TCP socket + send HTTP GET
        sock = _open_socket(host, port, use_tls)
        try:
            request = (
                f"GET {url.path or '/'}"
                f"{'?' + url.query if url.query else ''} HTTP/1.0\r\n"
                f"Host: {host}\r\n"
                f"Icy-MetaData: 1\r\n"
                f"User-Agent: PusztaPlayer/1.0\r\n"
                f"Connection: close\r\n"
                f"\r\n"
            ).encode("iso-8859-1")
            sock.sendall(request)

            # Read ICY response header
            header_data = b""
            meta_interval = 0
            while True:
                chunk = sock.recv(1)
                if not chunk:
                    break
                header_data += chunk
                if header_data.endswith(b"\r\n\r\n"):
                    break
                if len(header_data) > 4096:
                    break

            # Parse metadata interval
            match = ICY_HEADER_RE.search(header_data)
            if match:
                meta_interval = int(match.group(1))
                logger.debug("ICY metadata interval: %d bytes", meta_interval)

            if meta_interval <= 0:
                return {"title": ""}

            # Read stream until we hit a metadata block
            stream_bytes = 0
            while stream_bytes < meta_interval * 3:  # read up to 3 metadata blocks
                remaining = meta_interval - (stream_bytes % meta_interval)
                chunk = sock.recv(min(remaining, 4096))
                if not chunk:
                    break
                stream_bytes += len(chunk)

                # After every meta_interval bytes, there's a metadata block
                if stream_bytes % meta_interval == 0:
                    # Read metadata length byte
                    try:
                        length_byte = sock.recv(1)
                        if not length_byte:
                            continue
                        meta_len = length_byte[0] * 16
                        if meta_len <= 0:
                            continue

                        meta_data = b""
                        while len(meta_data) < meta_len:
                            chunk = sock.recv(meta_len - len(meta_data))
                            if not chunk:
                                break
                            meta_data += chunk

                        # Search for StreamTitle
                        title_match = STREAM_TITLE_RE.search(meta_data)
                        if title_match:
                            title = title_match.group(1).decode("utf-8", errors="replace").strip()
                            if title:
                                return {"title": title}
                    except (socket.timeout, OSError):
                        continue

            return {"title": ""}
        finally:
            try:
                sock.close()
            except Exception:
                pass

    except (socket.timeout, OSError, ValueError, Exception) as e:
        logger.debug("ICY metadata fetch failed for %s: %s", stream_url, e)
        return {"title": ""}
