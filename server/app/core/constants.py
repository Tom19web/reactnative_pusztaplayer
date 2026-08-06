"""Shared constants for PusztaPlayer backend."""
# Cache TTLs (seconds)
CACHE_TTL_EPG = 21600        # 6 hours
CACHE_TTL_LIVE = 1800        # 30 min
CACHE_TTL_VOD = 3600         # 60 min
CACHE_TTL_AI = 86400         # 24 hours
CACHE_TTL_ADMIN = 300        # 5 min
CACHE_TTL_ADMIN_XMLTV = 86400  # 24 hours — XMLTV names cache
CACHE_TTL_ICY = 30           # 30 sec (success)
CACHE_TTL_ICY_EMPTY = 10     # 10 sec (empty)
CACHE_TTL_IMPORT = 86400     # 24 hours — EPG import marker

# Session
SESSION_TTL = 604800         # 7 days

# ICY meta check TTL
ICY_CHECK_TTL = 604800       # 7 days

# File paths (within container)
TMP_AI_CHANNEL_MAP = "/tmp/ai_channel_map.json"
TMP_CHANNEL_MATCH = "/tmp/channel_match_cache.json"
TMP_XMLTV_CACHE = "/tmp/xmltv_full.xml"

# EPG match threshold
MATCH_THRESHOLD = 0.6
