// NativeModules.h
// Custom native modules for PusztaPlayer Windows app.
//
// TODO: Implement these modules after installing Visual Studio 2022 with C++ tools.
//
// Module 1: WindowsKeyboardManager
//   - Listens for CoreWindow.KeyDown events
//   - Listens for Gamepad.GamepadAdded / GamepadReading
//   - Emits events to JS via DeviceEventEmitter: onHWKeyEvent
//   - Maps Windows VK codes / Gamepad buttons to eventType strings
//
// Module 2: WindowsCredentialManager
//   - Wraps Windows.Security.Credentials.PasswordVault
//   - Methods: setItem(key, value), getItem(key), removeItem(key)
//   - Used by storage.windows.ts for encrypted credential storage

#pragma once
#include "pch.h"

// Include custom module headers here when implemented:
// #include "WindowsKeyboardManager.h"
// #include "WindowsCredentialManager.h"
