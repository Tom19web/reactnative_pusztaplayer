#include "pch.h"
#include "WinHttpModule.h"
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

using namespace winrt::Microsoft::ReactNative;

namespace {

// Parse URL into components
struct ParsedUrl {
  std::wstring host;
  std::wstring path;
  int port;
  bool secure;
};

ParsedUrl ParseUrl(const std::string &url) {
  ParsedUrl result{L"", L"/", 80, false};
  std::wstring wurl = winrt::to_hstring(url).c_str();

  // Extract scheme
  size_t schemeEnd = wurl.find(L"://");
  if (schemeEnd != std::wstring::npos) {
    std::wstring scheme = wurl.substr(0, schemeEnd);
    result.secure = (scheme == L"https");
    result.port = result.secure ? 443 : 80;
    wurl = wurl.substr(schemeEnd + 3);
  }

  // Extract host and port
  size_t pathStart = wurl.find(L'/');
  std::wstring authority = (pathStart != std::wstring::npos) ? wurl.substr(0, pathStart) : wurl;
  result.path = (pathStart != std::wstring::npos) ? wurl.substr(pathStart) : L"/";

  size_t colon = authority.find(L':');
  if (colon != std::wstring::npos) {
    result.host = authority.substr(0, colon);
    result.port = std::stoi(authority.substr(colon + 1));
  } else {
    result.host = authority;
  }

  return result;
}

// Synchronous WinHTTP request - call on background thread only
std::pair<int, std::string> WinHttpRequestSync(
    const std::string &url, const std::string &method, const std::string &body) {
  auto parsed = ParseUrl(url);

  HINTERNET hSession = WinHttpOpen(L"PusztaPlayer/0.7.0",
      WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0);
  if (!hSession)
    throw std::runtime_error("WinHttpOpen failed");

  HINTERNET hConnect = WinHttpConnect(hSession, parsed.host.c_str(), parsed.port, 0);
  if (!hConnect) {
    WinHttpCloseHandle(hSession);
    throw std::runtime_error("WinHttpConnect failed");
  }

  std::wstring wmethod = winrt::to_hstring(method).c_str();
  DWORD flags = parsed.secure ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET hRequest = WinHttpOpenRequest(hConnect, wmethod.c_str(),
      parsed.path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!hRequest) {
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    throw std::runtime_error("WinHttpOpenRequest failed");
  }

  // Disable auto-redirect
  DWORD redirectPolicy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
  WinHttpSetOption(hRequest, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy));
  LPVOID bodyData = WINHTTP_NO_REQUEST_DATA;
  DWORD bodyLen = 0;
  std::string bodyCopy;
  if (!body.empty()) {
    bodyCopy = body;
    bodyData = (LPVOID)bodyCopy.data();
    bodyLen = (DWORD)bodyCopy.size();
  }

  if (!WinHttpSendRequest(hRequest,
          WINHTTP_NO_ADDITIONAL_HEADERS, 0,
          bodyData, bodyLen, bodyLen, 0)) {
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    throw std::runtime_error("WinHttpSendRequest failed");
  }

  if (!WinHttpReceiveResponse(hRequest, nullptr)) {
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    throw std::runtime_error("WinHttpReceiveResponse failed");
  }

  // Read status code
  DWORD statusCode = 0;
  DWORD size = sizeof(statusCode);
  WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
      nullptr, &statusCode, &size, nullptr);

  // Read response body
  std::string responseBody;
  DWORD bytesAvailable = 0;
  while (WinHttpQueryDataAvailable(hRequest, &bytesAvailable) && bytesAvailable > 0) {
    std::vector<char> buffer(bytesAvailable);
    DWORD bytesRead = 0;
    if (WinHttpReadData(hRequest, buffer.data(), bytesAvailable, &bytesRead)) {
      responseBody.append(buffer.data(), bytesRead);
    }
  }

  WinHttpCloseHandle(hRequest);
  WinHttpCloseHandle(hConnect);
  WinHttpCloseHandle(hSession);

  return {static_cast<int>(statusCode), responseBody};
}

} // anonymous namespace

namespace PusztaPlay {

void RegisterWinHttpModule(IReactPackageBuilder const &packageBuilder) noexcept {
  packageBuilder.AddModule(L"WinHttpModule", [](IReactModuleBuilder const &moduleBuilder) -> winrt::IInspectable {
    moduleBuilder.AddMethod(L"request", MethodReturnType::Callback,
        [](IJSValueReader const &reader, IJSValueWriter const &writer,
           MethodResultCallback const &callback, MethodResultCallback const &) noexcept {
      try {
        std::string url, method = "GET", body;
        if (reader.ValueType() == JSValueType::Array) {
          int idx = 0;
          while (reader.GetNextArrayItem()) {
            if (reader.ValueType() == JSValueType::String) {
              auto val = winrt::to_string(reader.GetString());
              if (idx == 0) url = std::move(val);
              else if (idx == 1) method = std::move(val);
              else if (idx == 2) body = std::move(val);
            }
            ++idx;
          }
        }

        if (url.empty()) {
          writer.WriteString(L"WinHttpModule: url is required");
          callback(writer);
          return;
        }

        try {
          auto [status, responseBody] = WinHttpRequestSync(url, method, body);
          writer.WriteArrayBegin();
          writer.WriteInt64(static_cast<int64_t>(status));
          writer.WriteString(winrt::to_hstring(responseBody));
          writer.WriteArrayEnd();
          callback(writer);
        } catch (std::exception const &e) {
          writer.WriteString(winrt::to_hstring(std::string("WinHttpModule: ") + e.what()));
          callback(writer);
        }
      } catch (std::exception const &e) {
        writer.WriteString(winrt::to_hstring(std::string("WinHttpModule: ") + e.what()));
        callback(writer);
      }
    });

    return nullptr;
  });
}

} // namespace PusztaPlay
