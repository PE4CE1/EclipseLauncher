$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$locator = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $locator)) { throw 'Install the Visual Studio C++ build tools and a Windows 10/11 SDK.' }
$installation = & $locator -latest -prerelease -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'The Visual Studio C++ toolchain was not found.' }
$setup = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $workspace 'electron\native\MediaSessionHost.cpp'
$target = Join-Path $workspace 'electron\native\MediaSessionHost.exe'
$object = Join-Path $workspace '.cache\MediaSessionHost.obj'
New-Item -ItemType Directory -Path (Split-Path -Parent $object) -Force | Out-Null
$compileCommand = 'call "{0}" >nul && cl /nologo /std:c++20 /O2 /EHsc /MT /DWIN32_LEAN_AND_MEAN /DNOMINMAX "{1}" /Fe:"{2}" /Fo:"{3}" /link windowsapp.lib' -f $setup, $source, $target, $object
& cmd.exe /d /c $compileCommand
if ($LASTEXITCODE -ne 0) { throw 'Media session helper compilation failed.' }
