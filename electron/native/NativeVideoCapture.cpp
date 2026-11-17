#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <atomic>
#include <chrono>
#include <cmath>
#include <codecapi.h>
#include <d3d10_1.h>
#include <d3d11_4.h>
#include <d3dcompiler.h>
#include <dxgi1_6.h>
#include <evr.h>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mftransform.h>
#include <mutex>
#include <source_location>
#include <string>
#include <thread>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <wrl.h>
#include <wrl/implements.h>
using namespace Microsoft::WRL;
using namespace winrt;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
static void check(HRESULT hr, std::source_location location = std::source_location::current()) {
  if (FAILED(hr)) {
    std::cerr << "GPU stage " << location.line() << ": 0x" << std::hex << (unsigned long)hr
              << std::dec << std::endl;
    winrt::throw_hresult(hr);
  }
}

// Only compressed fragments cross the pipe. Capture textures never map into CPU memory.
class PipeStream final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IMFByteStream> {
  std::mutex mutex;
  QWORD position = 0;
  bool closed = false;
  static constexpr GUID writeCount = {
      0x25c52866, 0xa325, 0x497a, {0x91, 0x3a, 0xa4, 0x75, 0x16, 0x76, 0x56, 0xa1}};

public:
  HRESULT STDMETHODCALLTYPE GetCapabilities(DWORD *flags) override {
    if (!flags)
      return E_POINTER;
    *flags = MFBYTESTREAM_IS_WRITABLE;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetLength(QWORD *value) override {
    if (!value)
      return E_POINTER;
    std::lock_guard lock(mutex);
    *value = position;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE SetLength(QWORD) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE GetCurrentPosition(QWORD *value) override {
    return GetLength(value);
  }
  HRESULT STDMETHODCALLTYPE SetCurrentPosition(QWORD value) override {
    std::lock_guard lock(mutex);
    return value == position ? S_OK : E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE IsEndOfStream(BOOL *value) override {
    if (!value)
      return E_POINTER;
    *value = FALSE;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Read(BYTE *, ULONG, ULONG *) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE BeginRead(BYTE *, ULONG, IMFAsyncCallback *, IUnknown *) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE EndRead(IMFAsyncResult *, ULONG *) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE Write(const BYTE *bytes, ULONG size, ULONG *written) override {
    if (!written)
      return E_POINTER;
    *written = 0;
    std::lock_guard lock(mutex);
    if (closed)
      return MF_E_SHUTDOWN;
    while (*written < size) {
      DWORD part = 0;
      if (!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), bytes + *written, size - *written, &part,
                     nullptr) ||
          !part)
        return HRESULT_FROM_WIN32(GetLastError() ? GetLastError() : ERROR_BROKEN_PIPE);
      *written += part;
      position += part;
    }
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE BeginWrite(const BYTE *bytes, ULONG size, IMFAsyncCallback *callback,
                                       IUnknown *state) override {
    if (!callback)
      return E_POINTER;
    ComPtr<IMFAttributes> count;
    HRESULT hr = MFCreateAttributes(&count, 1);
    if (FAILED(hr))
      return hr;
    ComPtr<IMFAsyncResult> result;
    hr = MFCreateAsyncResult(count.Get(), callback, state, &result);
    if (FAILED(hr))
      return hr;
    ULONG written = 0;
    hr = Write(bytes, size, &written);
    count->SetUINT32(writeCount, written);
    result->SetStatus(hr);
    return MFInvokeCallback(result.Get());
  }
  HRESULT STDMETHODCALLTYPE EndWrite(IMFAsyncResult *result, ULONG *written) override {
    if (!result || !written)
      return E_POINTER;
    *written = 0;
    ComPtr<IUnknown> object;
    ComPtr<IMFAttributes> count;
    HRESULT hr = result->GetObject(&object);
    if (FAILED(hr) || FAILED(object.As(&count)))
      return E_INVALIDARG;
    UINT32 value = 0;
    hr = count->GetUINT32(writeCount, &value);
    *written = value;
    return FAILED(hr) ? hr : result->GetStatus();
  }
  HRESULT STDMETHODCALLTYPE Seek(MFBYTESTREAM_SEEK_ORIGIN origin, LONGLONG offset, DWORD,
                                 QWORD *value) override {
    std::lock_guard lock(mutex);
    if ((origin == msoCurrent && offset == 0) ||
        (origin == msoBegin && offset == (LONGLONG)position)) {
      if (value)
        *value = position;
      return S_OK;
    }
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE Flush() override {
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Close() override {
    std::lock_guard lock(mutex);
    closed = true;
    return S_OK;
  }
};

struct Options {
  UINT adapter = 0, width = 1280, height = 720, fps = 60, bitrate = 6000000;
  uintptr_t monitor = 0, window = 0;
  bool hdr = false, software = false, test = false;
  float white = 80;
};
static UINT number(const wchar_t *text, UINT minimum, UINT maximum) {
  wchar_t *end = nullptr;
  auto value = wcstoull(text, &end, 10);
  if (!*text || !end || *end || value < minimum || value > maximum)
    throw hresult_invalid_argument();
  return (UINT)value;
}
static Options arguments(int argc, wchar_t **argv) {
  Options o;
  for (int i = 1; i < argc; i++) {
    std::wstring key = argv[i];
    if (key == L"--hdr") {
      o.hdr = true;
      continue;
    }
    if (key == L"--software") {
      o.software = true;
      continue;
    }
    if (key == L"--self-test") {
      o.test = true;
      continue;
    }
    if (++i >= argc)
      throw hresult_invalid_argument();
    const auto value = argv[i];
    if (key == L"--adapter")
      o.adapter = number(value, 0, 31);
    else if (key == L"--width")
      o.width = number(value, 2, 3840);
    else if (key == L"--height")
      o.height = number(value, 2, 2160);
    else if (key == L"--fps")
      o.fps = number(value, 24, 120);
    else if (key == L"--bitrate")
      o.bitrate = number(value, 1000000, 100000000);
    else if (key == L"--white")
      o.white = (float)number(value, 80, 1000);
    else if (key == L"--window" || key == L"--monitor") {
      wchar_t *end = nullptr;
      auto handle = wcstoull(value, &end, 10);
      if (!*value || !end || *end || !handle)
        throw hresult_invalid_argument();
      if (key == L"--window")
        o.window = (uintptr_t)handle;
      else
        o.monitor = (uintptr_t)handle;
    } else
      throw hresult_invalid_argument();
  }
  if (o.width % 2 || o.height % 2 || (!o.test && (!o.monitor == !o.window)))
    throw hresult_invalid_argument();
  return o;
}
static const char *shader = R"(
Texture2D image:register(t0);SamplerState linearSampler:register(s0);
cbuffer Settings:register(b0){float2 fit;float hdr;float white;};
struct Vertex{float4 position:SV_POSITION;float2 uv:TEXCOORD0;};
Vertex vs(uint id:SV_VertexID){Vertex o;o.uv=float2((id<<1)&2,id&2);o.position=float4(o.uv*float2(2,-2)+float2(-1,1),0,1);return o;}
float3 srgb(float3 x){return lerp(12.92*x,1.055*pow(max(x,0),1.0/2.4)-.055,step(.0031308,x));}
float4 ps(Vertex v):SV_TARGET{
  float2 uv=(v.uv-.5)/fit+.5;if(any(uv<0)||any(uv>1))return float4(0,0,0,1);
  float3 c=max(image.Sample(linearSampler,uv).rgb,0);
  if(hdr>0){
    c*=80/white;float peak=max(c.r,max(c.g,c.b));
    // scRGB is linear at 80 nits per unit. The shoulder compresses highlights,
    // while the Windows SDR white level preserves the brightness of SDR apps.
    // Map the brightest channel rather than luminance to keep saturated HDR
    // colors inside SDR gamut instead of clipping individual color channels.
    float mapped=peak<=.65?peak:.65+.32*(1-exp(-max(0,peak-.65)/.32));
    c=srgb(c*(mapped/max(peak,.00001)));
  }
  return float4(saturate(c),1);
})";

class Pipeline {
  Options o;
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  ComPtr<ID3D11VideoDevice> videoDevice;
  ComPtr<ID3D11VideoContext> videoContext;
  ComPtr<ID3D11VertexShader> vertex;
  ComPtr<ID3D11PixelShader> pixel;
  ComPtr<ID3D11SamplerState> sampler;
  ComPtr<ID3D11Buffer> constants;
  ComPtr<ID3D11Texture2D> input, rgb;
  ComPtr<ID3D11ShaderResourceView> inputView;
  ComPtr<ID3D11RenderTargetView> target;
  ComPtr<ID3D11VideoProcessorEnumerator> enumerator;
  ComPtr<ID3D11VideoProcessor> processor;
  ComPtr<ID3D11VideoProcessorInputView> processorInput;
  ComPtr<IMFDXGIDeviceManager> manager;
  ComPtr<IMFVideoSampleAllocatorEx> allocator;
  ComPtr<IMFSinkWriter> writer;
  ComPtr<PipeStream> pipe;
  DWORD stream = 0;
  UINT sourceWidth = 0, sourceHeight = 0;
  bool begun = false;

public:
  std::string encoder = "media-foundation";
  bool hardware = false;
  Pipeline(const Options &options) : o(options) {
    ComPtr<IDXGIFactory1> factory;
    ComPtr<IDXGIAdapter1> adapter;
    check(CreateDXGIFactory1(IID_PPV_ARGS(&factory)));
    check(factory->EnumAdapters1(o.adapter, &adapter));
    D3D_FEATURE_LEVEL level;
    check(D3D11CreateDevice(adapter.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr,
                            D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                            nullptr, 0, D3D11_SDK_VERSION, &device, &level, &context));
    ComPtr<ID3D10Multithread> multithread;
    check(context.As(&multithread));
    multithread->SetMultithreadProtected(TRUE);
    check(device.As(&videoDevice));
    check(context.As(&videoContext));
    UINT token = 0;
    check(MFCreateDXGIDeviceManager(&token, &manager));
    check(manager->ResetDevice(device.Get(), token));
    ComPtr<ID3DBlob> code, errors;
    check(D3DCompile(shader, strlen(shader), nullptr, nullptr, nullptr, "vs", "vs_4_0",
                     D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &code, &errors));
    check(device->CreateVertexShader(code->GetBufferPointer(), code->GetBufferSize(), nullptr,
                                     &vertex));
    check(D3DCompile(shader, strlen(shader), nullptr, nullptr, nullptr, "ps", "ps_4_0",
                     D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &code, &errors));
    check(device->CreatePixelShader(code->GetBufferPointer(), code->GetBufferSize(), nullptr,
                                    &pixel));
    D3D11_SAMPLER_DESC sample{};
    sample.Filter = D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT;
    sample.AddressU = sample.AddressV = sample.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
    sample.MaxLOD = D3D11_FLOAT32_MAX;
    check(device->CreateSamplerState(&sample, &sampler));
    D3D11_BUFFER_DESC buffer{};
    buffer.ByteWidth = 16;
    buffer.Usage = D3D11_USAGE_DEFAULT;
    buffer.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
    check(device->CreateBuffer(&buffer, nullptr, &constants));
    D3D11_TEXTURE2D_DESC texture{};
    texture.Width = o.width;
    texture.Height = o.height;
    texture.MipLevels = texture.ArraySize = 1;
    texture.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    texture.SampleDesc.Count = 1;
    texture.BindFlags = D3D11_BIND_RENDER_TARGET;
    check(device->CreateTexture2D(&texture, nullptr, &rgb));
    check(device->CreateRenderTargetView(rgb.Get(), nullptr, &target));
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC content{};
    content.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    content.InputFrameRate = {o.fps, 1};
    content.OutputFrameRate = {o.fps, 1};
    content.InputWidth = content.OutputWidth = o.width;
    content.InputHeight = content.OutputHeight = o.height;
    content.Usage = D3D11_VIDEO_USAGE_PLAYBACK_NORMAL;
    check(videoDevice->CreateVideoProcessorEnumerator(&content, &enumerator));
    check(videoDevice->CreateVideoProcessor(enumerator.Get(), 0, &processor));
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC view{};
    view.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    check(videoDevice->CreateVideoProcessorInputView(rgb.Get(), enumerator.Get(), &view,
                                                     &processorInput));
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE space{};
    space.YCbCr_Matrix = 1;
    space.Nominal_Range = 2;
    videoContext->VideoProcessorSetStreamColorSpace(processor.Get(), 0, &space);
    space.Nominal_Range = 1;
    videoContext->VideoProcessorSetOutputColorSpace(processor.Get(), &space);
    ComPtr<ID3D11VideoContext1> colors;
    if (SUCCEEDED(videoContext.As(&colors))) {
      colors->VideoProcessorSetStreamColorSpace1(processor.Get(), 0,
                                                 DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
      colors->VideoProcessorSetOutputColorSpace1(processor.Get(),
                                                 DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
    }
    videoContext->VideoProcessorSetStreamAutoProcessingMode(processor.Get(), 0, FALSE);
    RECT rect{0, 0, (LONG)o.width, (LONG)o.height};
    videoContext->VideoProcessorSetStreamSourceRect(processor.Get(), 0, TRUE, &rect);
    videoContext->VideoProcessorSetStreamDestRect(processor.Get(), 0, TRUE, &rect);
    videoContext->VideoProcessorSetOutputTargetRect(processor.Get(), TRUE, &rect);
  }
  IDirect3DDevice winrtDevice() {
    ComPtr<IDXGIDevice> dxgi;
    check(device.As(&dxgi));
    winrt::com_ptr<IInspectable> inspectable;
    check(CreateDirect3D11DeviceFromDXGIDevice(dxgi.Get(), inspectable.put()));
    return inspectable.as<IDirect3DDevice>();
  }
  void prepare() {
    ComPtr<IMFAttributes> attributes;
    check(MFCreateAttributes(&attributes, 8));
    check(attributes->SetUnknown(MF_SINK_WRITER_D3D_MANAGER, manager.Get()));
    check(attributes->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, !o.software));
    check(attributes->SetUINT32(MF_SINK_WRITER_DISABLE_THROTTLING, TRUE));
    check(attributes->SetUINT32(MF_LOW_LATENCY, TRUE));
    check(attributes->SetGUID(MF_TRANSCODE_CONTAINERTYPE, MFTranscodeContainerType_FMPEG4));
    pipe = Make<PipeStream>();
    check(MFCreateSinkWriterFromURL(nullptr, pipe.Get(), attributes.Get(), &writer));
    auto type = [&](GUID subtype) {
      ComPtr<IMFMediaType> t;
      check(MFCreateMediaType(&t));
      check(t->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video));
      check(t->SetGUID(MF_MT_SUBTYPE, subtype));
      check(t->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive));
      check(MFSetAttributeSize(t.Get(), MF_MT_FRAME_SIZE, o.width, o.height));
      check(MFSetAttributeRatio(t.Get(), MF_MT_FRAME_RATE, o.fps, 1));
      check(MFSetAttributeRatio(t.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1));
      check(t->SetUINT32(MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709));
      check(t->SetUINT32(MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709));
      check(t->SetUINT32(MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709));
      check(t->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235));
      return t;
    };
    auto output = type(MFVideoFormat_H264);
    check(output->SetUINT32(MF_MT_AVG_BITRATE, o.bitrate));
    check(output->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Main));
    check(writer->AddStream(output.Get(), &stream));
    auto inputType = type(MFVideoFormat_NV12);
    check(writer->SetInputMediaType(stream, inputType.Get(), nullptr));
    ComPtr<IMFSinkWriterEx> extended;
    check(writer.As(&extended));
    for (DWORD i = 0; i < 8; i++) {
      GUID category{};
      ComPtr<IMFTransform> transform;
      if (FAILED(extended->GetTransformForStream(stream, i, &category, &transform)))
        break;
      if (category != MFT_CATEGORY_VIDEO_ENCODER)
        continue;
      ComPtr<IMFAttributes> attrs;
      if (SUCCEEDED(transform->GetAttributes(&attrs))) {
        UINT length = 0;
        hardware = SUCCEEDED(attrs->GetStringLength(MFT_ENUM_HARDWARE_URL_Attribute, &length));
      }
      ComPtr<ICodecAPI> codec;
      if (SUCCEEDED(transform.As(&codec))) {
        VARIANT value;
        VariantInit(&value);
        value.vt = VT_UI4;
        value.ulVal = o.fps;
        codec->SetValue(&CODECAPI_AVEncMPVGOPSize, &value);
        value.ulVal = 0;
        codec->SetValue(&CODECAPI_AVEncMPVDefaultBPictureCount, &value);
        value.vt = VT_BOOL;
        value.boolVal = VARIANT_TRUE;
        codec->SetValue(&CODECAPI_AVLowLatencyMode, &value);
      }
    }
    if (!hardware && !o.software)
      throw hresult_error(E_FAIL, L"hardware-encoder-unavailable");
    encoder = hardware ? "media-foundation-hardware" : "media-foundation-software";
    check(MFCreateVideoSampleAllocatorEx(IID_PPV_ARGS(&allocator)));
    check(allocator->SetDirectXManager(manager.Get()));
    ComPtr<IMFAttributes> allocation;
    check(MFCreateAttributes(&allocation, 1));
    check(allocation->SetUINT32(MF_SA_D3D11_BINDFLAGS, D3D11_BIND_RENDER_TARGET));
    check(allocator->InitializeSampleAllocatorEx(3, 8, allocation.Get(), inputType.Get()));
    check(writer->BeginWriting());
    begun = true;
  }
  void copy(ID3D11Texture2D *source, UINT width, UINT height) {
    D3D11_TEXTURE2D_DESC description{};
    source->GetDesc(&description);
    if (!input || sourceWidth != width || sourceHeight != height) {
      sourceWidth = width;
      sourceHeight = height;
      description.Width = width;
      description.Height = height;
      description.ArraySize = description.MipLevels = 1;
      description.BindFlags = D3D11_BIND_SHADER_RESOURCE;
      description.MiscFlags = description.CPUAccessFlags = 0;
      description.Usage = D3D11_USAGE_DEFAULT;
      inputView.Reset();
      input.Reset();
      check(device->CreateTexture2D(&description, nullptr, &input));
      check(device->CreateShaderResourceView(input.Get(), nullptr, &inputView));
    }
    D3D11_BOX box{0, 0, 0, width, height, 1};
    context->CopySubresourceRegion(input.Get(), 0, 0, 0, 0, source, 0, &box);
  }
  bool hasFrame() const {
    return !!input;
  }
  void synthetic() {
    // A bright scRGB test image exercises exactly the HDR shader and GPU encoder.
    D3D11_TEXTURE2D_DESC d{};
    d.Width = 640;
    d.Height = 360;
    d.MipLevels = d.ArraySize = 1;
    d.Format = o.hdr ? DXGI_FORMAT_R16G16B16A16_FLOAT : DXGI_FORMAT_B8G8R8A8_UNORM;
    d.SampleDesc.Count = 1;
    d.BindFlags = D3D11_BIND_RENDER_TARGET;
    ComPtr<ID3D11Texture2D> texture;
    ComPtr<ID3D11RenderTargetView> rtv;
    check(device->CreateTexture2D(&d, nullptr, &texture));
    check(device->CreateRenderTargetView(texture.Get(), nullptr, &rtv));
    const float color[] = {o.hdr ? 4.f : .8f, o.hdr ? 2.f : .3f, o.hdr ? .5f : .1f, 1};
    context->ClearRenderTargetView(rtv.Get(), color);
    copy(texture.Get(), 640, 360);
  }
  void write(LONGLONG time) {
    if (!hasFrame())
      return;
    ComPtr<IMFSample> sample;
    HRESULT hr = allocator->AllocateSample(&sample);
    if (hr == MF_E_SAMPLEALLOCATOR_EMPTY)
      return;
    check(hr);
    float sourceAspect = (float)sourceWidth / sourceHeight,
          targetAspect = (float)o.width / o.height;
    const float values[] = {std::min(1.f, sourceAspect / targetAspect),
                            std::min(1.f, targetAspect / sourceAspect), o.hdr ? 1.f : 0.f, o.white};
    context->UpdateSubresource(constants.Get(), 0, nullptr, values, 0, 0);
    ID3D11RenderTargetView *rt = target.Get();
    context->OMSetRenderTargets(1, &rt, nullptr);
    D3D11_VIEWPORT viewport{0, 0, (float)o.width, (float)o.height, 0, 1};
    context->RSSetViewports(1, &viewport);
    context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    context->VSSetShader(vertex.Get(), nullptr, 0);
    context->PSSetShader(pixel.Get(), nullptr, 0);
    ID3D11ShaderResourceView *srv = inputView.Get();
    context->PSSetShaderResources(0, 1, &srv);
    ID3D11SamplerState *smp = sampler.Get();
    context->PSSetSamplers(0, 1, &smp);
    ID3D11Buffer *cb = constants.Get();
    context->PSSetConstantBuffers(0, 1, &cb);
    context->Draw(3, 0);
    srv = nullptr;
    context->PSSetShaderResources(0, 1, &srv);
    rt = nullptr;
    context->OMSetRenderTargets(1, &rt, nullptr);
    ComPtr<IMFMediaBuffer> buffer;
    check(sample->GetBufferByIndex(0, &buffer));
    ComPtr<IMFDXGIBuffer> dxgi;
    check(buffer.As(&dxgi));
    ComPtr<ID3D11Texture2D> texture;
    check(dxgi->GetResource(IID_PPV_ARGS(&texture)));
    UINT index = 0;
    check(dxgi->GetSubresourceIndex(&index));
    D3D11_TEXTURE2D_DESC textureDesc{};
    texture->GetDesc(&textureDesc);
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC desc{};
    if (textureDesc.ArraySize > 1) {
      desc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2DARRAY;
      desc.Texture2DArray.MipSlice = index % textureDesc.MipLevels;
      desc.Texture2DArray.FirstArraySlice = index / textureDesc.MipLevels;
      desc.Texture2DArray.ArraySize = 1;
    } else {
      desc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
      desc.Texture2D.MipSlice = index;
    }
    ComPtr<ID3D11VideoProcessorOutputView> view;
    check(
        videoDevice->CreateVideoProcessorOutputView(texture.Get(), enumerator.Get(), &desc, &view));
    D3D11_VIDEO_PROCESSOR_STREAM frame{};
    frame.Enable = TRUE;
    frame.pInputSurface = processorInput.Get();
    check(videoContext->VideoProcessorBlt(processor.Get(), view.Get(), 0, 1, &frame));
    context->Flush();
    check(buffer->SetCurrentLength(o.width * o.height * 3 / 2));
    check(sample->SetSampleTime(time));
    check(sample->SetSampleDuration(10000000 / o.fps));
    check(writer->WriteSample(stream, sample.Get()));
  }
  void finish() {
    if (begun) {
      begun = false;
      check(writer->Finalize());
    }
  }
};

static double epoch() {
  FILETIME time{};
  GetSystemTimePreciseAsFileTime(&time);
  ULARGE_INTEGER value{};
  value.LowPart = time.dwLowDateTime;
  value.HighPart = time.dwHighDateTime;
  return (value.QuadPart - 116444736000000000ULL) / 10000.0;
}
int wmain(int argc, wchar_t **argv) {
  try {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    check(MFStartup(MF_VERSION));
    const auto o = arguments(argc, argv);
    Pipeline pipeline(o);
    pipeline.prepare();
    GraphicsCaptureItem item{nullptr};
    Direct3D11CaptureFramePool pool{nullptr};
    GraphicsCaptureSession session{nullptr};
    auto closed = std::make_shared<std::atomic<bool>>(false);
    DWORD owner = 0;
    if (!o.test) {
      if (!GraphicsCaptureSession::IsSupported())
        throw hresult_error(E_NOTIMPL, L"window-capture-unavailable");
      auto interop =
          winrt::get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
      if (o.window) {
        HWND hwnd = (HWND)o.window;
        if (!IsWindow(hwnd) || IsIconic(hwnd))
          throw hresult_error(E_INVALIDARG, L"selected-window-unavailable");
        GetWindowThreadProcessId(hwnd, &owner);
        check(interop->CreateForWindow(hwnd, winrt::guid_of<GraphicsCaptureItem>(),
                                       winrt::put_abi(item)));
      } else
        check(interop->CreateForMonitor((HMONITOR)o.monitor, winrt::guid_of<GraphicsCaptureItem>(),
                                        winrt::put_abi(item)));
      item.Closed([closed](auto &&, auto &&) { closed->store(true); });
      pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
          pipeline.winrtDevice(),
          o.hdr ? DirectXPixelFormat::R16G16B16A16Float
                : DirectXPixelFormat::B8G8R8A8UIntNormalized,
          2, item.Size());
      session = pool.CreateCaptureSession(item);
      // The border preference is optional: older Windows versions and system
      // policies must not turn a cosmetic preference into a recording failure.
      if (auto border = session.try_as<IGraphicsCaptureSession3>()) {
        try {
          border.IsBorderRequired(false);
        } catch (const winrt::hresult_error &) {
        }
      }
      session.StartCapture();
    } else
      pipeline.synthetic();
    std::atomic<bool> stopping = false;
    std::thread input([&]() {
      char byte;
      DWORD read;
      ReadFile(GetStdHandle(STD_INPUT_HANDLE), &byte, 1, &read, nullptr);
      stopping = true;
    });
    // The input thread owns no capture resources and is joined on every exit path.
    struct Join {
      std::thread &thread;
      std::atomic<bool> &stopping;
      ~Join() {
        stopping = true;
        while (WaitForSingleObject(thread.native_handle(), 1) == WAIT_TIMEOUT)
          CancelSynchronousIo(thread.native_handle());
        thread.join();
      }
    } join{input, stopping};
    HANDLE clock = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                                          TIMER_ALL_ACCESS);
    if (!clock)
      clock = CreateWaitableTimerW(nullptr, FALSE, nullptr);
    if (!clock)
      winrt::throw_last_error();
    struct Timer {
      HANDLE handle;
      ~Timer() {
        CloseHandle(handle);
      }
    } timer{clock};
    auto next = std::chrono::steady_clock::now(), origin = next;
    bool ready = false;
    LONGLONG lastFrame = -1;
    auto size = item ? item.Size() : winrt::Windows::Graphics::SizeInt32{640, 360};
    while (!stopping && !closed->load()) {
      if (o.window) {
        DWORD current = 0;
        GetWindowThreadProcessId((HWND)o.window, &current);
        if (!IsWindow((HWND)o.window) || current != owner) {
          closed->store(true);
          break;
        }
      }
      if (pool) {
        Direct3D11CaptureFrame frame{nullptr}, latest{nullptr};
        while ((frame = pool.TryGetNextFrame())) {
          if (latest)
            latest.Close();
          latest = frame;
        }
        if (latest) {
          const auto content = latest.ContentSize();
          auto access =
              latest.Surface()
                  .as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
          ComPtr<ID3D11Texture2D> texture;
          check(access->GetInterface(IID_PPV_ARGS(&texture)));
          D3D11_TEXTURE2D_DESC d{};
          texture->GetDesc(&d);
          if (content.Width > 0 && content.Height > 0)
            pipeline.copy(texture.Get(), std::min((UINT)content.Width, d.Width),
                          std::min((UINT)content.Height, d.Height));
          latest.Close();
          if (content.Width > 0 && content.Height > 0 &&
              (content.Width != size.Width || content.Height != size.Height)) {
            size = content;
            pool.Recreate(pipeline.winrtDevice(),
                          o.hdr ? DirectXPixelFormat::R16G16B16A16Float
                                : DirectXPixelFormat::B8G8R8A8UIntNormalized,
                          2, size);
          }
        }
      }
      auto now = std::chrono::steady_clock::now();
      if (pipeline.hasFrame()) {
        if (!ready) {
          origin = next = now;
          ready = true;
          std::cerr << "ECLIPSE_READY {\"startWall\":" << std::fixed << std::setprecision(3)
                    << epoch() << ",\"encoder\":\"" << pipeline.encoder
                    << "\",\"gpuScaling\":true,\"hdrTonemapped\":" << (o.hdr ? "true" : "false")
                    << "}" << std::endl;
        }
        const auto elapsed =
            std::chrono::duration_cast<std::chrono::nanoseconds>(now - origin).count();
        const auto frame = llround(elapsed * (double)o.fps / 1000000000);
        // Quantize timestamps to the requested cadence, while leaving real
        // stalls as gaps. Scheduler jitter must not halve the exported FPS.
        if (frame > lastFrame) {
          pipeline.write(frame * 10000000 / o.fps);
          lastFrame = frame;
        }
        if (o.test && elapsed > 3000000000LL)
          break;
      } else if (now - origin > std::chrono::seconds(8))
        throw hresult_error(E_FAIL, L"capture-no-frames");
      next += std::chrono::nanoseconds(1000000000 / o.fps);
      if (next < now)
        next = now;
      LARGE_INTEGER due{};
      due.QuadPart = -std::max<LONGLONG>(1, std::chrono::duration_cast<std::chrono::nanoseconds>(
                                                next - std::chrono::steady_clock::now())
                                                    .count() /
                                                100);
      if (!SetWaitableTimer(clock, &due, 0, nullptr, nullptr, FALSE))
        winrt::throw_last_error();
      WaitForSingleObject(clock, 100);
    }
    if (session)
      session.Close();
    if (pool)
      pool.Close();
    pipeline.finish();
    if (closed->load())
      throw hresult_error(E_FAIL, L"selected-window-closed");
    return 0;
  } catch (const winrt::hresult_error &error) {
    std::cerr << "Native video: " << winrt::to_string(error.message()) << " (0x" << std::hex
              << (unsigned long)error.code().value << ")" << std::endl;
    return 1;
  } catch (...) {
    std::cerr << "Native video failed" << std::endl;
    return 1;
  }
}
