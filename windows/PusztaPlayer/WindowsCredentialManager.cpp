// WindowsCredentialManager.cpp
// Encrypted credential storage using Windows.Security.Credentials.PasswordVault.

#include "pch.h"
#include "WindowsCredentialManager.h"

#pragma push_macro("GetCurrentTime")
#undef GetCurrentTime

#include <winrt/Windows.Security.Credentials.h>
#include <winrt/Windows.Foundation.Collections.h>

namespace PusztaPlay {

using namespace winrt::Windows::Security::Credentials;

void WindowsCredentialManager::setItem(
    std::string key, std::string value,
    ::React::ReactPromise<void> &&result) noexcept {
  try {
    // Remove existing credential if present
    try {
      PasswordVault vault;
      auto creds = vault.FindAllByResource(winrt::to_hstring(key));
      for (auto const &c : creds) {
        vault.Remove(c);
      }
    } catch (...) {
      // Not found — that's fine
    }

    // Store new credential
    PasswordCredential cred(
        winrt::to_hstring(key),  // resource (our key)
        L"pusztaplay",           // username (placeholder)
        winrt::to_hstring(value)); // password (our value)
    PasswordVault vault;
    vault.Add(cred);
    result.Resolve();
  } catch (winrt::hresult_error const &e) {
    result.Reject(winrt::to_string(e.message()).c_str());
  }
}

void WindowsCredentialManager::getItem(
    std::string key,
    ::React::ReactPromise<std::string> &&result) noexcept {
  try {
    PasswordVault vault;
    auto creds = vault.FindAllByResource(winrt::to_hstring(key));
    if (creds.Size() > 0) {
      auto cred = creds.GetAt(0);
      cred.RetrievePassword();
      result.Resolve(winrt::to_string(cred.Password()));
    } else {
      result.Resolve(""); // empty string = not found
    }
  } catch (winrt::hresult_error const &e) {
    result.Reject(winrt::to_string(e.message()).c_str());
  } catch (...) {
    result.Resolve(""); // not found or error → empty
  }
}

void WindowsCredentialManager::removeItem(
    std::string key,
    ::React::ReactPromise<void> &&result) noexcept {
  try {
    PasswordVault vault;
    auto creds = vault.FindAllByResource(winrt::to_hstring(key));
    for (auto const &c : creds) {
      vault.Remove(c);
    }
    result.Resolve();
  } catch (winrt::hresult_error const &e) {
    result.Reject(winrt::to_string(e.message()).c_str());
  } catch (...) {
    result.Resolve(); // already gone
  }
}

} // namespace PusztaPlay
