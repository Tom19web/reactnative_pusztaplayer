"""ICY / Shoutcast metadata parser.

Connects to a radio stream URL via TCP, reads the ICY header to find
the metadata interval, then reads the stream until a metadata block
with StreamTitle is found. Follows HTTP redirects up to 3 hops.

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

CONNECT_TIMEOUT = 10.0  # seconds for TCP/TLS connection
READ_TIMEOUT = 8.0      # seconds for data reads
MAX_REDIRECTS = 3

ICY_HEADER_RE = re.compile(rb"Icy-MetaData\s*:\s*(\d+)", re.IGNORECASE)
STREAM_TITLE_RE = re.compile(rb"StreamTitle='([^']*)'")
HTTP_STATUS_RE = re.compile(rb"HTTP/\d\.\d\s+(\d+)")
LOCATION_RE = re.compile(rb"Location\s*:\s*(.+)", re.IGNORECASE)


def _open_socket(host: str, port: int, use_tls: bool = False) -> socket.socket:
    """Open a raw TCP socket, optionally with TLS."""
    sock = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
    if use_tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        sock = ctx.wrap_socket(sock, server_hostname=host)
    sock.settimeout(READ_TIMEOUT)
    return sock


def _read_header(sock: socket.socket) -> bytes:
    """Read HTTP/ICY response header in chunks until \\r\\n\\r\\n."""
    data = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
        if b"\r\n\r\n" in data:
            break
        if len(data) > 8192:
            break
    return data


def _parse_redirect(header_data: bytes) -> tuple[int, str | None, str | None]:
    """Parse HTTP status code and optional Location header for redirects."""
    status_match = HTTP_STATUS_RE.search(header_data)
    status = int(status_match.group(1)) if status_match else 0
    loc_match = LOCATION_RE.search(header_data)
    location = loc_match.group(1).decode("utf-8", errors="replace").strip() if loc_match else None
    return status, location


async def fetch_icy_metadata(stream_url: str) -> dict:
    """Fetch current song title from an ICY/Shoutcast stream.

    Returns {'title': '...'} on success, {'title': ''} on failure.
    """
    redirects_remaining = MAX_REDIRECTS
    current_url = stream_url

    while redirects_remaining >= 0:
        try:
            url = urlparse(current_url)
            host = url.hostname or ""
            port = url.port or (443 if url.scheme == "https" else 80)
            use_tls = url.scheme == "https"

            if not host:
                return {"title": ""}

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

                header_data = _read_header(sock)
                meta_interval = 0

                # Check HTTP status
                status, location = _parse_redirect(header_data)

                if status >= 400:
                    logger.debug("ICY: HTTP %d for %s", status, current_url)
                    return {"title": ""}

                # Follow redirect
                if status in (301, 302, 303, 307, 308) and location and redirects_remaining > 0:
                    logger.debug("ICY: redirect %d -> %s", status, location)
                    current_url = location
                    redirects_remaining -= 1
                    continue

                # Parse metadata interval
                match = ICY_HEADER_RE.search(header_data)
                if match:
                    meta_interval = int(match.group(1))
                    logger.debug("ICY metadata interval: %d bytes", meta_interval)

                if meta_interval <= 0:
                    return {"title": ""}

                # Read stream until we hit a metadata block
                stream_bytes = 0
                while stream_bytes < meta_interval * 3:
                    remaining = meta_interval - (stream_bytes % meta_interval)
                    chunk = sock.recv(min(remaining, 4096))
                    if not chunk:
                        break
                    stream_bytes += len(chunk)

                    if stream_bytes % meta_interval == 0:
                        try:
                            length_byte = sock.recv(1)
                            if not length_byte:
                                continue
                            meta_len = length_byte[0] * 16
                            if meta_len <= 0:
                                continue

                            meta_data = b""
                            while len(meta_data) < meta_len:
                                bchunk = sock.recv(meta_len - len(meta_data))
                                if not bchunk:
                                    break
                                meta_data += bchunk

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
            logger.debug("ICY metadata fetch failed for %s: %s", current_url, e)
            return {"title": ""}

    return {"title": ""}
