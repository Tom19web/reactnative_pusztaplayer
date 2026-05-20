// WindowsVideoPlayer.cpp
// Media Foundation IMFMediaEngine for direct HWND video rendering.

#include "pch.h"
#include "WindowsVideoPlayer.h"
#include <mfapi.h>
#include <mfmediaengine.h>
#include <Mferror.h>

#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")

using namespace winrt::Microsoft::ReactNative;

namespace PusztaPlay {

// ─── IMFMediaEngineNotify callback ────────────────────

class MediaEngineCallback : public IMFMediaEngineNotify {
  volatile ULONG m_ref{1};
  WindowsVideoPlayer *m_player{nullptr};

 public:
  MediaEngineCallback(WindowsVideoPlayer *player) : m_player(player) {}

  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&m_ref); }
  STDMETHODIMP_(ULONG) Release() override {
    ULONG r = InterlockedDecrement(&m_ref);
    if (r == 0) delete this;
    return r;
  }
  STDMETHODIMP QueryInterface(REFIID riid, void **ppv) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IMFMediaEngineNotify)) {
      *ppv = static_cast<IMFMediaEngineNotify *>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }

  STDMETHODIMP EventNotify(DWORD event, DWORD_PTR param1, DWORD param2) override {
    auto ctx = m_player->GetContext();
    if (!ctx) return S_OK;

    switch (event) {
      case MF_MEDIA_ENGINE_EVENT_LOADEDMETADATA:
      case MF_MEDIA_ENGINE_EVENT_FIRSTFRAMEREADY:
      case MF_MEDIA_ENGINE_EVENT_CANPLAY:
        if (auto engine = m_player->GetEngine()) {
          double dur = engine->GetDuration();
          DWORD vw = 0, vh = 0;
          engine->GetNativeVideoSize(&vw, &vh);
          ctx.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [dur, vw, vh](IJSValueWriter const &writer) {
            writer.WriteArrayBegin();
            writer.WriteString(L"onVideoLoad");
            writer.WriteObjectBegin();
            writer.WritePropertyName(L"duration");
            writer.WriteDouble(dur);
            writer.WritePropertyName(L"width");
            writer.WriteInt64(vw);
            writer.WritePropertyName(L"height");
            writer.WriteInt64(vh);
            writer.WriteObjectEnd();
            writer.WriteArrayEnd();
          });
        }
        break;
      case MF_MEDIA_ENGINE_EVENT_ENDED:
        ctx.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoEnd");
          writer.WriteObjectBegin();
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
        break;
      case MF_MEDIA_ENGINE_EVENT_ERROR:
        ctx.EmitJSEvent(L"RCTDeviceEventEmitter", L"emit", [param1](IJSValueWriter const &writer) {
          writer.WriteArrayBegin();
          writer.WriteString(L"onVideoError");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"error");
          writer.WriteString(L"Media Engine error");
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
        break;
    }
    return S_OK;
  }
};

// ─── Singleton ─────────────────────────────────────────

WindowsVideoPlayer &WindowsVideoPlayer::Instance() {
  static WindowsVideoPlayer instance;
  return instance;
}

WindowsVideoPlayer::WindowsVideoPlayer() {
  m_wakeEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
}

WindowsVideoPlayer::~WindowsVideoPlayer() {}

void WindowsVideoPlayer::SetReactContext(IReactContext const &context) {
  m_context = context;
  if (!m_parentHwnd)
    m_parentHwnd = GetForegroundWindow();
}

// ─── STA Thread ────────────────────────────────────────

void WindowsVideoPlayer::StartStaThread() {
  if (m_staRunning) return;
  m_staThread = std::thread(&WindowsVideoPlayer::StaThreadProc, this);
}

void WindowsVideoPlayer::StopStaThread() {
  m_staRunning = false;
  SetEvent(m_wakeEvent);
  if (m_staThread.joinable()) m_staThread.join();
  if (m_wakeEvent) { CloseHandle(m_wakeEvent); m_wakeEvent = nullptr; }
}

void WindowsVideoPlayer::StaThreadProc() {
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

  HRESULT hr = MFStartup(MF_VERSION, MFSTARTUP_LITE);
  if (SUCCEEDED(hr)) m_mfStarted = true;

  m_staRunning = true;

  while (m_staRunning) {
    MSG msg;
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }

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

  DestroyVideoWindow();
  if (m_factory) { m_factory->Release(); m_factory = nullptr; }
  if (m_engine) { m_engine->Release(); m_engine = nullptr; }
  if (m_mfStarted) { MFShutdown(); m_mfStarted = false; }
  CoUninitialize();
}

// ─── Dispatch ───────────────────────────────────────────

void WindowsVideoPlayer::Dispatch(std::function<void()> fn) {
  std::lock_guard<std::mutex> lock(m_mutex);
  m_queue.push(std::move(fn));
  SetEvent(m_wakeEvent);
}

// ─── Public API ─────────────────────────────────────────

void WindowsVideoPlayer::play(const std::wstring &source) {
  if (!m_staRunning) { StartStaThread(); while (!m_staRunning) Sleep(10); }
  m_active = true;
  Dispatch([this, source]() {
    if (m_engine) { m_engine->Shutdown(); m_engine->Release(); m_engine = nullptr; }
    DestroyVideoWindow();
    CreateVideoWindow();

    if (!m_factory) {
      CoCreateInstance(CLSID_MFMediaEngineClassFactory, nullptr,
                       CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&m_factory));
    }
    if (!m_factory) return;

    auto *cb = new MediaEngineCallback(this);

    IMFAttributes *attrs = nullptr;
    MFCreateAttributes(&attrs, 2);
    attrs->SetUnknown(MF_MEDIA_ENGINE_CALLBACK, cb);
    attrs->SetUINT64(MF_MEDIA_ENGINE_PLAYBACK_HWND, (UINT64)m_videoHwnd);
    cb->Release();

    IMFMediaEngine *rawEngine = nullptr;
    HRESULT hr = m_factory->CreateInstance(0, attrs, &rawEngine);
    attrs->Release();
    if (FAILED(hr) || !rawEngine) return;

    hr = rawEngine->QueryInterface(IID_PPV_ARGS(&m_engine));
    rawEngine->Release();
    if (FAILED(hr) || !m_engine) return;

    auto ws = BSTR(source.c_str());
    hr = m_engine->SetSource(ws);
    if (FAILED(hr)) return;
    m_engine->Play();
  });
}

void WindowsVideoPlayer::pause() {
  Dispatch([this]() {
    if (!m_engine) return;
    m_engine->Pause();
  });
}

void WindowsVideoPlayer::seek(int64_t timeMs) {
  Dispatch([this, timeMs]() {
    if (!m_engine) return;
    m_engine->SetCurrentTime(static_cast<double>(timeMs) / 1000.0);
  });
}

void WindowsVideoPlayer::setVolume(int vol) {
  Dispatch([this, vol]() {
    if (!m_engine) return;
    m_engine->SetVolume(vol / 100.0);
  });
}

void WindowsVideoPlayer::setLayout(int x, int y, int w, int h) {
  m_layout = {x, y, x + w, y + h};
  Dispatch([this, x, y, w, h]() {
    if (m_videoHwnd)
      SetWindowPos(m_videoHwnd, nullptr, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
  });
}

void WindowsVideoPlayer::destroy() {
  m_active = false;
  Dispatch([this]() {
    if (m_engine) { m_engine->Shutdown(); m_engine->Release(); m_engine = nullptr; }
    DestroyVideoWindow();
  });
}

// ─── Video Window ───────────────────────────────────────

void WindowsVideoPlayer::CreateVideoWindow() {
  if (m_videoHwnd) return;
  if (!m_parentHwnd) return;

  int w = m_layout.right - m_layout.left; if (w <= 0) w = 640;
  int h = m_layout.bottom - m_layout.top; if (h <= 0) h = 480;

  m_videoHwnd = CreateWindowExW(0, L"STATIC", L"",
      WS_POPUP | WS_VISIBLE,
      m_layout.left, m_layout.top, w, h,
      nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);

  if (m_videoHwnd) {
    SetWindowPos(m_videoHwnd, m_parentHwnd, m_layout.left, m_layout.top, w, h,
                 SWP_NOACTIVATE);
    ShowWindow(m_videoHwnd, SW_SHOW);
  }
}

void WindowsVideoPlayer::DestroyVideoWindow() {
  if (m_videoHwnd) { DestroyWindow(m_videoHwnd); m_videoHwnd = nullptr; }
}

} // namespace PusztaPlay
