// WindowsVideoPlayer.cpp
// WinRT MediaPlayer via XAML Islands on dedicated STA thread.

#include "pch.h"
#include "WindowsVideoPlayer.h"

using namespace winrt::Microsoft::ReactNative;

namespace PusztaPlay {

struct __declspec(uuid("3CBDBEB7-6EA3-52B4-96E3-8E3E0E27BD14"))
IDesktopWindowXamlSourceNative : ::IUnknown {
  virtual HRESULT __stdcall get_WindowHandle(HWND *value) = 0;
};

// IInitializeWithWindow - {3E68D4BD-7135-4D10-8018-9FB6D9F33FA1}
struct __declspec(uuid("3E68D4BD-7135-4D10-8018-9FB6D9F33FA1"))
IInitializeWithWindow : ::IUnknown {
  virtual HRESULT __stdcall Initialize(HWND hwnd) = 0;
};

WindowsVideoPlayer &WindowsVideoPlayer::Instance() {
  static WindowsVideoPlayer instance;
  return instance;
}

WindowsVideoPlayer::WindowsVideoPlayer() {
  m_wakeEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
}

WindowsVideoPlayer::~WindowsVideoPlayer() { /* OS cleanup */ }

void WindowsVideoPlayer::SetReactContext(IReactContext const &context) {
  m_context = context;
  if (!m_parentHwnd) {
    m_parentHwnd = GetForegroundWindow();
    OutputDebugStringW((L"[VP] parent HWND=" + std::to_wstring(reinterpret_cast<uintptr_t>(m_parentHwnd)) + L"\n").c_str());
  }
}

// ─── STA Thread ────────────────────────────────────────

void WindowsVideoPlayer::StartStaThread() {
  if (m_staRunning) return;
  m_staRunning = true;
  m_active = true;
  m_staThread = std::thread(&WindowsVideoPlayer::StaThreadProc, this);
}

void WindowsVideoPlayer::StopStaThread() {
  m_active = false;
  m_staRunning = false;
  SetEvent(m_wakeEvent);
  if (m_staThread.joinable()) m_staThread.join();
  if (m_wakeEvent) { CloseHandle(m_wakeEvent); m_wakeEvent = nullptr; }
}

void WindowsVideoPlayer::StaThreadProc() {
  OutputDebugStringW(L"[VP] STA thread started\n");
  winrt::init_apartment(winrt::apartment_type::single_threaded);
  OutputDebugStringW(L"[VP] init_apartment done\n");
  m_xamlManager = winrt::Windows::UI::Xaml::Hosting::WindowsXamlManager::InitializeForCurrentThread();
  OutputDebugStringW(L"[VP] XamlManager initialized\n");
  m_staRunning = true;

  while (m_staRunning) {
    // Pump Windows messages (required for XAML Island + MediaPlayerElement)
    MSG msg;
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }

    // Drain work queue
    std::function<void()> fn;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      if (!m_queue.empty()) {
        fn = std::move(m_queue.front());
        m_queue.pop();
      }
    }
    if (fn) {
      try { fn(); } catch (...) {}
    } else {
      MsgWaitForMultipleObjectsEx(1, &m_wakeEvent, INFINITE, QS_ALLINPUT, 0);
    }
  }

  // Cleanup XAML on STA thread
  if (m_player) {
    m_player.MediaOpened(m_mediaOpenedToken);
    m_player.MediaFailed(m_mediaFailedToken);
    m_player.MediaEnded(m_mediaEndedToken);
  }
  DestroyPlayerWindow();
  m_player = nullptr;
  m_playerElement = nullptr;
  m_xamlSource = nullptr;
  if (m_xamlManager) { m_xamlManager.Close(); m_xamlManager = nullptr; }
  m_staRunning = false;
  winrt::uninit_apartment();
}

// ─── Dispatch helper ───────────────────────────────────

void WindowsVideoPlayer::Dispatch(std::function<void()> fn) {
  std::lock_guard<std::mutex> lock(m_mutex);
  m_queue.push(std::move(fn));
  SetEvent(m_wakeEvent);
}

// ─── Public API (dispatches to STA thread) ─────────────

void WindowsVideoPlayer::play(const std::wstring &source) {
  OutputDebugStringW(L"[VP] play called\n");
  if (!m_staRunning) { StartStaThread(); while (!m_staRunning) std::this_thread::sleep_for(std::chrono::milliseconds(10)); }
  OutputDebugStringW(L"[VP] STA ready, dispatching\n");
  m_active = true;
  Dispatch([this, source]() {
    if (m_player) {
      m_player.MediaOpened(m_mediaOpenedToken);
      m_player.MediaFailed(m_mediaFailedToken);
      m_player.MediaEnded(m_mediaEndedToken);
    }
    DestroyPlayerWindow();
    m_xamlSource = nullptr;
    m_playerElement = nullptr;
    m_player = nullptr;
    CreatePlayerWindow();
    if (!m_player) return;
    auto uri = winrt::Windows::Foundation::Uri(source);
    m_player.Source(winrt::Windows::Media::Core::MediaSource::CreateFromUri(uri));
    if (m_player) m_player.Play();
    OutputDebugStringW(L"[VP] play started\n");
  });
}

void WindowsVideoPlayer::pause() {
  Dispatch([this]() {
    if (!m_player) return;
    auto state = m_player.PlaybackSession().PlaybackState();
    if (state == winrt::Windows::Media::Playback::MediaPlaybackState::Playing)
      m_player.Pause();
    else
      m_player.Play();
  });
}

void WindowsVideoPlayer::seek(int64_t timeMs) {
  Dispatch([this, timeMs]() {
    if (!m_player) return;
    m_player.PlaybackSession().Position(std::chrono::milliseconds(timeMs));
  });
}

void WindowsVideoPlayer::setVolume(int vol) {
  Dispatch([this, vol]() {
    if (!m_player) return;
    m_player.Volume(vol / 100.0);
  });
}

void WindowsVideoPlayer::setLayout(int x, int y, int w, int h) {
  m_layout = {x, y, x + w, y + h};
  Dispatch([this, x, y, w, h]() {
    if (m_playerHwnd)
      SetWindowPos(m_playerHwnd, nullptr, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
  });
}

void WindowsVideoPlayer::destroy() {
  m_active = false;
  if (m_staRunning) {
    Dispatch([this]() {
      if (m_player) {
        m_player.MediaOpened(m_mediaOpenedToken);
        m_player.MediaFailed(m_mediaFailedToken);
        m_player.MediaEnded(m_mediaEndedToken);
      }
      DestroyPlayerWindow();
    });
  }
}

// ─── XAML Island window ────────────────────────────────

void WindowsVideoPlayer::CreatePlayerWindow() {
  if (m_xamlSource) return;
  if (!m_parentHwnd) { OutputDebugStringW(L"[VP] no parent HWND\n"); return; }
  OutputDebugStringW(L"[VP] CreatePlayerWindow start\n");

  OutputDebugStringW(L"[VP] creating DesktopWindowXamlSource...\n");
  try {
    m_xamlSource = winrt::Windows::UI::Xaml::Hosting::DesktopWindowXamlSource();
    OutputDebugStringW(L"[VP] DesktopWindowXamlSource created\n");
  } catch (winrt::hresult_error const &e) {
    auto msg = L"[VP] DesktopWindowXamlSource HRESULT: 0x" + std::to_wstring(static_cast<uint32_t>(e.code())) + L"\n";
    OutputDebugStringW(msg.c_str());
    return;
  } catch (...) {
    OutputDebugStringW(L"[VP] DesktopWindowXamlSource unknown exception\n");
    return;
  }

  m_playerElement = winrt::Windows::UI::Xaml::Controls::MediaPlayerElement();
  m_player = winrt::Windows::Media::Playback::MediaPlayer();
  m_playerElement.SetMediaPlayer(m_player);
  m_playerElement.AreTransportControlsEnabled(true);

  int w = m_layout.right - m_layout.left;
  int h = m_layout.bottom - m_layout.top;
  if (w <= 0) w = 640;
  if (h <= 0) h = 480;
  m_playerElement.Width(w);
  m_playerElement.Height(h);

  // Content() creates the internal HWND — must set BEFORE querying the handle
  m_xamlSource.Content(m_playerElement);
  OutputDebugStringW(L"[VP] Content set\n");

  // Now the internal HWND exists — get it (may throw E_NOINTERFACE)
  try {
    auto interop = m_xamlSource.as<IDesktopWindowXamlSourceNative>();
    if (interop) {
      interop->get_WindowHandle(&m_playerHwnd);
    }
  } catch (...) {
    OutputDebugStringW(L"[VP] get_WindowHandle failed (no interop)\n");
  }
  if (m_playerHwnd) {
    OutputDebugStringW((L"[VP] XAML HWND=" + std::to_wstring(reinterpret_cast<uintptr_t>(m_playerHwnd)) + L"\n").c_str());
    SetParent(m_playerHwnd, m_parentHwnd);
    SetWindowLongPtrW(m_playerHwnd, GWL_STYLE,
                      GetWindowLongPtrW(m_playerHwnd, GWL_STYLE) | WS_CHILD | WS_VISIBLE);
    SetWindowPos(m_playerHwnd, nullptr, m_layout.left, m_layout.top, w, h,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    ShowWindow(m_playerHwnd, SW_SHOW);
    OutputDebugStringW(L"[VP] XAML Island parented and shown\n");
  } else {
    OutputDebugStringW(L"[VP] no XAML HWND\n");
  }

  m_mediaOpenedToken = m_player.MediaOpened({this, &WindowsVideoPlayer::OnMediaOpened});
  m_mediaFailedToken = m_player.MediaFailed({this, &WindowsVideoPlayer::OnMediaFailed});
  m_mediaEndedToken = m_player.MediaEnded({this, &WindowsVideoPlayer::OnMediaEnded});
}

void WindowsVideoPlayer::DestroyPlayerWindow() {
  if (m_playerHwnd) { DestroyWindow(m_playerHwnd); m_playerHwnd = nullptr; }
  m_xamlSource = nullptr;
  m_playerElement = nullptr;
  m_player = nullptr;
}

// ─── Events ────────────────────────────────────────────

void WindowsVideoPlayer::OnMediaOpened(
    winrt::Windows::Foundation::IInspectable const &,
    winrt::Windows::Foundation::IInspectable const &) {
  if (!m_context) return;
  m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [](IJSValueWriter const &w) {
    w.WriteArrayBegin();
    w.WriteString(L"onVideoLoad");
    w.WriteObjectBegin();
    w.WriteObjectEnd();
    w.WriteArrayEnd();
  });
}

void WindowsVideoPlayer::OnMediaFailed(
    winrt::Windows::Foundation::IInspectable const &,
    winrt::Windows::Media::Playback::MediaPlayerFailedEventArgs const &args) {
  if (!m_context) return;
  auto msg = winrt::to_string(args.ErrorMessage());
  m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [&msg](IJSValueWriter const &w) {
    w.WriteArrayBegin();
    w.WriteString(L"onVideoError");
    w.WriteObjectBegin();
    w.WritePropertyName(L"error");
    w.WriteString(winrt::to_hstring(msg));
    w.WriteObjectEnd();
    w.WriteArrayEnd();
  });
}

void WindowsVideoPlayer::OnMediaEnded(
    winrt::Windows::Foundation::IInspectable const &,
    winrt::Windows::Foundation::IInspectable const &) {
  if (!m_context) return;
  m_context.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [](IJSValueWriter const &w) {
    w.WriteArrayBegin();
    w.WriteString(L"onVideoEnd");
    w.WriteObjectBegin();
    w.WriteObjectEnd();
    w.WriteArrayEnd();
  });
}

} // namespace PusztaPlay
