// PusztaPlayer.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "PusztaPlayer.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"
#include "WindowsKeyboardManager.h"
#include "WindowsVideoPlayer.h"

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    using namespace winrt::Microsoft::ReactNative;

    packageBuilder.AddTurboModule(
        L"WindowsVideoPlayer",
        [](IReactModuleBuilder const &moduleBuilder) noexcept
        -> winrt::Windows::Foundation::IInspectable {
          auto player = &PusztaPlay::WindowsVideoPlayer::Instance();

          // Set ReactContext from initializer
          moduleBuilder.AddInitializer(
              [player](IReactContext const &context) noexcept {
                player->SetReactContext(context);
              });

          // play(source: string) -> Promise<void>
          moduleBuilder.AddMethod(
              L"play", MethodReturnType::Promise,
              [player](IJSValueReader const &reader,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &reject) noexcept {
                try {
                  reader.GetNextArrayItem();
                  auto source = reader.GetString();
                  player->play(std::wstring(source));
                  writer.WriteBoolean(true);
                  resolve(writer);
                } catch (...) {
                  reject(writer);
                }
              });

          // pause() -> Promise<void>
          moduleBuilder.AddMethod(
              L"pause", MethodReturnType::Promise,
              [player](IJSValueReader const &,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &) noexcept {
                player->pause();
                writer.WriteBoolean(true);
                resolve(writer);
              });

          // seek(timeMs: number) -> Promise<void>
          moduleBuilder.AddMethod(
              L"seek", MethodReturnType::Promise,
              [player](IJSValueReader const &reader,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &) noexcept {
                reader.GetNextArrayItem();
                auto timeMs = reader.GetInt64();
                player->seek(timeMs);
                writer.WriteBoolean(true);
                resolve(writer);
              });

          // setVolume(vol: number) -> Promise<void>
          moduleBuilder.AddMethod(
              L"setVolume", MethodReturnType::Promise,
              [player](IJSValueReader const &reader,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &) noexcept {
                reader.GetNextArrayItem();
                auto vol = reader.GetInt64();
                player->setVolume(static_cast<int>(vol));
                writer.WriteBoolean(true);
                resolve(writer);
              });

          // setLayout(x, y, w, h) -> Promise<void>
          moduleBuilder.AddMethod(
              L"setLayout", MethodReturnType::Promise,
              [player](IJSValueReader const &reader,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &) noexcept {
                reader.GetNextArrayItem();
                int x = static_cast<int>(reader.GetInt64());
                reader.GetNextArrayItem();
                int y = static_cast<int>(reader.GetInt64());
                reader.GetNextArrayItem();
                int w = static_cast<int>(reader.GetInt64());
                reader.GetNextArrayItem();
                int h = static_cast<int>(reader.GetInt64());
                player->setLayout(x, y, w, h);
                writer.WriteBoolean(true);
                resolve(writer);
              });

          // destroy() -> Promise<void>
          moduleBuilder.AddMethod(
              L"destroy", MethodReturnType::Promise,
              [player](IJSValueReader const &,
                       IJSValueWriter const &writer,
                       MethodResultCallback const &resolve,
                       MethodResultCallback const &) noexcept {
                player->destroy();
                writer.WriteBoolean(true);
                resolve(writer);
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
  PusztaPlay::WindowsKeyboardManager::Instance().Install();
}
