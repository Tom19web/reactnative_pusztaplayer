#include "pch.h"
#include "WindowsPrompt.h"

namespace PusztaPlay {

void WindowsPrompt::SetReactContext(winrt::Microsoft::ReactNative::IReactContext const &context) noexcept {
  m_context = context;
}

// Dialog procedure
static INT_PTR CALLBACK PromptDlgProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_INITDIALOG: {
      // Center on parent
      RECT rcDlg, rcParent;
      GetWindowRect(hDlg, &rcDlg);
      HWND hParent = GetParent(hDlg);
      if (!hParent) hParent = GetDesktopWindow();
      GetWindowRect(hParent, &rcParent);
      int x = rcParent.left + (rcParent.right - rcParent.left - (rcDlg.right - rcDlg.left)) / 2;
      int y = rcParent.top + (rcParent.height() - (rcDlg.bottom - rcDlg.top)) / 2;
      SetWindowPos(hDlg, nullptr, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);

      // Set default text
      auto edit = GetDlgItem(hDlg, 1001);
      if (edit) {
        SetFocus(edit);
        return FALSE; // let focus be set
      }
      return TRUE;
    }
    case WM_COMMAND:
      if (LOWORD(wParam) == IDOK || LOWORD(wParam) == IDCANCEL) {
        EndDialog(hDlg, LOWORD(wParam));
        return TRUE;
      }
      break;
  }
  return FALSE;
}

void WindowsPrompt::Show(winrt::hstring title, winrt::hstring message, winrt::hstring defaultText,
                         std::function<void(winrt::hstring const &)> const &resolve) noexcept {
  // Create a simple dialog with an edit control
  HWND hParent = nullptr;
  if (m_context) {
    // Try to get the top-level window
    auto props = m_context.Properties();
    auto windowId = props.Get(winrt::Microsoft::ReactNative::ReactPropertyBagHelper::CreatePropertyId(
        L"ReactNative.Fabric", L"TopLevelWindowId"));
    if (windowId) {
      hParent = reinterpret_cast<HWND>(static_cast<uint64_t>(windowId));
    }
  }

  // Register a simple dialog class
  static const wchar_t *kDlgClass = L"PusztaPromptDlg";
  static bool registered = false;
  if (!registered) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = DefDlgProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = kDlgClass;
    RegisterClassExW(&wc);
    registered = true;
  }

  // Create a modeless dialog first to calculate layout
  HINSTANCE hInst = GetModuleHandleW(nullptr);

  // We'll use a simple approach: create the dialog inline with CreateWindow
  // Actually, let's use DialogBoxParam with a template

  // Create dialog template in memory
  struct DlgTemplate {
    DLGTEMPLATE dlg;
    WORD _menu;
    WORD _class;
    WORD _title[1];
  };

  // Build a custom dialog using DialogBox
  // For simplicity, create a window with controls manually
  auto dlg = CreateDialogParamW(hInst, MAKEINTRESOURCEW(-1), hParent, PromptDlgProc, 0);
  if (!dlg) {
    resolve(L"");
    return;
  }

  // Add static text
  CreateWindowW(L"STATIC", message.c_str(), WS_CHILD | WS_VISIBLE | SS_LEFT,
                15, 15, 350, 20, dlg, nullptr, hInst, nullptr);

  // Add edit control
  CreateWindowW(L"EDIT", defaultText.c_str(), WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL,
                15, 40, 350, 25, dlg, (HMENU)1001, hInst, nullptr);

  // Add buttons
  CreateWindowW(L"BUTTON", L"OK", WS_CHILD | WS_VISIBLE | BS_DEFPUSHBUTTON,
                100, 75, 80, 25, dlg, (HMENU)IDOK, hInst, nullptr);
  CreateWindowW(L"BUTTON", L"M�gsem", WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                200, 75, 80, 25, dlg, (HMENU)IDCANCEL, hInst, nullptr);

  // Center and size
  SetWindowPos(dlg, nullptr, 0, 0, 400, 120, SWP_NOMOVE | SWP_NOZORDER);
  CenterWindow(dlg, hParent);
  ShowWindow(dlg, SW_SHOW);

  // Run modal loop
  MSG msg;
  INT_PTR result = 0;
  while (IsWindow(dlg) && (result = DialogBoxParamW(hInst, MAKEINTRESOURCEW(-1), hParent, PromptDlgProc, 0)) == 0) {
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      if (!IsDialogMessage(dlg, &msg)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
    }
  }

  wchar_t text[4096];
  GetDlgItemTextW(dlg, 1001, text, 4096);
  winrt::hstring resultText{text};
  DestroyWindow(dlg);

  resolve(resultText);
}

} // namespace PusztaPlay
