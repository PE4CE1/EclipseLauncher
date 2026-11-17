$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $workspace 'electron\native\OverlayWindowEffects.cs'
$target = Join-Path $workspace 'electron\native\OverlayWindowEffects.exe'
& $compiler /nologo /optimize+ /target:exe /platform:x64 "/out:$target" $source
if ($LASTEXITCODE -ne 0) { throw 'Overlay window effects helper compilation failed.' }
