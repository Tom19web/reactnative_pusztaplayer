// WindowsVideoPlayer.h
// Media Foundation IMFMediaEngine — direct HWND video rendering.
// STA thread + message pump, WS_POPUP window above Fabric Composition.

#pragma once
#include "pch.h"
#include <functional>
#include <queue>
#include <mutex>
#include <thread>

namespace PusztaPlay {

class WindowsVideoPlayer {
 public:
  static WindowsVideoPlayer &Instance();
  WindowsVideoPlayer();
  ~WindowsVideoPlayer();

  void play(const std::wstring &source);
  void pause();
  void seek(int64_t timeMs);
  void setVolume(int vol);
  void setLayout(int x, int y, int w, int h);
  void destroy();

  void SetReactContext(winrt::Microsoft::ReactNative::IReactContext const &context);

  // Exposed for MediaEngineCallback
  winrt::Microsoft::ReactNative::IReactContext const &GetContext() const { return m_context; }
  IMFMediaEngineEx *GetEngine() const { return m_engine; }

 private:
  void StartStaThread();
  void StopStaThread();
  void StaThreadProc();
  void CreateVideoWindow();
  void DestroyVideoWindow();
  void Dispatch(std::function<void()> fn);

  HWND m_videoHwnd{nullptr};
  HWND m_parentHwnd{nullptr};
  IMFMediaEngineEx *m_engine{nullptr};
  IMFMediaEngineClassFactory *m_factory{nullptr};
  winrt::Microsoft::ReactNative::IReactContext m_context{nullptr};
  RECT m_layout{0, 0, 0, 0};
  bool m_active{false};

  std::thread m_staThread;
  std::mutex m_mutex;
  std::queue<std::function<void()>> m_queue;
  HANDLE m_wakeEvent{nullptr};
  bool m_staRunning{false};
  bool m_mfStarted{false};
};

} // namespace PusztaPlay
