# PusztaPlayer Windows Port - Állapot

## Elkészült (2026-05-16)

### Keretrendszer
- `react-native-windows@0.84.0-preview.11` telepítve
- Windows natív projekt inicializálva (`windows/`)
- C++/WinRT Composition API alapú app
- Támogatott architektúrák: Win32, x64, ARM64 (Xbox)

### Platform-specifikus fájlok (`src/` alatt)
- `src/services/storage.windows.ts` - Windows Credential Manager + AsyncStorage fallback
- `src/components/VideoPlayer.windows.tsx` - Windows video lejátszó adapter
- `src/components/ExitDialog.windows.tsx` - BackHandler.exitApp védett
- `src/components/TVFocusWrapper.windows.tsx` - UIManager kihagyva Windows-on
- `src/hooks/useTVFocus.windows.ts` - onMouseEnter/Leave támogatás

### Módosított eredeti fájlok (minimális inline változtatások)
- `App.tsx` - deviceLabel: Windows/Xbox edition
- `src/components/Sidebar.tsx` - deviceLabel: Windows/Xbox
- `src/screens/LoginScreen.tsx` - Dev login gomb Windows-on is

### Windows natív projekt
- `windows/PusztaPlayer.sln` - Visual Studio solution
- `windows/PusztaPlayer/ReactPackageProvider.h` - Natív modul regisztráció
- `windows/PusztaPlayer/NativeModules.h` - Natív modul stubok

---

## Hiányzó - TEENDŐK

### 1. Build eszközök telepítése (KÖVETKEZŐ LÉPÉS)
PowerShell admin joggal:
```powershell
node_modules\react-native-windows\scripts\rnw-dependencies.ps1
```

VAGY manuálisan:
- Visual Studio 2022 (17.11+) + "Desktop development with C++" workload
- Windows 10 SDK (10.0.20348.0+)
- C++/WinRT VSIX

### 2. Natív modulok implementálása (C++/WinRT)

| Modul | Fájlok | Leírás |
|-------|--------|--------|
| **WindowsKeyboardManager** | `.h` + `.cpp` | KeyDown + Gamepad API → onHWKeyEvent |
| **WindowsCredentialManager** | `.h` + `.cpp` | PasswordVault → setItem/getItem/removeItem |

### 3. Video lejátszó
- **Opció A**: LibVLCSharp (NuGet: VideoLAN.LibVLC.Windows)
  - HLS + MPEGTS natív támogatás
  - Saját native view komponens
- **Opció B**: Windows MediaPlayer (MediaPlayerElement)
  - Beépített, de limitáltabb formátum támogatás
  - UWP only (desktop bridge kell)

### 4. Build és tesztelés
```bash
npx @react-native-community/cli run-windows --release --arch x64
```

---

## Build parancs

```bash
# Debug mode (Metro hot reload)
npx @react-native-community/cli run-windows --arch x64

# Release mode (bundled JS)
npx @react-native-community/cli run-windows --release --arch x64
```

## Fájl struktúra (végleges)

```
PusztaPlayer/
├── App.tsx                              ← Windows deviceLabel
├── src/
│   ├── components/
│   │   ├── VideoPlayer.tsx              ← Android/iOS (react-native-video)
│   │   ├── VideoPlayer.windows.tsx      ← Windows adapter (ÚJ)
│   │   ├── ExitDialog.tsx              ← Android/iOS
│   │   ├── ExitDialog.windows.tsx      ← Windows (exitApp védelem) (ÚJ)
│   │   ├── TVFocusWrapper.tsx          ← Android/iOS
│   │   ├── TVFocusWrapper.windows.tsx  ← Windows (UIManager skip) (ÚJ)
│   │   └── Sidebar.tsx                 ← Windows deviceLabel
│   ├── hooks/
│   │   ├── useTVFocus.ts               ← Android/iOS
│   │   └── useTVFocus.windows.ts       ← Windows (hover) (ÚJ)
│   ├── services/
│   │   ├── storage.ts                  ← Android/iOS (EncryptedStorage)
│   │   └── storage.windows.ts          ← Windows (CredentialManager) (ÚJ)
│   └── screens/
│       └── LoginScreen.tsx             ← dev login Windows-on
├── windows/                             ← RNW natív projekt
│   ├── PusztaPlayer.sln
│   ├── PusztaPlayer/
│   │   ├── PusztaPlayer.cpp
│   │   ├── ReactPackageProvider.h      ← Natív modul regisztráció (ÚJ)
│   │   └── NativeModules.h             ← Modul stubok (ÚJ)
│   └── PusztaPlayer.Package/
└── package.json                         ← react-native-windows függőség
```
