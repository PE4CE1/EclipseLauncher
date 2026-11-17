#define NOMINMAX
#include <algorithm>
#include <dwmapi.h>
#include <dxgi1_6.h>
#include <iostream>
#include <vector>
#include <windows.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
static float whiteLevel(const wchar_t *name) {
  UINT32 paths = 0, modes = 0;
  if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &paths, &modes) != ERROR_SUCCESS)
    return 80;
  std::vector<DISPLAYCONFIG_PATH_INFO> active(paths);
  std::vector<DISPLAYCONFIG_MODE_INFO> details(modes);
  if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &paths, active.data(), &modes, details.data(),
                         nullptr) != ERROR_SUCCESS)
    return 80;
  for (UINT32 i = 0; i < paths; i++) {
    DISPLAYCONFIG_SOURCE_DEVICE_NAME source{};
    source.header = {DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, sizeof(source),
                     active[i].sourceInfo.adapterId, active[i].sourceInfo.id};
    if (DisplayConfigGetDeviceInfo(&source.header) != ERROR_SUCCESS ||
        wcscmp(source.viewGdiDeviceName, name))
      continue;
    DISPLAYCONFIG_SDR_WHITE_LEVEL value{};
    value.header = {DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL, sizeof(value),
                    active[i].targetInfo.adapterId, active[i].targetInfo.id};
    if (DisplayConfigGetDeviceInfo(&value.header) == ERROR_SUCCESS)
      return std::max(80.f, std::min(1000.f, value.SDRWhiteLevel * .08f));
  }
  return 80;
}
int wmain(int argc, wchar_t **argv) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  HWND window = nullptr;
  RECT windowRect{};
  HMONITOR selected = nullptr;
  if (argc != 1) {
    if (argc != 3 || wcscmp(argv[1], L"--window"))
      return 2;
    wchar_t *end = nullptr;
    auto handle = wcstoull(argv[2], &end, 10);
    if (!handle || !end || *end || !IsWindow((HWND)(uintptr_t)handle))
      return 2;
    window = (HWND)(uintptr_t)handle;
    selected = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
    if (FAILED(DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS, &windowRect,
                                     sizeof(windowRect))) &&
        !GetWindowRect(window, &windowRect))
      return 2;
  }
  ComPtr<IDXGIFactory1> factory;
  if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))))
    return 1;
  std::cout << "[";
  bool first = true;
  for (UINT adapter = 0;; adapter++) {
    ComPtr<IDXGIAdapter1> device;
    if (FAILED(factory->EnumAdapters1(adapter, &device)))
      break;
    if (!device)
      continue;
    for (UINT index = 0;; index++) {
      ComPtr<IDXGIOutput> output;
      if (FAILED(device->EnumOutputs(index, &output)))
        break;
      DXGI_OUTPUT_DESC info{};
      if (!output || FAILED(output->GetDesc(&info)) || !info.AttachedToDesktop)
        continue;
      if (selected && info.Monitor != selected)
        continue;
      auto r = info.DesktopCoordinates;
      if (window)
        r = windowRect;
      ComPtr<IDXGIOutput6> advanced;
      DXGI_OUTPUT_DESC1 details{};
      bool hdr = SUCCEEDED(output.As(&advanced)) && SUCCEEDED(advanced->GetDesc1(&details)) &&
                 details.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020;
      if (!first)
        std::cout << ",";
      first = false;
      std::cout << "{\"adapter\":" << adapter << ",\"index\":" << index << ",\"monitor\":\""
                << (uintptr_t)info.Monitor << "\",\"white\":" << whiteLevel(info.DeviceName)
                << ",\"x\":" << r.left << ",\"y\":" << r.top << ",\"width\":" << r.right - r.left
                << ",\"height\":" << r.bottom - r.top << ",\"hdr\":" << (hdr ? "true" : "false")
                << "}";
    }
  }
  std::cout << "]\n";
  return 0;
}
