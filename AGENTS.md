# PusztaPlayer — Agent Instructions

## Server Deploy — THE BIG ONE

A Docker `COPY ./app ./app` és `COPY ./scripts ./scripts` a **compose fájl könyvtárából** másol. Ha a compose fájl `/opt/pusztaplayer/docker-compose.yml`, akkor scp célok:

| Git forrás | Szerver scp cél |
|---|---|
| `server/app/api/v1/admin.py` | `/opt/pusztaplayer/app/api/v1/admin.py` |
| `server/app/core/*.py` | `/opt/pusztaplayer/app/core/` |
| `server/app/models/models.py` | `/opt/pusztaplayer/app/models/models.py` |
| `server/scripts/*.py` | `/opt/pusztaplayer/scripts/` |
| `server/alembic/versions/*.py` | `/opt/pusztaplayer/alembic/versions/` |

**SOHA ne** `/opt/pusztaplayer/server/...` — oda a Docker NEM lát.

## Build Commands

### Frontend APK (Fire TV, `armeabi-v7a`)
```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
cd android; .\gradlew.bat assembleRelease
```
APK kimenet: `android\app\build\outputs\apk\release\app-armeabi-v7a-release.apk`

### Backend rebuild + restart
```bash
cd /opt/pusztaplayer
docker compose build --no-cache fastapi && docker compose up -d fastapi
```

### DB migration (új oszlop után)
```bash
docker compose exec fastapi alembic upgrade head
```

### ICY meta script futtatás (konténeren belül, nginx timeout nélkül)
```bash
docker cp /opt/pusztaplayer/scripts/check_radio_icy.py pusztaplayer-fastapi-1:/app/scripts/
docker compose exec fastapi python /app/scripts/check_radio_icy.py
```

## Architecture

```
PusztaPlayer/
├── src/              # React Native (Fire TV)
│   ├── screens/      # 15 screens
│   ├── components/   # Shared UI (SimpleCard, RadioPlayer, ExitDialog)
│   ├── services/     # API hívások (xtreamApi, playlistService, radioService)
│   ├── hooks/        # usePlayerSession, useChannelNavigation, useAIMoods
│   └── store/        # AppContext (React Context + Immer reducer)
├── server/
│   ├── app/api/v1/   # 16 FastAPI router (66 endpoint)
│   ├── app/core/     # ICY meta, Xtream kliens, channel merger, vector engine
│   ├── app/models/   # SQLAlchemy modellek
│   ├── scripts/      # Import szkriptek (EPG, filmek, sorozatok, rádiók)
│   └── alembic/      # DB migrációk
└── wp-plugin/        # Pure PHP WordPress admin plugin
    ├── inc/pages/     # 8 admin oldal (dashboard, radio, epg, tags, stb.)
    └── assets/        # admin.css (dark UI)
```

## Key Gotchas

### Frontend `cleanChannelTitle` — két külön implementáció
Ha a külföldi csatornanevek előtt kettőspont jelenik meg (`: DE: Das Erste`), a frontend `xtreamApi.ts:89` regex-e hibás. A `[:|\s\-]*` karaktereket KÖTELEZŐ beletenni a country code után. A backend `channel_merger.py`-ben ez már benne van.

### Nginx 60s proxy timeout
A `/api/v1/` location `proxy_read_timeout` alapértelmezett 60 mp. Hosszú kérések (pl. ICY bulk) timeout-olnak és 504-et adnak. Hosszú scripteket `docker compose exec`-en belül kell futtatni, nem HTTP-n keresztül.

### Xtream API — `verify=False` kötelező
A `movaloget.cc:42310` SSL tanúsítványa self-signed/lejárt. Backend admin endpointok amik közvetlenül hívják a Xtream API-t (`player_api.php`) `verify=False`-szal kell dolgozzanak az `httpx.AsyncClient`-ben. A publikus endpointok az nginx proxy-n mennek keresztül (`https://live.pusztaplay.eu`) ami kezeli a cert-et.

### Session-független scriptek
A `scan_redis_sessions()` és `get_xtream_credentials()` függvények 5 helyen vannak:
`import_common.py`, `import_epg_filtered.py`, `night_epg.py`, `tag_channels.py`, `admin.py`.
Mindegyiknek van `.env` credential fallback-je ha a Redis-ben nincs aktív session:
```python
if not username:
    username = settings.XTREAM_USERNAME
    password = settings.XTREAM_PASSWORD
```

### Backend `.env`
A docker compose `/opt/pusztaplayer/.env`-ből olvassa a `${VAR}` hivatkozásokat.
Minimum változók: `DB_PASSWORD`, `ADMIN_USER`, `ADMIN_PASS`, `XTREAM_USERNAME`,
`XTREAM_PASSWORD`, `PROXY_AUTH_KEY`, `RAPIDAPI_KEY`, `DEEPSEEK_API_KEY`.

### Redis — SOHA ne használj `KEYS *`-ot
Minden `redis.keys("session:*")` cserélve SCAN-re:
```python
keys = [k async for k in r.scan_iter(match="session:*")]
```
Ez 10+ helyen fixálva v2.3.0 által. Ha új kódot írsz, SCAN-t használj.

### admin.py try/except — óvatosan az edit-tel
Az 1200+ soros fájl mélyen egymásba ágyazott try/except blokkokat tartalmaz.
Az `except Exception: pass` sorok cseréjénél a `replaceAll` könnyen MATCH-el
ROSSZ helyen lévő except blokkot. Mindig adj elég kontextust az oldString-hez.

### Alembic migration lánc
A git verzióban mind a 9 migráció megvan a `server/alembic/versions/`-ben.
A szerveren a Docker context `/opt/pusztaplayer/alembic/versions/`-ben KELL
legyen mind a 9 fájl. Ha `KeyError: '007_channel_tags'` jön, hiányzó fájlok
vannak a szerveren. A DB `alembic_version` táblája mutatja mi van élesítve.
