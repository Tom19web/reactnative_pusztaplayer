// WindowsCredentialManager.h
// Encrypted credential storage using Windows.Security.Credentials.PasswordVault.
//
// Provides setItem / getItem / removeItem for secure Xtream credential storage.
// Used by storage.windows.ts as a replacement for react-native-encrypted-storage.

#pragma once
#include "pch.h"
#include <NativeModules.h>

namespace PusztaPlay {

REACT_MODULE(WindowsCredentialManager)
struct WindowsCredentialManager {
  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
    m_reactContext = reactContext;
  }

  REACT_METHOD(setItem)
  void setItem(std::string key, std::string value, ::React::ReactPromise<void> &&result) noexcept;

  REACT_METHOD(getItem)
  void getItem(std::string key, ::React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(removeItem)
  void removeItem(std::string key, ::React::ReactPromise<void> &&result) noexcept;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace PusztaPlay
