import re
from typing import Any

# Country prefixes to strip (same as RN client cleanChannelTitle)
_COUNTRY_CODES = (
    "HU|RO|DE|FR|IT|ES|CA|UK|CZ|SK|PL|NL|BG|RS|GR|AT|HR|SI|TR|swiss"
)
_RE_PREFIX = re.compile(
    rf"^\|?(?:{_COUNTRY_CODES})\|?[:\|\s\-]+", re.IGNORECASE
)
_RE_SUFFIX = re.compile(
    rf"[:\|\s\-]*\|?(?:{_COUNTRY_CODES})\|?[:\|\s\-]*$", re.IGNORECASE
)

_QUALITY_SUFFIX_RE = re.compile(
    r"\s+(FHD|HD|SD|4K|UHD|HDR|HEVC|2160P|1080P|720P)\s*$", re.IGNORECASE
)


def clean_channel_title(raw: str) -> str:
    t = _RE_PREFIX.sub("", raw)
    t = _RE_SUFFIX.sub("", t)
    return t.strip() or raw


def base_title(title: str) -> str:
    """Strip quality suffix for deduplication."""
    return _QUALITY_SUFFIX_RE.sub("", title).strip()


def quality_label(title: str) -> str:
    upper = title.upper()
    for kw, label in [("4K", "4K"), ("UHD", "4K"), ("2160P", "4K"),
                       ("FHD", "FHD"), ("HD", "HD"), ("1080P", "HD"), ("720P", "HD")]:
        if kw in upper:
            return label
    if "SD" in upper:
        return "SD"
    return ""


def merge_and_sort(channels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge quality variants (4K/FHD/HD/SD) into single entries with `quality_variants` array."""
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    order: list[tuple[str, str]] = []

    for ch in channels:
        raw_title = ch.get("title", "")
        if not raw_title:
            continue
        group_name = ch.get("group", "Egyéb")
        if group_name.lower() == "hungarian radio":
            continue
        key = (base_title(raw_title), group_name)
        if key not in groups:
            order.append(key)
            groups[key] = []
        groups[key].append(ch)

    result: list[dict[str, Any]] = []
    for key in order:
        items = groups[key]
        items.sort(key=lambda c: c.get("stream_id", 0), reverse=True)
        best = {**items[0]}
        variants = [
            {
                "label": quality_label(c.get("title", "")),
                "stream_id": c.get("stream_id", 0),
                "stream_url": c.get("stream_url", ""),
                "key": c.get("key", ""),
            }
            for c in items
        ]
        quality_order = {"4K": 0, "FHD": 1, "HD": 2, "SD": 3}
        variants.sort(key=lambda v: quality_order.get(v["label"], 99))
        best["quality_variants"] = variants
        result.append(best)
    return result
