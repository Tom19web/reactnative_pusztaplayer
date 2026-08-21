# ARCHIVED.md — PusztaPlayer React Native (EOL)

**Archiválás dátuma:** 2026-08
**Státusz:** END OF LIFE

Ez a dokumentum a React Native projekt záró átadási leírása. A kliens
Kotlin-ra migrált, a backend a Kotlin csapat repo-jában folytatódik.

---

## 1. Mi volt ez a projekt

PusztaPlayer — magyar IPTV streaming kliens **Android TV / Fire TV**-re,
React Native 0.85.2 alapon. A teljes ökoszisztéma négy komponensből állt:

| Komponens | Technológia | Státusz |
|-----------|-------------|---------|
| **Kliens** (`src/`) | React Native (Fire TV) | ❌ EOL — Kotlin migrálva |
| **Backend** (`server/`) | Python FastAPI + PostgreSQL (pgvector) + Redis | ⚠️ folytatódik a Kotlin csapatnál |
| **CRM Manager** | PHP 8.2+ WordPress plugin | ✅ külön repo, megy tovább |
| **Theme** | PHP WordPress téma (pop-art) | ✅ külön repo, megy tovább |

---

## 2. Komponens térkép — hol él most minden

| Régi hely | Új hely / státusz |
|-----------|-------------------|
| `src/` (RN app) | Kotlin migrálva (a Kotlin csapat repo-ja) |
| `server/` (FastAPI) | `pusztaplayer-server` (Kotlin csapat repo-ja) — az itteni `server/` elavult |
| `wp-plugin/` | Kiváltotta a **PusztaPlay CRM Manager** → `github.com/Tom19web/pusztaplay-crm-manager` |
| `refaktor/` (Kotlin prep, 99+ fájl) | Nem commit-olva, törölve — a Kotlin csapat saját migrációja felülírta |
| Theme | `github.com/Tom19web/pusztaplay-theme` |

---

## 3. Architektúra áttekintés

```
┌──────────────┐      ┌─────────────────────────────────────┐
│  Fire TV app │      │  WordPress (pusztaplay.eu)          │
│  (RN → Kotlin)│     │  ├── CRM Manager (plugin)           │
└──────┬───────┘      │  │     - 13+ modul (TMDB, EPG, chat, │
       │              │  │       GDPR, auth, stripe, ...)   │
       │              │  └── Theme (pop-art, dark)          │
       ▼              └──────────────┬──────────────────────┘
┌─────────────────────┐              │ REST (wp-json)
│  FastAPI BFF         │◄─────────────┘
│  live.pusztaplay.eu │
│  /opt/pusztaplayer/ │
│  ├── postgres (pgvector)           │
│  ├── redis (session store)         │
│  ├── fastapi (uvicorn)             │
│  └── docker-agent (docker.sock)    │
└──────────┬──────────────────────────┘
           │ player_api.php / xmltv.php (nginx proxy)
           ▼
     Xtream backend (movaloget.cc:42310)
```

### Backend szolgáltatások

- **16+ router** a `/api/v1` alatt (AI, search, epg, enrich, subtitles,
  profiles, cron, radio, recommend, qr_auth, episodes, session, live,
  playlist, admin, cast_search, age_rating).
- **9 + 1 Alembic migráció** (`001_initial` → `010_index_sync`).
- **9 SQLAlchemy modell** (movies, series, episodes, epg_programs,
  radio_stations, channel_logos, channel_tags, qr_sessions, user_profiles).
- **Külső szolgáltatások**: DeepSeek (chat), OpenAI (embeddings),
  TMDB, OpenSubtitles, RapidAPI (rádió), GitHub (iptv-org EPG index),
  port.hu (HU EPG), Firebase (FCM — lásd nyitott tétel).

### Kép proxy

Az Xtream képek (movaloget.cc) az nginx `/images/` proxy-n keresztül
jönnek `https://live.pusztaplay.eu/images/...` formában (mixed content
elhárítása SSL után). A `_rewrite_image_url` / `rewrite_image_url`
segédfüggvények ezt a proxy-t használják.

---

## 4. API kontraktus

A teljes endpoint-táblázat a [`README.md`](README.md) "API Végpontok"
szekciójában van. A fő csoportok:

- **Publikus**: `/radio`, `/epg/*`, `/search/cast`, `/channel-logos`, `/subtitles/*`
- **Session (Bearer)**: `/session/register`, `/playlist/*`, `/live/streams`, `/episodes/plot`
- **AI (x-api-key)**: `/ai/moods`, `/ai/search`, `/ai/recommend`, `/recommend`, `/recommend/similar`, `/search/semantic`, `/enrich`
- **QR auth**: `/auth/qr-request`, `/auth/qr-poll`, `/auth`, `/auth/submit`
- **Admin (Basic auth)**: `/admin/stats`, `/admin/channel-list`, `/admin/radio`, `/admin/docker/*`, `/admin/epg-hu-mapping`, `/admin/logos/*`, stb.
- **Korhatár**: `/vod/age?type=movie|series&id=...` (TMDB + DeepSeek descriptorok)

### Auth módok

| Auth | Header | Használat |
|------|--------|-----------|
| Bearer | `Authorization: Bearer <token>` | Playlist, live/streams, episode plot |
| Basic | `Authorization: Basic <base64>` | Admin panel, cron |
| x-api-key | `x-api-key: <key>` | AI végpontok (PROXY_AUTH_KEY) |
| — | — | Rádió, EPG, cast search, subtitles, QR |

---

## 5. EPG pipeline (magyar)

1. `night_epg.py` (cron, hajnali 3-kor): `import_epg.py` → `import_epg_filtered.py --missing` → `purge_dead_channels()` → `purge_expired_programs()`.
2. **port.hu ág** (kézi, NEM a cronban): `grab_hu_port.py` → `import_epg_hu_direct.py` (auto-match: epg_channel_id + név + fuzzy + AI fallback).
3. A port.hu XML 7 napot fed le, ezért időnként újra kell futtatni.

### Sorozat / epizód plot

- `import_series.py` / `import_movies.py` — Xtream + OpenAI embeddings.
- `import_episodes.py` — TMDB epizódok (hu-HU + en-US fallback).
- `backfill_episode_plots.py` — angol fallback az üres plotokra.
- `generate_episode_plots.py` — DeepSeek generálás a maradék üres plotokra.

---

## 6. Nyitott tételek / átadási megjegyzések

| # | Tétel | Részletek |
|---|-------|-----------|
| 1 | **FCM push (NYITOTT)** | Firebase-projekt + service-account még nincs; a kliensek sem regisztrálnak tokent. A compose-ban az `FCM_CREDENTIALS_JSON` env default `/run/secrets/fcm_credentials`, a `secrets:` blokk kivéve. Visszaállításhoz: service-account JSON a `./secrets/`-be + mount. |
| 2 | **DeepSeek fordítás (~38k üres plot)** | A `generate_episode_plots.py` megírva, de a `DEEPSEEK_API_KEY` a `.env`-ben üres volt. A backfill (angol) a 100 778 üres plotból ~62 220-at feltöltött; a maradék ~38 558-hoz DeepSeek generálás kell. |
| 3 | **116 sorozat tmdb_id nélkül** | `enrich_series_tmdb_v2.py` + `import_episodes.py` futtatandó (a TMDB_ID backfill + epizód import). |
| 4 | **DEPLOYMENT.md + ops/ backup-csomag** | Terv szintjén maradt — a backend "mindent átfogó leírás + telepithető" csomag (setup.sh / backup.sh / restore.sh) NEM készült el. A Kotlin csapat a saját deploy folyamatát használja. |
| 5 | **port.hu EPG a cronban** | A `grab_hu_port.py` + `import_epg_hu_direct.py` jelenleg kézi. Ha állandó HU EPG kell, be kell tenni a `night_epg.py`-ba (a port.hu fusson utoljára, mert az N4 dedup az utolsó importot tartja meg). |

---

## 7. Infrastruktúra / deploy célok

| Cél | Cím | Útvonal |
|-----|-----|---------|
| Backend | `live.pusztaplay.eu` | `/opt/pusztaplayer/` |
| WordPress | `staging.pusztaplay.eu` (teszt) | `/var/www/html/pusztaplay.eu/` |

### Backend deploy

```bash
scp <file> root@live.pusztaplay.eu:/opt/pusztaplayer/<path>
ssh root@live.pusztaplay.eu "cd /opt/pusztaplayer && docker compose build --no-cache fastapi && docker compose up -d"
ssh root@live.pusztaplay.eu "cd /opt/pusztaplayer && docker compose exec fastapi alembic upgrade head"
```

> A `app/`, `scripts/`, `alembic/` a Dockerfile `COPY`-jával megy be az
> image-be → **rebuild kell** fájlváltozásnál (a `docker cp` ideiglenes).
> A `.env`-ben kötelező: `DB_PASSWORD`, `ADMIN_USER`, `ADMIN_PASS`,
> `PROXY_AUTH_KEY`, `AGENT_TOKEN` (+ opcionális API kulcsok).

---

## 8. Fontos gotcha-k

- **`movaloget.cc` SSL self-signed** — a közvetlen Xtream hívások `verify=False`-szal mennek; a publikus útvonal az nginx-en keresztül (valid cert).
- **Redis `KEYS *` tilos** — minden `scan_iter`-rel megy.
- **Alembic migrációk** — mind a 10 fájlnak a szerveren kell lennie (`/opt/pusztaplayer/alembic/versions/`), különben `KeyError` a chainben.
- **Xtream `player_api.php`** — a hibás auth gyakran HTTP 200 `{"user_info":{"auth":0}}` formában jön (N5 kezeli).
- **EPG timestamp** — a `grab_hu_port.py` `.replace("+0","+")` korrupciója 18 órás eltolódást okozott; fix: tiszta `%z`.

---

## 9. Licenc

A projekt a PusztaPlayer csapat tulajdona. Minden jog fenntartva.
