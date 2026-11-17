#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmsystem.h>
#include <iostream>
#include <vector>
#include <cmath>
int main(int argc,char**argv){double frequency=argc>1?atof(argv[1]):440;WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=48000;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=192000;HWAVEOUT output=nullptr;if(waveOutOpen(&output,WAVE_MAPPER,&format,0,0,CALLBACK_NULL)!=MMSYSERR_NOERROR)return 77;
std::vector<short> samples(48000*2);for(int i=0;i<48000;i++)samples[2*i]=samples[2*i+1]=(short)(64*sin(2*3.141592653589793*frequency*i/48000));WAVEHDR header{};header.lpData=(LPSTR)samples.data();header.dwBufferLength=(DWORD)samples.size()*2;header.dwFlags=WHDR_BEGINLOOP|WHDR_ENDLOOP;header.dwLoops=100000;waveOutPrepareHeader(output,&header,sizeof(header));waveOutWrite(output,&header,sizeof(header));std::cout<<"READY"<<std::endl;char stop;std::cin.get(stop);waveOutReset(output);waveOutUnprepareHeader(output,&header,sizeof(header));waveOutClose(output);return 0;}
