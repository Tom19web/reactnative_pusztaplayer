#pragma once
#include <string>
#include <winrt/Microsoft.ReactNative.h>

namespace PusztaPlay {

struct WindowsPrompt {
  WindowsPrompt() = default;

  void SetReactContext(winrt::Microsoft::ReactNative::IReactContext const &context) noexcept;
  void Show(winrt::hstring title, winrt::hstring message, winrt::hstring defaultText,
            std::function<void(winrt::hstring const &)> const &resolve) noexcept;

private:
  winrt::Microsoft::ReactNative::IReactContext m_context{nullptr};
  winrt::hstring m_result;
};

} // namespace PusztaPlay
