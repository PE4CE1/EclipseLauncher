$ErrorActionPreference = 'Stop'
$fpsWorkspace = Split-Path -Parent $PSScriptRoot
$fpsCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fpsSource = Join-Path $fpsWorkspace 'electron\native\PresentMon\FpsBroker.cs'
$fpsTarget = Join-Path $fpsWorkspace 'electron\native\PresentMon\FpsBroker.exe'
if (!(Test-Path -LiteralPath $fpsCompiler)) { throw 'The Windows .NET Framework C# compiler was not found.' }
& $fpsCompiler '/nologo' '/optimize+' '/target:exe' '/platform:x64' ('/out:' + $fpsTarget) $fpsSource
if ($LASTEXITCODE -ne 0) { throw 'The FPS helper could not be compiled.' }
