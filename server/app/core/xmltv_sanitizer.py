import re


def sanitize_channel_name(raw_name: str) -> str:
    """Remove junk tags from IPTV channel names."""
    name = raw_name
    name = re.sub(r"\|HU\|", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\(BACKUP\)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\b1080p\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\b720p\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\b60fps\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\bRAW\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\bFHD\b", "", name)
    name = re.sub(r"\bHD\b", "", name)
    name = re.sub(r"\bSD\b", "", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def extract_badge(raw_name: str) -> str:
    """Extract quality badge from raw channel name."""
    if re.search(r"\bFHD\b", raw_name):
        return "FHD"
    if re.search(r"\bHD\b", raw_name):
        return "HD"
    return "SD"


def generate_slug(display_name: str) -> str:
    """Generate a standard slug from display name."""
    slug = display_name.lower()
    slug = re.sub(r"[^a-z0-9]", "_", slug)
    slug = re.sub(r"_+", "_", slug)
    return slug.strip("_")
