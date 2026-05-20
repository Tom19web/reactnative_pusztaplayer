// PusztaPlayer.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "PusztaPlayer.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"
#include "WindowsKeyboardManager.h"
#include "WindowsVideoPlayer.h"
#include "WinHttpModule.h"
#include <winhttp.h>
#pragma comment(lib, "winhttp.lib")

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    using namespace winrt::Microsoft::ReactNative;
    // WinHttpModule uses AddModule (not AddTurboModule) to avoid the RNW 0.84 dispatch crash
    PusztaPlay::RegisterWinHttpModule(packageBuilder);

    // WindowsVideoPlayer: register via AddModule (same pattern, avoids crash)
    packageBuilder.AddModule(L"WindowsVideoPlayer", [](IReactModuleBuilder const &moduleBuilder) -> winrt::IInspectable {
      moduleBuilder.AddMethod(L"play", MethodReturnType::Void,
          [](IJSValueReader const &reader, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            std::wstring url;
            if (reader.ValueType() == JSValueType::Array) {
              while (reader.GetNextArrayItem()) {
                if (reader.ValueType() == JSValueType::String) { url = reader.GetString(); break; }
              }
            }
            if (!url.empty()) {
              PusztaPlay::WindowsVideoPlayer::Instance().play(url);
            }
          });

      moduleBuilder.AddMethod(L"pause", MethodReturnType::Void,
          [](IJSValueReader const &, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            PusztaPlay::WindowsVideoPlayer::Instance().pause();
          });

      moduleBuilder.AddMethod(L"seek", MethodReturnType::Void,
          [](IJSValueReader const &reader, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            int64_t ms = 0;
            if (reader.ValueType() == JSValueType::Array) {
              while (reader.GetNextArrayItem()) {
                if (reader.ValueType() == JSValueType::Int64) { ms = reader.GetInt64(); break; }
              }
            }
            PusztaPlay::WindowsVideoPlayer::Instance().seek(ms);
          });

      moduleBuilder.AddMethod(L"setVolume", MethodReturnType::Void,
          [](IJSValueReader const &reader, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            int vol = 100;
            if (reader.ValueType() == JSValueType::Array) {
              while (reader.GetNextArrayItem()) {
                if (reader.ValueType() == JSValueType::Int64) { vol = static_cast<int>(reader.GetInt64()); break; }
              }
            }
            PusztaPlay::WindowsVideoPlayer::Instance().setVolume(vol);
          });

      moduleBuilder.AddMethod(L"setLayout", MethodReturnType::Void,
          [](IJSValueReader const &reader, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            int x = 0, y = 0, w = 0, h = 0;
            if (reader.ValueType() == JSValueType::Array) {
              int idx = 0;
              while (reader.GetNextArrayItem()) {
                if (reader.ValueType() == JSValueType::Int64) {
                  auto val = static_cast<int>(reader.GetInt64());
                  if (idx == 0) x = val; else if (idx == 1) y = val;
                  else if (idx == 2) w = val; else if (idx == 3) h = val;
                }
                ++idx;
              }
            }
            if (w > 0 && h > 0) PusztaPlay::WindowsVideoPlayer::Instance().setLayout(x, y, w, h);
          });

      moduleBuilder.AddMethod(L"destroy", MethodReturnType::Void,
          [](IJSValueReader const &, IJSValueWriter const &, MethodResultCallback const &, MethodResultCallback const &) noexcept {
            PusztaPlay::WindowsVideoPlayer::Instance().destroy();
          });

      return nullptr;
    });
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // Register custom fonts for DirectWrite (Fabric/Composition)
  AddFontResourceExW((std::wstring(appDirectory) + L"\\Bangers-Regular.ttf").c_str(), FR_PRIVATE, nullptr);
  AddFontResourceExW((std::wstring(appDirectory) + L"\\Poppins-Regular.ttf").c_str(), FR_PRIVATE, nullptr);
  AddFontResourceExW((std::wstring(appDirectory) + L"\\Poppins-Bold.ttf").c_str(), FR_PRIVATE, nullptr);

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

  // ─── Keyboard Manager: hook into React lifecycle ─────────
  // When the React instance is created, store the context for keyboard events
  settings.InstanceCreated(
      [](winrt::Windows::Foundation::IInspectable const & /*sender*/,
          winrt::Microsoft::ReactNative::InstanceCreatedEventArgs const &args) {
        PusztaPlay::WindowsKeyboardManager::Instance().SetReactContext(
            args.Context());
        PusztaPlay::WindowsVideoPlayer::Instance().SetReactContext(
            args.Context());
      });

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"PusztaPlayer");
  appWindow.Resize({1000, 1000});

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"PusztaPlayer");

  // Start the app
  reactNativeWin32App.Start();

  // Keyboard Manager: install after Start (needs active message loop)
  // DISABLED - may cause crashes on hover
  // PusztaPlay::WindowsKeyboardManager::Instance().Install();
}
