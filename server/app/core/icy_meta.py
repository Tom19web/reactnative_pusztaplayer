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

import httpx

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 10.0  # seconds for TCP/TLS connection
READ_TIMEOUT = 8.0      # seconds for data reads
MAX_REDIRECTS = 3

ICY_HEADER_RE = re.compile(rb"icy-metaint\s*:\s*(\d+)", re.IGNORECASE)
STREAM_TITLE_RE = re.compile(rb"StreamTitle='([^']*)'")
HTTP_STATUS_RE = re.compile(rb"HTTP/\d\.\d\s+(\d+)")
LOCATION_RE = re.compile(rb"Location\s*:\s*(.+)", re.IGNORECASE)


def _open_socket(host: str, port: int, use_tls: bool = False) -> socket.socket:
    """Open a raw TCP socket, optionally with TLS."""
    sock = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
    if use_tls:
        ctx = ssl.create_default_context()
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


SEVEN_HTML_RE = re.compile(rb"<td[^>]*>\s*<font[^>]*>(.*?)</font>", re.IGNORECASE | re.DOTALL)
BODY_CSV_RE = re.compile(rb"<body[^>]*>(.*?)</body>", re.IGNORECASE | re.DOTALL)
STATS_JSON_TITLE_RE = re.compile(r'"songtitle"\s*:\s*"([^"]*)"')


async def _fetch_web_metadata(stream_url: str) -> str:
    """Try Icecast status-json.xsl, then Shoutcast /7.html, then /stats?json=1."""
    try:
        url = urlparse(stream_url)
        host = url.hostname or ""
        port = url.port or 80
        scheme = url.scheme or "http"
        base = f"{scheme}://{host}:{port}"

        headers = {"User-Agent": "PusztaPlayer/1.0"}

        # 1. Icecast status-json.xsl
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{base}/status-json.xsl", headers=headers)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    src = data.get("icestats", {}).get("source", {})
                    if isinstance(src, list):
                        src = src[0] if src else {}
                    title = (src.get("title") or "").strip()
                    if title:
                        return title
                except Exception:
                    pass

            # 2. Shoutcast /7.html
            resp = await client.get(f"{base}/7.html", headers=headers)
            if resp.status_code == 200:
                text = resp.text
                match = SEVEN_HTML_RE.search(resp.content)
                if match:
                    title = match.group(1).decode("iso-8859-1", errors="replace").strip()
                    if title and title.lower() not in ("", "err"):
                        return title
                # Fallback: Shoutcast v1 classic CSV body format
                body_match = BODY_CSV_RE.search(resp.content)
                if body_match:
                    parts = body_match.group(1).strip().split(b",")
                    if len(parts) >= 7:
                        title = parts[6].decode("iso-8859-1", errors="replace").strip()
                        if title and title.lower() not in ("", "err"):
                            return title

            # 3. Shoutcast v2 /stats?json=1
            resp = await client.get(f"{base}/stats?json=1", headers=headers)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    title = data.get("songtitle", "")
                    if title:
                        return title.strip()
                except Exception:
                    pass
    except Exception:
        pass
    return ""


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

                # Check HTTP status
                status, location = _parse_redirect(header_data)

                if status >= 400:
                    return {"title": ""}

                # Follow redirect
                if status in (301, 302, 303, 307, 308) and location and redirects_remaining > 0:
                    current_url = location
                    redirects_remaining -= 1
                    continue

                # Parse metadata interval
                match = ICY_HEADER_RE.search(header_data)
                meta_interval = int(match.group(1)) if match else 0

                if meta_interval <= 0:
                    return {"title": ""}

                # Split header from audio: data after \r\n\r\n is already-streamed audio
                header_end = header_data.find(b"\r\n\r\n")
                if header_end == -1:
                    return {"title": ""}

                unread_buffer = header_data[header_end + 4:]

                # Read up to 3 blocks of audio + metadata
                blocks_checked = 0
                while blocks_checked < 3:
                    # 1. Consume exactly meta_interval bytes of audio
                    while len(unread_buffer) < meta_interval:
                        chunk = sock.recv(min(meta_interval - len(unread_buffer), 4096))
                        if not chunk:
                            return {"title": ""}
                        unread_buffer += chunk

                    unread_buffer = unread_buffer[meta_interval:]

                    # 2. Read 1-byte metadata length
                    while len(unread_buffer) < 1:
                        chunk = sock.recv(1)
                        if not chunk:
                            return {"title": ""}
                        unread_buffer += chunk

                    length_byte = unread_buffer[0]
                    unread_buffer = unread_buffer[1:]
                    meta_len = length_byte * 16
                    blocks_checked += 1

                    # 3. Read full metadata block if length is valid
                    if 0 < meta_len <= 16384:
                        while len(unread_buffer) < meta_len:
                            chunk = sock.recv(min(meta_len - len(unread_buffer), 4096))
                            if not chunk:
                                return {"title": ""}
                            unread_buffer += chunk

                        meta_data = unread_buffer[:meta_len]
                        unread_buffer = unread_buffer[meta_len:]

                        title_match = STREAM_TITLE_RE.search(meta_data)
                        if title_match:
                            title = title_match.group(1).decode("utf-8", errors="replace").strip()
                            if title:
                                return {"title": title}

                return {"title": ""}
            finally:
                try:
                    sock.close()
                except Exception:
                    pass

        except (socket.timeout, OSError, ValueError, Exception):
            return {"title": ""}

    return {"title": ""}


async def fetch_metadata_with_fallback(stream_url: str) -> dict:
    """Fetch metadata via ICY first, then Icecast/Shoutcast web fallback."""
    result = await fetch_icy_metadata(stream_url)
    if result.get("title", ""):
        return result
    icecast_title = await _fetch_web_metadata(stream_url)
    return {"title": icecast_title}


async def detect_icy_support(stream_url: str) -> bool:
    """Megbízható ICY meta-támogatás detektálás.

    True ha a szerver küld 'icy-metaint' fejlécet ÉS legalább egy meta
    blokkban 'StreamTitle=' minta szerepel (akár üres címmel is).
    False ha nincs fejléc, a blokkok raw MP3-ak (nginx stripping),
    vagy nem lehet csatlakozni.
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
                return False

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
                status, location = _parse_redirect(header_data)

                if status >= 400:
                    return False

                if status in (301, 302, 303, 307, 308) and location and redirects_remaining > 0:
                    current_url = location
                    redirects_remaining -= 1
                    continue

                meta_match = ICY_HEADER_RE.search(header_data)
                meta_interval = int(meta_match.group(1)) if meta_match else 0
                if meta_interval <= 0:
                    return False

                header_end = header_data.find(b"\r\n\r\n")
                if header_end == -1:
                    return False

                unread_buffer = header_data[header_end + 4:]

                # Max 3 blokk; elég EGY 'StreamTitle=' találat (akár üres cím is)
                blocks_checked = 0
                while blocks_checked < 3:
                    while len(unread_buffer) < meta_interval:
                        chunk = sock.recv(min(meta_interval - len(unread_buffer), 4096))
                        if not chunk:
                            return False
                        unread_buffer += chunk

                    unread_buffer = unread_buffer[meta_interval:]

                    while len(unread_buffer) < 1:
                        chunk = sock.recv(1)
                        if not chunk:
                            return False
                        unread_buffer += chunk

                    length_byte = unread_buffer[0]
                    unread_buffer = unread_buffer[1:]
                    meta_len = length_byte * 16
                    blocks_checked += 1

                    if 0 < meta_len <= 16384:
                        while len(unread_buffer) < meta_len:
                            chunk = sock.recv(min(meta_len - len(unread_buffer), 4096))
                            if not chunk:
                                return False
                            unread_buffer += chunk

                        meta_data = unread_buffer[:meta_len]
                        unread_buffer = unread_buffer[meta_len:]

                        if b"StreamTitle=" in meta_data:
                            return True

                return False
            finally:
                try:
                    sock.close()
                except Exception:
                    pass

        except (socket.timeout, OSError, ValueError, Exception):
            return False

    return False
