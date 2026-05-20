// WindowsVideoPlayer.cpp
// Video player using libVLC C API.

#include "pch.h"
#include "WindowsVideoPlayer.h"

#pragma push_macro("GetCurrentTime")
#undef GetCurrentTime

#include <vlc/vlc.h>
#include <winrt/Microsoft.ReactNative.h>
#include <windowsx.h>

namespace PusztaPlay {

using namespace winrt::Microsoft::ReactNative;

static const wchar_t *kPlayerWindowClass = L"PusztaPlayerVideoWindow";
static bool kClassRegistered = false;

WindowsVideoPlayer::WindowsVideoPlayer() {}

WindowsVideoPlayer &WindowsVideoPlayer::Instance() {
  static WindowsVideoPlayer instance;
  return instance;
}

WindowsVideoPlayer::~WindowsVideoPlayer() {
  destroy();
}

void WindowsVideoPlayer::SetReactContext(IReactContext const &context) {
  m_context = context;
}

void WindowsVideoPlayer::CreatePlayerWindow() {
  if (m_playerHwnd) return;

  // Get parent HWND using EnumWindows
  DWORD pid = GetCurrentProcessId();
  struct EnumData { DWORD pid; HWND hwnd; } data{pid, nullptr};
  EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
    auto *d = reinterpret_cast<EnumData *>(lParam);
    DWORD wPid;
    GetWindowThreadProcessId(hwnd, &wPid);
    if (wPid == d->pid && IsWindowVisible(hwnd) && GetParent(hwnd) == nullptr) {
      d->hwnd = hwnd;
      return FALSE;
    }
    return TRUE;
  }, reinterpret_cast<LPARAM>(&data));
  m_parentHwnd = data.hwnd;

  if (!m_parentHwnd) return;

  // Register window class once
  if (!kClassRegistered) {
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = PlayerWndProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = kPlayerWindowClass;
    wc.hbrBackground = reinterpret_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    RegisterClassExW(&wc);
    kClassRegistered = true;
  }

  // Create child window (audio works, video hidden behind Fabric Composition)
  RECT &r = m_layout;
  m_playerHwnd = CreateWindowExW(
      0,
      kPlayerWindowClass, L"",
      WS_CHILD | WS_VISIBLE,
      r.left, r.top, r.right - r.left, r.bottom - r.top,
      m_parentHwnd, nullptr, GetModuleHandleW(nullptr), nullptr);

  // Store the player instance in the window for the wndproc
  if (m_playerHwnd) {
    SetWindowLongPtrW(m_playerHwnd, GWLP_USERDATA,
                      reinterpret_cast<LONG_PTR>(this));
  }
}

void WindowsVideoPlayer::DestroyPlayerWindow() {
  if (m_playerHwnd) {
    DestroyWindow(m_playerHwnd);
    m_playerHwnd = nullptr;
  }
}

LRESULT CALLBACK WindowsVideoPlayer::PlayerWndProc(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  return DefWindowProcW(hwnd, msg, wParam, lParam);
}

#define VTRACE(msg) OutputDebugStringW(L"[VLC] " L##msg L"\n")

void WindowsVideoPlayer::play(const std::wstring &source) {
  VTRACE("play: start");
  // Stop and clean up previous playback
  if (m_mp) {
    VTRACE("play: cleanup - stop player");
    libvlc_media_player_stop(m_mp);
    libvlc_media_player_release(m_mp);
    m_mp = nullptr;
  }
  if (m_media) {
    VTRACE("play: cleanup - release media");
    libvlc_media_release(m_media);
    m_media = nullptr;
  }
  VTRACE("play: cleanup done");

  // Init VLC on first play (~0.5s freeze, then instant)
  if (!m_vlc) {
    VTRACE("play: libvlc_new about to call");
    const char *vlcArgs[] = {"--no-xlib", "--no-video-title-show", "--vout=directdraw"};
    m_vlc = libvlc_new(sizeof(vlcArgs) / sizeof(vlcArgs[0]), vlcArgs);
    VTRACE("play: libvlc_new returned");
  }
  if (!m_vlc) { VTRACE("play: VLC init failed - returning"); return; }

  // Create player window
  VTRACE("play: CreatePlayerWindow about to call");
  CreatePlayerWindow();
  VTRACE("play: CreatePlayerWindow returned");

  // Create media
  VTRACE("play: media_new_location about to call");
  auto url = winrt::to_string(source);
  m_media = libvlc_media_new_location(m_vlc, url.c_str());
  VTRACE("play: media_new_location returned");
  if (!m_media) { VTRACE("play: media null - returning"); return; }

  // Add options BEFORE creating player (must precede media_player_new)
  VTRACE("play: add options");
  libvlc_media_add_option(m_media, ":avcodec-hw=none");
  libvlc_media_add_option(m_media, ":vout=direct3d9");
  libvlc_media_add_option(m_media, ":http-user-agent=PusztaPlayer/0.7.0");
  libvlc_media_add_option(m_media, ":network-caching=1500");

  // Create player
  VTRACE("play: media_player_new_from_media about to call");
  m_mp = libvlc_media_player_new_from_media(m_media);
  VTRACE("play: media_player_new_from_media returned");
  if (!m_mp) {
    libvlc_media_release(m_media);
    m_media = nullptr;
    return;
  }

  // Set render target
  if (m_playerHwnd) {
    VTRACE("play: set_hwnd");
    libvlc_media_player_set_hwnd(m_mp, m_playerHwnd);
  }

  // Attach events
  VTRACE("play: attach events");
  auto em = libvlc_media_player_event_manager(m_mp);
  libvlc_event_attach(em, libvlc_MediaPlayerPlaying, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerPaused, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerStopped, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerEndReached, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerTimeChanged, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerLengthChanged, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerOpening, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerBuffering, OnMediaPlayerEvent, this);
  libvlc_event_attach(em, libvlc_MediaPlayerEncounteredError, OnMediaPlayerEvent, this);

  // Start playback
  VTRACE("play: media_player_play about to call");
  libvlc_media_player_play(m_mp);
  VTRACE("play: media_player_play returned");
  m_active = true;
  VTRACE("play: done");
}

void WindowsVideoPlayer::pause() {
  if (m_mp) {
    libvlc_media_player_pause(m_mp);
  }
}

void WindowsVideoPlayer::seek(int64_t timeMs) {
  if (m_mp) {
    libvlc_media_player_set_time(m_mp, timeMs);
  }
}

void WindowsVideoPlayer::setVolume(int vol) {
  if (m_mp) {
    libvlc_audio_set_volume(m_mp, vol);
  }
}

void WindowsVideoPlayer::setLayout(int x, int y, int w, int h) {
  m_layout = {x, y, x + w, y + h};
  if (m_playerHwnd) {
    SetWindowPos(m_playerHwnd, nullptr, x, y, w, h,
                 SWP_NOZORDER | SWP_NOACTIVATE);
  }
}

void WindowsVideoPlayer::destroy() {
  m_active = false;
  if (m_mp) {
    libvlc_media_player_stop(m_mp);
    libvlc_media_player_release(m_mp);
    m_mp = nullptr;
  }
  if (m_media) {
    libvlc_media_release(m_media);
    m_media = nullptr;
  }
  if (m_vlc) {
    libvlc_release(m_vlc);
    m_vlc = nullptr;
  }
  DestroyPlayerWindow();
}

void WindowsVideoPlayer::OnMediaPlayerEvent(
    const libvlc_event_t *event, void *data) {
  auto *self = reinterpret_cast<WindowsVideoPlayer *>(data);
  if (!self || !self->m_active) return;

  switch (event->type) {
    case libvlc_MediaPlayerOpening: self->OnOpening(); break;
    case libvlc_MediaPlayerPlaying: self->OnPlaying(); break;
    case libvlc_MediaPlayerPaused:  self->OnPaused(); break;
    case libvlc_MediaPlayerStopped: self->OnStopped(); break;
    case libvlc_MediaPlayerEndReached: self->OnEndReached(); break;
    case libvlc_MediaPlayerTimeChanged:
      self->OnTimeChanged(event->u.media_player_time_changed.new_time);
      break;
    case libvlc_MediaPlayerLengthChanged:
      self->OnLengthChanged(event->u.media_player_length_changed.new_length);
      break;
    case libvlc_MediaPlayerBuffering:
      self->OnBuffering(event->u.media_player_buffering.new_cache);
      break;
    case libvlc_MediaPlayerEncounteredError: self->OnError(); break;
    default: break;
  }
}

void WindowsVideoPlayer::OnOpening() {
  EmitProgress();
}

void WindowsVideoPlayer::OnPlaying() {
  EmitProgress();
  if (m_context) {
    try {
      int64_t length = libvlc_media_player_get_length(m_mp);
      unsigned w, h;
      libvlc_video_get_size(m_mp, 0, &w, &h);
      m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit",
        [length, w, h](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoLoad");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"duration");
          writer.WriteInt64(length);
          writer.WritePropertyName(L"width");
          writer.WriteInt64(w);
          writer.WritePropertyName(L"height");
          writer.WriteInt64(h);
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
    } catch (...) {}
  }
}

void WindowsVideoPlayer::OnPaused() {}

void WindowsVideoPlayer::OnStopped() {}

void WindowsVideoPlayer::OnEndReached() {
  if (m_context) {
    try {
      m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit",
        [](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoEnd");
          writer.WriteObjectBegin();
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
    } catch (...) {}
  }
}

void WindowsVideoPlayer::OnTimeChanged(int64_t newTime) {
  if (m_context) {
    try {
      int64_t length = libvlc_media_player_get_length(m_mp);
      m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit",
        [newTime, length](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoProgress");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"currentTime");
          writer.WriteInt64(newTime);
          writer.WritePropertyName(L"seekableDuration");
          writer.WriteInt64(length);
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
    } catch (...) {}
  }
}

void WindowsVideoPlayer::OnLengthChanged(int64_t newLength) {}

void WindowsVideoPlayer::OnBuffering(float cache) {
  bool isBuffering = cache < 100.0f;
  if (m_context) {
    try {
      m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit",
        [isBuffering](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoBuffer");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"isBuffer");
          writer.WriteBoolean(isBuffering);
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
    } catch (...) {}
  }
}

void WindowsVideoPlayer::OnError() {
  if (m_context) {
    try {
      m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit",
        [](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoError");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"message");
          writer.WriteString(L"Lejátszási hiba");
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
    } catch (...) {}
  }
}

void WindowsVideoPlayer::EmitProgress() {
  // Progress emitted via OnTimeChanged event
}

} // namespace PusztaPlay
