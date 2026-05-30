// ReactPackageProvider.h
// Registers custom native modules for the PusztaPlayer Windows app.
//
// Native modules defined in this project:
//   1. WindowsKeyboardManager - Keyboard + Xbox controller -> onHWKeyEvent
//   2. WindowsCredentialManager - PasswordVault credential storage
//
// The modules are discovered via C++/WinRT attributes and registered
// through AddAttributedModules in the package provider.

#pragma once
#include "pch.h"

using namespace winrt::Microsoft::ReactNative;

// Package provider that registers all custom native modules
struct PusztaPlayerReactPackageProvider
    : winrt::implements<PusztaPlayerReactPackageProvider, IReactPackageProvider> {
 public:
  void CreatePackage(IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};
