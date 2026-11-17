$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$locator = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -prerelease -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Install the Visual Studio C++ build tools and Windows SDK.' }
$setup = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $workspace 'electron\native\NativeVideoCapture.cpp'
$target = Join-Path $workspace 'electron\native\NativeVideoCapture.wgc.exe'
$object = Join-Path $workspace '.cache\NativeVideoCapture.obj'
New-Item -ItemType Directory -Path (Split-Path -Parent $object) -Force | Out-Null
$command = 'call "{0}" >nul && cl /nologo /std:c++20 /O2 /EHsc /MT "{1}" /Fe:"{2}" /Fo:"{3}" /link windowsapp.lib d3d11.lib d3dcompiler.lib dxgi.lib mfplat.lib mfreadwrite.lib mfuuid.lib ole32.lib oleaut32.lib user32.lib' -f $setup,$source,$target,$object
& cmd.exe /d /c $command
if ($LASTEXITCODE -ne 0) { throw 'Native GPU capture compilation failed.' }
