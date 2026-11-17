#include <windows.h>
#include <string>
#include <thread>
#include <iostream>

std::wstring quote(const wchar_t* input){
  std::wstring result=L"\"";size_t slashes=0;
  for(const wchar_t* p=input;*p;p++){
    if(*p==L'\\'){slashes++;continue;}
    result.append(slashes*(*p==L'"'?2:1),L'\\');slashes=0;
    if(*p==L'"')result+=L'\\';result+=*p;
  }
  result.append(slashes*2,L'\\');return result+L'"';
}
int wmain(int argc,wchar_t** argv){
  if(argc<2)return 1;
  HANDLE job=CreateJobObjectW(nullptr,nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if(!job||!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits))){if(job)CloseHandle(job);return 2;}
  SECURITY_ATTRIBUTES security{sizeof(security),nullptr,TRUE};HANDLE inputRead=nullptr,inputWrite=nullptr;
  if(!CreatePipe(&inputRead,&inputWrite,&security,0)){CloseHandle(job);return 3;}
  SetHandleInformation(inputWrite,HANDLE_FLAG_INHERIT,0);
  STARTUPINFOW startup{};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESTDHANDLES;
  startup.hStdInput=inputRead;startup.hStdOutput=GetStdHandle(STD_OUTPUT_HANDLE);startup.hStdError=GetStdHandle(STD_ERROR_HANDLE);
  SetHandleInformation(startup.hStdOutput,HANDLE_FLAG_INHERIT,HANDLE_FLAG_INHERIT);SetHandleInformation(startup.hStdError,HANDLE_FLAG_INHERIT,HANDLE_FLAG_INHERIT);
  std::wstring command;
  for(int i=1;i<argc;i++){if(i>1)command+=L' ';command+=quote(argv[i]);}
  PROCESS_INFORMATION process{};
  bool created=CreateProcessW(argv[1],command.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW|CREATE_SUSPENDED,nullptr,nullptr,&startup,&process)!=FALSE;
  CloseHandle(inputRead);
  if(!created){CloseHandle(inputWrite);CloseHandle(job);return 4;}
  // Refuse unsafe startup if Windows cannot guarantee cleanup after a host crash.
  if(!AssignProcessToJobObject(job,process.hProcess)){TerminateProcess(process.hProcess,5);CloseHandle(process.hThread);CloseHandle(process.hProcess);CloseHandle(inputWrite);CloseHandle(job);std::cerr<<"Native capture lifetime guard unavailable\n";return 5;}
  ResumeThread(process.hThread);CloseHandle(process.hThread);
  std::thread input([&](){char data[256];DWORD count=0,written=0;while(ReadFile(GetStdHandle(STD_INPUT_HANDLE),data,sizeof(data),&count,nullptr)&&count){if(!WriteFile(inputWrite,data,count,&written,nullptr))break;}TerminateJobObject(job,0);});
  WaitForSingleObject(process.hProcess,INFINITE);
  DWORD code=1;GetExitCodeProcess(process.hProcess,&code);
  // The reader may not have entered ReadFile yet when the encoder exits.
  while(WaitForSingleObject(input.native_handle(),1)==WAIT_TIMEOUT)CancelSynchronousIo(input.native_handle());
  input.join();
  CloseHandle(inputWrite);CloseHandle(process.hProcess);CloseHandle(job);return static_cast<int>(code);
}
