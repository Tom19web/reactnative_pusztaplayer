"""Channel name normalization + matching for XMLTV EPG."""
import re
import unicodedata


def normalize(name: str) -> str:
    """Normalize a channel name for fuzzy comparison."""
    n = name.lower().strip()
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    n = re.sub(r"[^a-z0-9]+", "", n)
    return n


def match_best(
    xmltv_display_names: list[str],
    channel_name: str,
    threshold: float = 0.4,
) -> tuple[str, float] | None:
    """Find the best XMLTV display name matching a channel name.
    Returns (xmltv_name, score) or None if below threshold.
    """
    if not xmltv_display_names or not channel_name:
        return None

    norm_ch = normalize(channel_name)
    if not norm_ch:
        return None

    best_name = ""
    best_score = 0.0

    for display in xmltv_display_names:
        norm_d = normalize(display)
        if not norm_d:
            continue

        # Exact match
        if norm_ch == norm_d:
            return (display, 1.0)

        # Contains either way
        if norm_ch in norm_d or norm_d in norm_ch:
            score = min(len(norm_ch), len(norm_d)) / max(len(norm_ch), len(norm_d))
            if score > best_score:
                best_score = score
                best_name = display
            continue

        # Fuzzy: character bigram overlap
        bigrams_ch = {norm_ch[i : i + 2] for i in range(len(norm_ch) - 1)}
        bigrams_d = {norm_d[i : i + 2] for i in range(len(norm_d) - 1)}
        if not bigrams_ch or not bigrams_d:
            continue
        overlap = len(bigrams_ch & bigrams_d)
        total = len(bigrams_ch | bigrams_d)
        score = overlap / total if total > 0 else 0
        if score > best_score:
            best_score = score
            best_name = display

    if best_score >= threshold:
        return (best_name, best_score)
    return None
