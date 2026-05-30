// WindowsKeyboardManager.h
// Low-level keyboard hook for PusztaPlayer Windows app.
//
// Uses SetWindowsHookEx(WH_KEYBOARD_LL) to capture all keyboard events.
// Emits onHWKeyEvent to JS via IReactContext::EmitJSEvent.
//
// Key mappings (Win32 VK → eventType):
//   Arrow keys                 → up / down / left / right
//   Space / VK_MEDIA_PLAY_PAUSE → playPause
//   Escape / Back              → back
//   Delete / M                 → menu
//   F / VK_MEDIA_NEXT_TRACK    → fastForward
//   R / VK_MEDIA_PREV_TRACK    → rewind
//   Enter                      → enter

#pragma once
#include "pch.h"

namespace PusztaPlay {

class WindowsKeyboardManager {
 public:
  static WindowsKeyboardManager &Instance();
  void SetReactContext(winrt::Microsoft::ReactNative::IReactContext const &context);
  void Install();
  void Uninstall();
  bool IsInstalled() const { return m_hook != nullptr; }

 private:
  WindowsKeyboardManager() = default;
  ~WindowsKeyboardManager();
  WindowsKeyboardManager(const WindowsKeyboardManager &) = delete;
  WindowsKeyboardManager &operator=(const WindowsKeyboardManager &) = delete;

  static LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam);
  void EmitKeyEvent(const wchar_t *eventType, int action);

  HHOOK m_hook{nullptr};
  winrt::Microsoft::ReactNative::IReactContext m_context{nullptr};
};

} // namespace PusztaPlay
