$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$locator = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -prerelease -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Install the Visual Studio C++ build tools and Windows SDK.' }
$setup = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $workspace 'electron\native\NativeDisplayInfo.cpp'
$target = Join-Path $workspace 'electron\native\NativeDisplayInfo.exe'
$object = Join-Path $workspace '.cache\NativeDisplayInfo.obj'
New-Item -ItemType Directory -Path (Split-Path -Parent $object) -Force | Out-Null
$command = 'call "{0}" >nul && cl /nologo /std:c++17 /O2 /EHsc /MT "{1}" /Fe:"{2}" /Fo:"{3}" /link dxgi.lib user32.lib dwmapi.lib' -f $setup,$source,$target,$object
& cmd.exe /d /c $command
if ($LASTEXITCODE -ne 0) { throw 'Native display helper compilation failed.' }
$hostSource = Join-Path $workspace 'electron\native\NativeCaptureHost.cpp'
$hostTarget = Join-Path $workspace 'electron\native\NativeCaptureHost.exe'
$hostObject = Join-Path $workspace '.cache\NativeCaptureHost.obj'
$hostCommand = 'call "{0}" >nul && cl /nologo /std:c++17 /O2 /EHsc /MT "{1}" /Fe:"{2}" /Fo:"{3}"' -f $setup,$hostSource,$hostTarget,$hostObject
& cmd.exe /d /c $hostCommand
if ($LASTEXITCODE -ne 0) { throw 'Native capture lifetime guard compilation failed.' }
& (Join-Path $PSScriptRoot 'build-native-video.ps1')
& (Join-Path $PSScriptRoot 'build-process-audio.ps1') -TargetName ProcessAudioCapture.pcm.exe
