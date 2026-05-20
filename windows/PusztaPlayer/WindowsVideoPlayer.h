// WindowsVideoPlayer.h
// Video player using libVLC C API. Renders video to a child HWND overlay window.
//
// Managed as a TurboModule, controlled from JS via:
//   play(source: string) -> void
//   pause() -> void
//   seek(timeMs: number) -> void
//   setVolume(vol: number) -> void
//   setLayout(x, y, w, h) -> void
//   destroy() -> void
//
// Events (emitted to JS via DeviceEventEmitter):
//   onProgress: { currentTime, duration }
//   onLoad: { duration, width, height }
//   onError: { message }
//   onEnd: {}
//   onBuffer: { isBuffering }

#pragma once
#include "pch.h"

struct libvlc_instance_t;
struct libvlc_media_player_t;
struct libvlc_media_t;
struct libvlc_event_t;
struct libvlc_event_manager_t;

namespace PusztaPlay {

class WindowsVideoPlayer {
 public:
  static WindowsVideoPlayer &Instance();
  WindowsVideoPlayer();
  ~WindowsVideoPlayer();

  void play(const std::wstring &source);
  void pause();
  void seek(int64_t timeMs);
  void setVolume(int vol); // 0-100
  void setLayout(int x, int y, int w, int h);
  void destroy();

  // Store ReactContext for emitting events
  void SetReactContext(winrt::Microsoft::ReactNative::IReactContext const &context);

 private:
  void CreatePlayerWindow();
  void DestroyPlayerWindow();
  void EmitProgress();
  static void OnMediaPlayerEvent(const libvlc_event_t *event, void *data);
  static LRESULT CALLBACK PlayerWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

  HWND m_playerHwnd{nullptr};
  HWND m_parentHwnd{nullptr};
  libvlc_instance_t *m_vlc{nullptr};
  libvlc_media_player_t *m_mp{nullptr};
  libvlc_media_t *m_media{nullptr};
  winrt::Microsoft::ReactNative::IReactContext m_context{nullptr};
  RECT m_layout{0, 0, 0, 0};
  bool m_active{false};

  // Event callbacks from libVLC
  void OnOpening();
  void OnPlaying();
  void OnPaused();
  void OnStopped();
  void OnEndReached();
  void OnTimeChanged(int64_t newTime);
  void OnLengthChanged(int64_t newLength);
  void OnBuffering(float cache);
  void OnError();
};

} // namespace PusztaPlay
