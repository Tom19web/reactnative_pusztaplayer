// WindowsKeyboardManager.cpp
// Low-level keyboard hook for PusztaPlayer Windows app.

#include "pch.h"
#include "WindowsKeyboardManager.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winrt/Microsoft.ReactNative.h>

namespace PusztaPlay {

using namespace winrt::Microsoft::ReactNative;

static WindowsKeyboardManager *g_mgr = nullptr;

WindowsKeyboardManager &WindowsKeyboardManager::Instance() {
  static WindowsKeyboardManager instance;
  return instance;
}

WindowsKeyboardManager::~WindowsKeyboardManager() {
  Uninstall();
}

void WindowsKeyboardManager::SetReactContext(IReactContext const &context) {
  m_context = context;
}

void WindowsKeyboardManager::Install() {
  if (m_hook) return;
  g_mgr = this;
  m_hook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc,
                              GetModuleHandleW(nullptr), 0);
}

void WindowsKeyboardManager::Uninstall() {
  if (m_hook) {
    UnhookWindowsHookEx(m_hook);
    m_hook = nullptr;
  }
  m_context = nullptr;
  g_mgr = nullptr;
}

LRESULT CALLBACK WindowsKeyboardManager::LowLevelKeyboardProc(
    int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode != HC_ACTION || !g_mgr) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  auto *pKb = reinterpret_cast<KBDLLHOOKSTRUCT *>(lParam);
  bool keyDown = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
  bool keyUp = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);

  if (!keyDown && !keyUp) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  const wchar_t *eventType = nullptr;
  DWORD vk = pKb->vkCode;

  // Ignore injected events from our own process to avoid loops
  if (pKb->flags & LLKHF_INJECTED) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  // Map VK codes
  switch (vk) {
    case VK_LEFT:   eventType = L"left"; break;
    case VK_RIGHT:  eventType = L"right"; break;
    case VK_UP:     eventType = L"up"; break;
    case VK_DOWN:   eventType = L"down"; break;
    case VK_RETURN: eventType = L"enter"; break;
    case VK_SPACE:  eventType = L"playPause"; break;
    case VK_ESCAPE: eventType = L"back"; break;
    case VK_BACK:   eventType = L"back"; break;
    case VK_DELETE: eventType = L"menu"; break;
    case VK_MEDIA_PLAY_PAUSE: eventType = L"playPause"; break;
    case VK_MEDIA_NEXT_TRACK: eventType = L"fastForward"; break;
    case VK_MEDIA_PREV_TRACK: eventType = L"rewind"; break;
    case 'F': case 'f': eventType = L"fastForward"; break;
    case 'R': case 'r': eventType = L"rewind"; break;
    case 'P': case 'p': eventType = L"playPause"; break;
    case 'M': case 'm': eventType = L"menu"; break;
    default: break;
  }

  if (eventType && keyDown) {
    g_mgr->EmitKeyEvent(eventType, 0);
  } else if (eventType && keyUp) {
    // For rewind/ff via media keys or F/R, emit up for hold-to-scrub
    switch (vk) {
      case VK_MEDIA_NEXT_TRACK:
      case VK_MEDIA_PREV_TRACK:
      case 'F': case 'f':
      case 'R': case 'r':
        g_mgr->EmitKeyEvent(eventType, 1);
        break;
    }
  }

  // Don't swallow keys — let the app handle them normally
  return CallNextHookEx(nullptr, nCode, wParam, lParam);
}

void WindowsKeyboardManager::EmitKeyEvent(const wchar_t *eventType,
                                          int action) {
  if (!eventType || !m_context) return;

  try {
    winrt::hstring typeStr(eventType);

    m_context.EmitJSEvent(
        L"RCTDeviceEventEmitter",
        L"emit",
        [typeStr, action](IJSValueWriter const &writer) {
          // Write: ["onHWKeyEvent", {eventType, eventKeyAction}]
          writer.WriteArrayBegin();
          writer.WriteString(L"onHWKeyEvent");
          writer.WriteObjectBegin();
          writer.WritePropertyName(L"eventType");
          writer.WriteString(typeStr);
          writer.WritePropertyName(L"eventKeyAction");
          writer.WriteInt64(action);
          writer.WriteObjectEnd();
          writer.WriteArrayEnd();
        });
  } catch (...) {
    // Ignore if JS bridge not ready
  }
}

} // namespace PusztaPlay
