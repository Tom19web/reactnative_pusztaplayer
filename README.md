# PusztaPlayer

IPTV lejátszó alkalmazás Android TV / Fire TV platformra, React Native alapokon.  
Xtream Codes API kompatibilis — élő TV, filmek, sorozatok, EPG műsorújság, többprofil támogatás.

## Technológiák

| Réteg | Technológia |
|-------|-------------|
| **Keretrendszer** | React Native 0.85.2 |
| **Videó lejátszó** | ExoPlayer (Media3 1.8.0) — react-native-video 6.19.2-n keresztül |
| **Stream formátum** | HLS (.m3u8) / MPEG-TS (.ts) — dinamikusan választható |
| **JS motor** | Hermes |
| **API kommunikáció** | Xtream Codes protokoll (`player_api.php`) |
| **Proxy** | Nginx reverse proxy (HTTPS → Xtream backend) |
| **WordPress sync** | Profilok, kedvencek, előzmények szinkronizálása REST API-n keresztül |
| **Hibakövetés** | Sentry |
| **Betűtípusok** | Bangers-Regular, Poppins-Regular, Poppins-Bold |
| **Kotlin** | 2.1.20 |
| **AGP** | 8.9.1 |
| **compileSdk / targetSdk** | 36 |
| **minSdk** | 26 |
| **Backend API** | Python FastAPI + PostgreSQL (pgvector) + Redis |
| **AI / ML** | OpenAI embeddings (text-embedding-3-small, 1536-dim) + DeepSeek |
| **Deploy** | Docker Compose (FastAPI, Postgres+pgvector, Redis, Nginx) |

## Funkciók

### Lejátszás
- Élő TV, filmek (VOD) és sorozatok lejátszása
- TS és HLS formátum támogatás — állítható a Beállítások menüből
- Automatikus újracsatlakozás buffer-ürülés esetén (8 mp várakozás, 3 próbálkozás)
- Felirat és hangsáv választás (nyelv alapú, nem index alapú — túléli a reconnect-et)
- 5 másodperces auto-play visszaszámláló sorozat epizódoknál
- Sorozat epizódok masszív URL cache-elése — cold start után is működik
- Watch history pozíció mentés (VOD/series: 10 mp-ként, Live: 3 mp után)
- Sleep timer (30/60 perc)

### TV Újság (EPG)
- Idővonal alapú grid nézet: csatornák × programsávok
- "Most megy" + következő 3 műsor csatornánként
- Műsorcímre keresés a globális keresőből
- Program részletek popup (cím, idő, leírás, "Nézés most" gomb)

### Felhasználói felület
- Sidebar navigáció (Kezdőlap, Live TV, Filmek, Sorozatok, TV Újság, Kedvencek, Megnézendő)
- Keresősáv (Topbar) — csatornanévre, filmcímre, műsorcímre keres
- Kezdőképernyő: folytatás carousel, kedvencek, ajánlások
- Channel quality merge (SD/HD/FHD egy kártyán, minőségválasztó)
- Filter sáv: kategória, év, műfaj, rendezés
- Átlátszó, "glass" stílusú dropdown-ok és detail panelek
- Focus trap a detail paneleken — D-pad nem szökik le a háttérre

### Profilok
- Többprofil támogatás (külön kedvencek, előzmények, beállítások)
- Profilok soft delete + restore
- WordPress szinkronizálás (Bearer token auth, verziókövetés, konfliktuskezelés)
- Automatikus profil választás újrainduláskor

### Biztonság
- Stream URL-ek nem jelennek meg a UI-on (jelszóvédelem)
- Console log-ok `__DEV__` guard-dal védve
- Sentry DSN kizárólag környezeti változóból
- ProGuard szabályok előkészítve

### AI Features
- Vektoros ajánló (`/api/v1/recommend`) — nézési előzmények centroid embedding-je alapján
- Szemantikus keresés (`/api/v1/search/semantic`) — OpenAI embedding alapú
- EPG AI dúsítás (`/api/v1/epg/{id}`) — műsorok AI genre, cast, bővített leírás
- "Hasonlók" a detail paneleken — bármely film/sorozat embedding alapú hasonló találatok
- Per-epizód plot (`/api/v1/episodes/plot`) — TMDB + OpenAI embedding-gel feltöltött epizód leírások
- AI hangulat szűrő film/sorozat böngészőben
- Napi AI válogatás a főoldalon
- Golf-Riaszto értesítési beállítások

### Backend Server (Python FastAPI)
A `server/` mappában található a Python backend, ami a következő szolgáltatásokat nyújtja:
- AI / ML endpointok (pgvector similarity search, OpenAI embeddings)
- Session-alapú Xtream proxy (Redis session store, 24h TTL)
- Élő TV csatornalista proxy — országkód prefix tisztítás, minőség merge (SD/HD/FHD), dedup
- EPG enrichment, felirat kezelés, rádió API, cron job-ok
- Profilok, QR auth

**Backend indítása:**
```bash
cd server
cp .env.example .env  # majd töltsd ki a kulcsokat
docker compose up -d
```

## Projekt struktúra

```
PusztaPlayer/
├── server/                          # Python FastAPI backend
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── pyproject.toml
│   ├── .env.example
│   ├── app/
│   │   ├── main.py                  # FastAPI app + router registration
│   │   ├── config.py                # Settings (pydantic)
│   │   ├── database.py              # AsyncSession factory
│   │   ├── redis.py                 # Redis client (session store)
│   │   ├── api/v1/                  # API route-ok
│   │   │   ├── search.py            # Szemantikus keresés
│   │   │   ├── recommend.py         # Vektoros ajánló + hasonlók
│   │   │   ├── session.py           # Session kezelés (Redis)
│   │   │   ├── live.py              # Élő TV proxy (csatornalista)
│   │   │   ├── epg.py               # EPG enrichment
│   │   │   └── ...
│   │   ├── core/                    # Alapszolgáltatások
│   │   │   ├── vector_engine.py     # pgvector cosine similarity
│   │   │   ├── auth.py              # Bearer token session auth
│   │   │   ├── xtream_client.py     # Xtream API HTTP kliens
│   │   │   └── channel_merger.py    # Csatornanév tisztítás + merge
│   │   └── models/                  # SQLAlchemy modellek
│   ├── scripts/                     # Import szkriptek
│   └── migrations/                  # Alembic migrációk
├── App.tsx                         # Alkalmazás beléptető pont
├── index.js                        # RN regisztráció
├── package.json
├── tsconfig.json
├── metro.config.js
├── react-native.config.js
├── .env.example                    # Környezeti változók sablon
├── patches/                        # patch-package fájlok
│   └── react-native-video+6.19.2.patch  # ExoPlayer live badge elrejtése
├── assets/
│   ├── fonts/                      # Betűtípusok
│   ├── icons/                      # SVG ikonok (Play, Pause, Heart, stb.)
│   ├── pp-logo.png
│   └── splash-bg.png
├── android/
│   ├── build.gradle                # Root Gradle konfig
│   ├── settings.gradle
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle            # App Gradle (ABI splits, signing, ProGuard)
│       ├── proguard-rules.pro
│       └── src/main/               # Natív Android források
├── src/
│   ├── components/
│   │   ├── VideoPlayer.tsx         # Core videó lejátszó (ExoPlayer wrapper)
│   │   ├── PlayerControls.tsx      # Lejátszás vezérlők (play/pause, seek, EPG, beállítások)
│   │   ├── Sidebar.tsx             # Oldalsó navigációs menü
│   │   ├── Topbar.tsx              # Felső keresősáv
│   │   ├── SimpleCard.tsx          # Tartalom kártya (csatorna/film/sorozat)
│   │   ├── HomeHero.tsx            # Kezdőképernyő carousel + folytatás
│   │   ├── FilterBtn.tsx           # Szűrő gomb
│   │   ├── FilterItem.tsx          # Szűrő lista elem
│   │   ├── TFPressable.tsx         # TV fókusz kompatibilis Pressable
│   │   ├── LiveDetailPanel.tsx     # Élő TV részletes panel (EPG, minőségválasztó)
│   │   ├── MovieDetailPanel.tsx    # Film részletes panel
│   │   ├── SeriesDetailPanel.tsx   # Sorozat részletes panel
│   │   ├── EpisodePanel.tsx        # Epizód lista
│   │   ├── EpgGrid.tsx             # EPG idővonal grid
│   │   ├── EpgDetailPopup.tsx      # EPG műsor részletek popup
│   │   ├── ErrorBoundary.tsx       # React hibahatár
│   │   ├── NetProvider.tsx         # Hálózati állapot figyelő
│   │   └── ...                     # Egyéb komponensek
│   ├── screens/
│   │   ├── HomeScreen.tsx          # Kezdőképernyő
│   │   ├── LiveScreen.tsx          # Élő TV lista
│   │   ├── MoviesScreen.tsx        # Filmek lista
│   │   ├── SeriesScreen.tsx        # Sorozatok lista
│   │   ├── EpgScreen.tsx           # TV Újság
│   │   ├── PlayerScreen.tsx        # Videó lejátszó képernyő
│   │   ├── LoginScreen.tsx         # Bejelentkezés (QR kód)
│   │   ├── FavoritesScreen.tsx     # Kedvencek
│   │   ├── WatchLaterScreen.tsx    # Megnézendő lista
│   │   ├── ProfileSelectScreen.tsx # Profil választó / létrehozás
│   │   └── UserInfoScreen.tsx      # Felhasználói adatok
│   ├── hooks/
│   │   ├── useEpg.ts               # EPG adat betöltés + szűrés
│   │   ├── useAutoPlay.ts          # Sorozat auto-play
│   │   ├── usePlayerContent.ts     # Film/sorozat/EPG adat
│   │   ├── usePlayerSession.ts     # Lejátszási session
│   │   ├── usePlayerHistory.ts     # Nézési előzmények
│   │   ├── useDevLogin.ts          # Fejlesztői bejelentkezés
│   │   └── ...
│   ├── services/
│   │   ├── xtreamApi.ts            # Xtream API hívások + stream URL építők
│   │   ├── playlistService.ts      # Playlist cache + merge logika
│   │   ├── playbackSession.ts      # Lejátszási session + epizód URL cache
│   │   ├── epgService.ts           # EPG fetch + Base64 dekódolás
│   │   ├── storage.ts              # EncryptedStorage + AsyncStorage
│   │   ├── wordpressSync.ts        # WordPress profil szinkron
│   │   ├── fetchWithTimeout.ts     # HTTP fetch timeout wrapper
│   │   └── qrAuth.ts              # QR kód authentikáció
│   ├── store/
│   │   └── AppContext.tsx           # React Context állapotkezelés
│   ├── navigation/
│   │   └── AppNavigator.tsx        # Route kezelés
│   ├── constants/
│   │   └── index.ts                # Konstansok, színek, betűméretek
│   ├── types/
│   │   └── index.ts                # TypeScript típusdefiníciók
│   └── utils/
│       └── dedupKey.ts             # Duplikátum kulcs generálás
└── windows/                        # Windows (RNW) projekt — kísérleti
```

## Környezeti változók

Másold a `.env.example`-t `.env` néven és állítsd be:

```env
XTREAM_SERVER=https://live.pusztaplay.eu
QR_API_BASE=https://pusztaplay.eu/wp-json/pusztaplay/v1
USER_AGENT=PusztaPlayer v1.0
SENTRY_DSN=
```

- `XTREAM_SERVER`: Xtream Codes szerver URL (nginx proxy)
- `QR_API_BASE`: WordPress REST API base URL (QR auth, profil sync)
- `USER_AGENT`: API hívásoknál használt User-Agent header
- `SENTRY_DSN`: Sentry hibakövetés DSN (opcionális, üresen hagyva letiltva)

## Build

### Előfeltételek

- Node.js >= 22.11.0
- Java 17 (Eclipse Adoptium / Temurin)
- Android SDK (compileSdk 36, buildTools 36.0.0)
- NDK 27.1.12297006

### Fejlesztői build

```bash
npm install --legacy-peer-deps
cd android
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
gradlew assembleDebug
```

### Release build

```bash
npm install --legacy-peer-deps
cd android
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
gradlew assembleRelease
```

A release APK három verzióban készül:
- `app-arm64-v8a-release.apk` — Fire TV 4K, Fire TV Cube
- `app-armeabi-v7a-release.apk` — Régebbi Fire TV Stick
- `app-universal-release.apk` — Mindkét architektúra

### Keystore

A release aláíráshoz környezeti változók vagy `keystore.properties` fájl szükséges az `android/app/` mappában:

```properties
storeFile=pusztaplayer.keystore
storePassword=...
keyAlias=...
keyPassword=...
```

Vagy környezeti változókkal: `RELEASE_KEYSTORE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.

## Telepítés Fire TV-re

```bash
adb uninstall com.pusztaplayer
adb install android\app\build\outputs\apk\release\app-universal-release.apk
```

RN verzióváltás után mindig törölni kell az alkalmazás adatait (`adb uninstall`), mert a Hermes bytecode cache inkompatibilis lehet.

## Patch-ek

A projekt `patch-package`-et használ a `node_modules` módosítások kezelésére:

- `react-native-video+6.19.2.patch` — Elrejti az ExoPlayer "LIVE" badge-ét amikor a native controls ki van kapcsolva (`controls={false}`)

Patch készítése:
```bash
npx patch-package react-native-video
```

Patch alkalmazása (automatikus `npm install` után):
```bash
npm install --legacy-peer-deps
```

## Működési elv

### Stream URL építés

A live stream URL-ek dinamikus formátummal épülnek (`getLiveFormat()` — `ts` vagy `m3u8`):

```
https://live.pusztaplay.eu/live/{username}/{password}/{stream_id}.ts
```

A formátum a Beállítások → Live: TS/HLS menüpontban váltható. A váltás automatikusan újratölti a csatornalistát.

### Playlist cache

A lejátszási lista az AsyncStorage-ban van cache-elve (`CACHE_LIVE=10000`, `CACHE_VOD=10000`). Ha az API friss hívása részleges adatot ad vissza, a cache merge logika pótolja a hiányzó elemeket a korábbi cache-ből.

### Epizód lejátszás (cache-független)

Az epizód URL-ek három forrásból tölthetők be (sorrendben):

1. AsyncStorage cache (`EP_URLS_KEY`) — azonnali, ha van
2. Playlist-ből (`getImportedPlaylist()`) — ha a sorozat/epizód szerepel a playlist-ben
3. **Fallback**: credential-ökből épített URL (`buildEpisodeUrl()`) — cache nélkül is működik

Az epizódok tömegesen cache-elődnek amikor a sorozat részletei betöltődnek.

### Audio/Subtitle track választás

A track kiválasztás nyelv alapú (`SelectedTrackType.LANGUAGE`), nem index alapú. Reconnect után is megtalálja a megfelelő nyelvet, akkor is ha a track-ek sorrendje megváltozik.

## Ismert korlátozások

- **Nincs catch-up / timeshift** — az Xtream API `get_simple_data_table` endpoint-ja elérhető, de nincs implementálva
- **Nincs TV csatorna számozás** — a csatornák server-sorrendben vagy ABC-ben jelennek meg
- **Nincs kép-a-képben (PiP)** — React Native + ExoPlayer limitáció
- **Nincs szülői felügyelet / profil PIN** — jelenleg bármelyik profilba át lehet lépni
- **Nincs többnyelvű UI** — minden szöveg magyar nyelvű
- **Nincs x86 emulátor támogatás** (csak ARM APK-k)

## API Végpontok

Minden végpont `https://live.pusztaplay.eu/api/v1` base URL alatt érhető el.

### Auth módok

| Auth típus | Header | Használat |
|-----------|--------|-----------|
| **Bearer token** | `Authorization: Bearer <token>` | Session regisztráció után — playlist, live/streams, episode plot |
| **Basic auth** | `Authorization: Basic <base64>` | Admin panel, cron job-ok |
| **x-api-key** | `x-api-key: <key>` | AI végpontok (PROXY_AUTH_KEY) |
| **Nincs** | — | Rádió, EPG, cast search, subtitles, QR auth |

### Publikus (auth nélkül)

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/radio` | Rádióállomások listája (aktívak, szavazatok szerint) |
| `GET` | `/radio/metadata` | ICY/Shoutcast meta — aktuális dalcím (SSRF védett) |
| `GET` | `/search/cast` | Szereplő keresés filmek/sorozatok között |
| `GET` | `/epg/search` | Műsor keresés cím alapján |
| `GET` | `/epg` | Összes EPG adat (cache-elve) |
| `GET` | `/epg/{channel_id}` | Teljes EPG egy csatornához |
| `GET` | `/epg/{channel_id}/now` | Jelenleg futó műsor |
| `GET` | `/epg/{channel_id}/upcoming` | Következő műsorok |
| `GET` | `/channel-logos` | Logo URL-ek batch lekérése stream ID-k alapján |
| `GET` | `/subtitles/{imdb_id}` | Felirat keresés OpenSubtitles-en |
| `GET` | `/subtitles/{imdb_id}/download` | Felirat letöltés (302 redirect) |

### Session (Bearer token)

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/session/register` | Session regisztráció Xtream credential-ökkel (IP rate limit: 5/perc) |
| `POST` | `/session/logout` | Session token érvénytelenítése |
| `GET` | `/playlist/live` | Élő TV csatornalista (logo fallback, tag-ek, EPG now-playing) |
| `GET` | `/playlist/movies` | Filmek listája (TMDB meta: plot, genre, cast, rating) |
| `GET` | `/playlist/series` | Sorozatok listája (TMDB meta: plot, genre, cast, rating) |
| `GET` | `/live/streams` | Élő stream-ek logo-val, tag-ekkel, nyelvvel, quality merge-elve |
| `GET` | `/episodes/plot` | Epizód plot lekérése (TMDB + OpenAI embedding) |

### AI (x-api-key — PROXY_AUTH_KEY)

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/ai/moods` | AI hangulat címkézés (DeepSeek) |
| `POST` | `/ai/search` | AI szemantikus tartalom keresés (DeepSeek) |
| `POST` | `/ai/ai/recommend` | AI ajánló nézési előzmények alapján (DeepSeek) |
| `POST` | `/recommend` | Vektoros ajánló (pgvector cosine similarity) |
| `GET` | `/recommend/similar` | Hasonló tartalmak (seed film/sorozat alapján, pgvector) |
| `POST` | `/search/semantic` | Szemantikus keresés (POST, OpenAI embedding) |
| `GET` | `/search/semantic` | Szemantikus keresés (GET, OpenAI embedding) |
| `POST` | `/enrich` | EPG programok AI dúsítása (DeepSeek: genre, cast, POW leírás) |

### QR Auth

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/auth/qr-request` | QR kód session generálása TV login-hoz |
| `GET` | `/auth/qr-poll` | QR session státusz lekérdezése |
| `GET` | `/auth` | QR auth HTML oldal |
| `POST` | `/auth/submit` | Xtream credential beküldése QR auth form-ból |

### Profilok

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/profiles/register` | FCM token + érdeklődési körök regisztrálása |
| `POST` | `/profiles/golf-check` | Golf-Riaszto EPG match indítása (Basic auth) |

### Admin (Basic auth — ADMIN_USER / ADMIN_PASS)

**Statisztikák és EPG:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/stats` | Rendszer statisztikák (session, logo, EPG, csatornák) |
| `GET` | `/admin/channel-list` | Csatornalista EPG státusszal, szűréssel, lapozással |
| `GET` | `/admin/channel-list/{stream_id}/epg` | Now-playing + következő EPG egy csatornához |
| `GET` | `/admin/missing-analysis` | Kategóriánkénti hiányzó logo/EPG kimutatás |
| `GET` | `/admin/epg-check/{stream_id}` | Részletes EPG diagnosztika egy stream_id-re |
| `POST` | `/admin/epg/import` | EPG XMLTV import indítása (background task) |
| `POST` | `/admin/epg/hu-direct-import` | HU direkt EPG import indítása |
| `GET` | `/admin/import/stream/{task_id}` | Import task log stream-elése (SSE) |
| `POST` | `/admin/delete-category` | Kategória összes logo/EPG törlése |
| `POST` | `/admin/cache/clear` | Playlist + live stream Redis cache törlése |

**EPG Mapping:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/epg-hu-mapping` | HU EPG port.hu mapping lekérése |
| `POST` | `/admin/epg-hu-mapping` | Kézi xtream_sid hozzárendelés mentése |

**Logo Kezelő:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/logos/list` | Logo lista kereséssel, lapozással |
| `DELETE` | `/admin/logos/{stream_id}` | Logo törlése (DB + cache fájl) |
| `POST` | `/admin/logos/merge` | Csatornanév → XMLTV név párosítás mentése |
| `GET` | `/admin/xmltv-names/{country}` | XMLTV display-name lista országonként |

**Címke Kezelő:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/channel-tags` | Címke lista (szűrés: search, tag, untagged_only) |
| `POST` | `/admin/channel-tags` | Kézi címke + nyelv mentése |

**Rádió Kezelő:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/radio` | Rádiólista (szűrés: tag, country, no_logo, dup_only) |
| `POST` | `/admin/radio/{uuid}` | Rádióállomás adatainak szerkesztése |
| `DELETE` | `/admin/radio/{uuid}` | Rádióállomás deaktiválása |
| `POST` | `/admin/radio/batch-deactivate` | Tömeges deaktiválás |

**Docker Manager:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/docker/status` | Konténerek listája és állapota |
| `GET` | `/admin/docker/logs/{container}` | Konténer logok |
| `POST` | `/admin/docker/restart/{container}` | Konténer újraindítása |
| `POST` | `/admin/docker/restart-all` | Összes konténer újraindítása |
| `POST` | `/admin/docker/stop` | Összes konténer leállítása |
| `POST` | `/admin/docker/cache-clear` | Redis cache törlése + FastAPI restart |

**Script Editor:**
| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `GET` | `/admin/docker/scripts` | Script fájlok listája |
| `GET` | `/admin/docker/scripts/{name}` | Script tartalmának olvasása |
| `POST` | `/admin/docker/scripts/{name}` | Script mentése |
| `POST` | `/admin/docker/scripts/{name}/run` | Script futtatása (background task, Redis log) |

### Cron (Basic auth)

| Módszer | Útvonal | Leírás |
|---------|---------|--------|
| `POST` | `/cron/epg-import` | EPG XMLTV import (background) |
| `POST` | `/cron/epg-enrich-and-match` | EPG dúsítás + Golf-Riaszto match |

## Licensz

A projekt a PusztaPlayer csapat tulajdona. Minden jog fenntartva.
