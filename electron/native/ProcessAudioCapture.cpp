#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <audiopolicy.h>
#include <functiondiscoverykeys_devpkey.h>
#include <tlhelp32.h>
#include <wrl.h>
#include <wrl/implements.h>
#include <iostream>
#include <vector>
#include <set>
#include <thread>
#include <string>
#include <cmath>
#include <io.h>
#include <fcntl.h>
using namespace Microsoft::WRL;

class EndpointChanges final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IMMNotificationClient> {
public:
  HANDLE changed=CreateEventW(nullptr,TRUE,FALSE,nullptr);
  EDataFlow flow=eCapture;std::wstring endpoint;
  ~EndpointChanges(){if(changed)CloseHandle(changed);}
  HRESULT OnDefaultDeviceChanged(EDataFlow next,ERole role,LPCWSTR id) override {
    if(next==flow&&role==eConsole&&(!id||endpoint!=id))SetEvent(changed);return S_OK;
  }
  HRESULT OnDeviceStateChanged(LPCWSTR id,DWORD state) override {if(id&&endpoint==id&&state!=DEVICE_STATE_ACTIVE)SetEvent(changed);return S_OK;}
  HRESULT OnDeviceRemoved(LPCWSTR id) override {if(id&&endpoint==id)SetEvent(changed);return S_OK;}
  HRESULT OnDeviceAdded(LPCWSTR) override {return S_OK;}
  HRESULT OnPropertyValueChanged(LPCWSTR,const PROPERTYKEY) override {return S_OK;}
};
// Notifications only signal an event. Device activation and pipe shutdown stay
// outside the Windows callback, and explicit endpoint selections remain pinned.
class DefaultEndpointWatch {
  ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<EndpointChanges> listener;
public:
  DefaultEndpointWatch(IMMDeviceEnumerator* devices,IMMDevice* device,EDataFlow flow,bool automatic){
    if(!automatic)return;listener=Make<EndpointChanges>();listener->flow=flow;LPWSTR id=nullptr;
    if(FAILED(device->GetId(&id)))throw std::runtime_error("Audio endpoint unavailable");listener->endpoint=id;CoTaskMemFree(id);
    enumerator=devices;if(!listener->changed||FAILED(enumerator->RegisterEndpointNotificationCallback(listener.Get())))throw std::runtime_error("Audio notifications unavailable");
    // Close the selection/registration race without doing COM work in callbacks.
    ComPtr<IMMDevice> current;LPWSTR currentId=nullptr;
    if(FAILED(enumerator->GetDefaultAudioEndpoint(flow,eConsole,&current))||FAILED(current->GetId(&currentId))||listener->endpoint!=currentId)SetEvent(listener->changed);
    CoTaskMemFree(currentId);
  }
  ~DefaultEndpointWatch(){if(enumerator&&listener)enumerator->UnregisterEndpointNotificationCallback(listener.Get());}
  HANDLE event()const{return listener?listener->changed:nullptr;}
};

class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  HRESULT result = E_PENDING;
  ComPtr<IAudioClient> client;
  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  PROPVARIANT value{};
  ~Activation() { CloseHandle(ready); }
  HRESULT ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> object;
    HRESULT call = operation->GetActivateResult(&result, &object);
    if(FAILED(call)) result = call;
    if(SUCCEEDED(result)) result = object.As(&client);
    SetEvent(ready); return S_OK;
  }
};

std::wstring processName(DWORD pid) {
  HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
  if(!process) return L"";
  wchar_t name[32768];DWORD length=32768;
  bool ok=QueryFullProcessImageNameW(process,0,name,&length)!=0;CloseHandle(process);
  if(!ok) return L"";
  std::wstring full(name,length);return full.substr(full.find_last_of(L"\\")+1);
}
std::string utf8(const std::wstring& value) {
  int length=WideCharToMultiByte(CP_UTF8,0,value.c_str(),(int)value.size(),nullptr,0,nullptr,nullptr);
  std::string output(length,0);WideCharToMultiByte(CP_UTF8,0,value.c_str(),(int)value.size(),output.data(),length,nullptr,nullptr);return output;
}
DWORD rootFor(DWORD pid) {
  auto name=processName(pid); if(name.empty()) return pid;
  HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if(snapshot==INVALID_HANDLE_VALUE)return pid;
  PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);std::vector<PROCESSENTRY32W> entries;
  if(Process32FirstW(snapshot,&entry))do{entries.push_back(entry);}while(Process32NextW(snapshot,&entry));CloseHandle(snapshot);
  std::set<DWORD> seen;
  while(seen.insert(pid).second) {
    DWORD parent=0;for(const auto& row:entries)if(row.th32ProcessID==pid){parent=row.th32ParentProcessID;break;}
    if(!parent||_wcsicmp(processName(parent).c_str(),name.c_str())!=0)break;pid=parent;
  }
  return pid;
}
int list() {
  ComPtr<IMMDeviceEnumerator> enumerator;HRESULT hr=CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator));if(FAILED(hr))return 2;
  ComPtr<IMMDeviceCollection> devices;if(FAILED(enumerator->EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE,&devices)))return 2;
  UINT count=0;devices->GetCount(&count);std::set<DWORD> seen;
  for(UINT i=0;i<count;i++) {
    ComPtr<IMMDevice> device;devices->Item(i,&device);ComPtr<IAudioSessionManager2> manager;
    if(FAILED(device->Activate(__uuidof(IAudioSessionManager2),CLSCTX_ALL,nullptr,&manager)))continue;
    ComPtr<IAudioSessionEnumerator> sessions;if(FAILED(manager->GetSessionEnumerator(&sessions)))continue;int total=0;sessions->GetCount(&total);
    for(int j=0;j<total;j++) {
      ComPtr<IAudioSessionControl> session;sessions->GetSession(j,&session);ComPtr<IAudioSessionControl2> control;if(FAILED(session.As(&control)))continue;
      DWORD pid=0;if(FAILED(control->GetProcessId(&pid))||!pid)continue;pid=rootFor(pid);
      auto name=utf8(processName(pid));if(name.empty()||!seen.insert(pid).second||name.find_first_of("\t\r\n")!=std::string::npos)continue;
      std::cout<<pid<<"\t"<<name<<"\n";
    }
  }
  return 0;
}
int record(ComPtr<IAudioClient> client, bool loopback,HANDLE deviceChanged=nullptr) {
  WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=48000;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=192000;
  HRESULT hr=client->Initialize(AUDCLNT_SHAREMODE_SHARED,(loopback?AUDCLNT_STREAMFLAGS_LOOPBACK:0)|AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM|AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,0,0,&format,nullptr);
  if(FAILED(hr)){std::cerr<<"Initialize failed: "<<std::hex<<hr<<std::endl;return 4;}
  HANDLE samples=CreateEventW(nullptr,FALSE,FALSE,nullptr),stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);
  if(!samples||!stop){if(samples)CloseHandle(samples);if(stop)CloseHandle(stop);return 5;}
  ComPtr<IAudioCaptureClient> reader;hr=client->GetService(IID_PPV_ARGS(&reader));
  if(FAILED(hr)||FAILED(client->SetEventHandle(samples))||FAILED(client->Start())){CloseHandle(samples);CloseHandle(stop);return 5;}
  LARGE_INTEGER qpc{},frequency{};FILETIME wall{};QueryPerformanceCounter(&qpc);QueryPerformanceFrequency(&frequency);GetSystemTimePreciseAsFileTime(&wall);
  ULARGE_INTEGER filetime{};filetime.LowPart=wall.dwLowDateTime;filetime.HighPart=wall.dwHighDateTime;
  const double epoch=(filetime.QuadPart-116444736000000000ULL)/10000.0,anchor=qpc.QuadPart*10000000.0/frequency.QuadPart;
  std::thread input([stop](){char byte;std::cin.get(byte);SetEvent(stop);});
  _setmode(_fileno(stdout),_O_BINARY);std::cerr<<"READY"<<std::endl;
  HANDLE events[]={stop,samples,deviceChanged};std::vector<BYTE> silence(192000,0);bool switched=false;
  bool clockReady=false;UINT64 capturedFrames=0;double packetOrigin=0;
  while(true) {
    DWORD event=WaitForMultipleObjects(deviceChanged?3:2,events,FALSE,1000);
    if(event==WAIT_OBJECT_0||event==WAIT_FAILED)break;
    if(deviceChanged&&event==WAIT_OBJECT_0+2){switched=true;break;}
    UINT32 frames=0;if(FAILED(reader->GetNextPacketSize(&frames)))break;
    while(frames) {
      BYTE* data=nullptr;DWORD flags=0;UINT64 time=0;
      if(FAILED(reader->GetBuffer(&data,&frames,&flags,nullptr,&time)))goto done;
      const bool validTimestamp=!(flags&AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR);
      if(!clockReady||(flags&AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY)){
        LARGE_INTEGER current{};QueryPerformanceCounter(&current);
        packetOrigin=validTimestamp?epoch+(time-anchor)/10000.0:epoch+(current.QuadPart*10000000.0/frequency.QuadPart-anchor)/10000.0-frames/48.0;
        packetOrigin=std::round(packetOrigin*48.0)/48.0;
        capturedFrames=0;clockReady=true;
      }
      // Endpoint QPC timestamps can jitter by dozens of samples per packet.
      // Count the converted 48 kHz output samples: endpoint positions can use
      // another rate, and a resampler can emit a shorter initial packet. Real
      // discontinuity flags re-anchor the clock instead of hiding lost audio.
      const double timestamp=packetOrigin+capturedFrames/48.0;
      capturedFrames+=frames;
      if(frames>48000){reader->ReleaseBuffer(frames);goto done;}
      std::cout.write((const char*)&timestamp,sizeof(timestamp));std::cout.write((const char*)&frames,sizeof(frames));
      std::cout.write((const char*)((flags&AUDCLNT_BUFFERFLAGS_SILENT)?silence.data():data),frames*4);std::cout.flush();reader->ReleaseBuffer(frames);
      if(!std::cout.good()){SetEvent(stop);goto done;}
      if(FAILED(reader->GetNextPacketSize(&frames)))goto done;
    }
  }
 done:
  if(deviceChanged&&WaitForSingleObject(deviceChanged,0)==WAIT_OBJECT_0)switched=true;
  client->Stop();SetEvent(stop);while(WaitForSingleObject(input.native_handle(),1)==WAIT_TIMEOUT)CancelSynchronousIo(input.native_handle());input.join();CloseHandle(samples);CloseHandle(stop);
  if(switched)std::cerr<<"DEVICE_CHANGED"<<std::endl;return switched?17:0;
}

int microphones() {
  ComPtr<IMMDeviceEnumerator> enumerator;
  if(FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator))))return 2;
  ComPtr<IMMDeviceCollection> devices;if(FAILED(enumerator->EnumAudioEndpoints(eCapture,DEVICE_STATE_ACTIVE,&devices)))return 2;
  ComPtr<IMMDevice> defaultDevice;enumerator->GetDefaultAudioEndpoint(eCapture,eConsole,&defaultDevice);
  LPWSTR defaultId=nullptr;if(defaultDevice)defaultDevice->GetId(&defaultId);
  UINT count=0;devices->GetCount(&count);
  for(UINT i=0;i<count;i++) {
    ComPtr<IMMDevice> device;ComPtr<IPropertyStore> properties;LPWSTR id=nullptr;
    if(FAILED(devices->Item(i,&device))||FAILED(device->GetId(&id)))continue;
    PROPVARIANT name{};PropVariantInit(&name);
    if(SUCCEEDED(device->OpenPropertyStore(STGM_READ,&properties))&&SUCCEEDED(properties->GetValue(PKEY_Device_FriendlyName,&name))&&name.vt==VT_LPWSTR) {
      auto key=utf8(id),label=utf8(name.pwszVal);
      if(key.find_first_of("\t\r\n")==std::string::npos&&label.find_first_of("\t\r\n")==std::string::npos)
        std::cout<<key<<"\t"<<label<<"\t"<<(defaultId&&wcscmp(id,defaultId)==0?"1":"0")<<"\n";
    }
    PropVariantClear(&name);CoTaskMemFree(id);
  }
  CoTaskMemFree(defaultId);return 0;
}

int microphone(const wchar_t* id) {
  ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<IMMDevice> device;ComPtr<IAudioClient> client;
  if(FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator))))return 2;
  HRESULT hr=wcscmp(id,L"auto")==0?enumerator->GetDefaultAudioEndpoint(eCapture,eConsole,&device):enumerator->GetDevice(id,&device);
  if(FAILED(hr)||FAILED(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,&client)))return 3;
  ComPtr<IAudioClient2> properties;
  if(FAILED(client.As(&properties)))return 3;
  AudioClientProperties options{};options.cbSize=sizeof(options);options.eCategory=AudioCategory_Other;
  // Preserve Windows capture effects, including third-party APOs. RAW would
  // deliberately bypass that processing; offload/exclusive mode is not used.
  options.Options=AUDCLNT_STREAMOPTIONS_NONE;options.bIsOffload=FALSE;
  if(FAILED(properties->SetClientProperties(&options)))return 3;
  DefaultEndpointWatch watch(enumerator.Get(),device.Get(),eCapture,wcscmp(id,L"auto")==0);return record(client,false,watch.event());
}

int capture(DWORD pid) {
  auto activation=Make<Activation>();activation->params.ActivationType=AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  activation->params.ProcessLoopbackParams.TargetProcessId=pid;activation->params.ProcessLoopbackParams.ProcessLoopbackMode=PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  activation->value.vt=VT_BLOB;activation->value.blob.cbSize=sizeof(activation->params);activation->value.blob.pBlobData=(BYTE*)&activation->params;
  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT hr=ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,__uuidof(IAudioClient),&activation->value,activation.Get(),&operation);
  if(FAILED(hr)||WaitForSingleObject(activation->ready,5000)!=WAIT_OBJECT_0||FAILED(activation->result)){std::cerr<<"Activation failed: "<<std::hex<<(FAILED(hr)?hr:activation->result)<<std::endl;return 3;}
  return record(activation->client,true);
}

int desktop(const wchar_t* id) {
  ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<IMMDevice> device;ComPtr<IAudioClient> client;
  if(FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator))))return 2;
  HRESULT hr=wcscmp(id,L"auto")==0?enumerator->GetDefaultAudioEndpoint(eRender,eConsole,&device):enumerator->GetDevice(id,&device);
  if(FAILED(hr)||FAILED(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,&client)))return 3;
  DefaultEndpointWatch watch(enumerator.Get(),device.Get(),eRender,wcscmp(id,L"auto")==0);return record(client,true,watch.event());
}
int wmain(int argc,wchar_t** argv) {
  if(FAILED(CoInitializeEx(nullptr,COINIT_MULTITHREADED)))return 1;
  try{
  int result=2;
  if(argc==2&&wcscmp(argv[1],L"--list")==0)result=list();
  else if(argc==2&&wcscmp(argv[1],L"--list-inputs")==0)result=microphones();
  else if(argc==3&&wcscmp(argv[1],L"--microphone")==0)result=microphone(argv[2]);
  else if(argc==3&&wcscmp(argv[1],L"--desktop")==0)result=desktop(argv[2]);
  else if(argc==3&&wcscmp(argv[1],L"--capture")==0){wchar_t* end=nullptr;unsigned long pid=wcstoul(argv[2],&end,10);if(pid&&end&&!*end)result=capture(pid);}
  CoUninitialize();return result;
  }catch(const std::exception& error){std::cerr<<error.what()<<std::endl;CoUninitialize();return 3;}
}
