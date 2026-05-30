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

## Projekt struktúra

```
PusztaPlayer/
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

A lejátszási lista az AsyncStorage-ban van cache-elve (`CACHE_LIVE=5000`, `CACHE_VOD=10000`). Ha az API friss hívása részleges adatot ad vissza, a cache merge logika pótolja a hiányzó elemeket a korábbi cache-ből.

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

## Licensz

A projekt a PusztaPlayer csapat tulajdona. Minden jog fenntartva.
