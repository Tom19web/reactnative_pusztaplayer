// WindowsVideoPlayer.h
// Video player using WinRT MediaPlayer via XAML Islands.
// Own STA thread with message pump for thread safety.

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

 private:
  void StartStaThread();
  void StopStaThread();
  void StaThreadProc();
  void CreatePlayerWindow();
  void DestroyPlayerWindow();

  void OnMediaOpened(winrt::Windows::Foundation::IInspectable const &, winrt::Windows::Foundation::IInspectable const &);
  void OnMediaFailed(winrt::Windows::Foundation::IInspectable const &, winrt::Windows::Media::Playback::MediaPlayerFailedEventArgs const &);
  void OnMediaEnded(winrt::Windows::Foundation::IInspectable const &, winrt::Windows::Foundation::IInspectable const &);

  void Dispatch(std::function<void()> fn);

  HWND m_playerHwnd{nullptr};
  HWND m_parentHwnd{nullptr};
  winrt::Windows::UI::Xaml::Hosting::DesktopWindowXamlSource m_xamlSource{nullptr};
  winrt::Windows::UI::Xaml::Controls::MediaPlayerElement m_playerElement{nullptr};
  winrt::Windows::Media::Playback::MediaPlayer m_player{nullptr};
  winrt::Windows::UI::Xaml::Hosting::WindowsXamlManager m_xamlManager{nullptr};
  winrt::Microsoft::ReactNative::IReactContext m_context{nullptr};
  RECT m_layout{0, 0, 0, 0};
  std::atomic<bool> m_active{false};

  winrt::event_token m_mediaOpenedToken;
  winrt::event_token m_mediaFailedToken;
  winrt::event_token m_mediaEndedToken;

  // STA thread
  std::thread m_staThread;
  std::mutex m_mutex;
  std::queue<std::function<void()>> m_queue;
  HANDLE m_wakeEvent{nullptr};
  bool m_staRunning{false};
};

} // namespace PusztaPlay
