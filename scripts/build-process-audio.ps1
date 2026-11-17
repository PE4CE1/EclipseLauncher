param([ValidateSet('ProcessAudioCapture.exe','ProcessAudioCapture.apo.exe','ProcessAudioCapture.native.exe','ProcessAudioCapture.pcm.exe')][string]$TargetName = 'ProcessAudioCapture.apo.exe')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$locator = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $locator)) { throw 'Install the Visual Studio C++ build tools and a Windows 10/11 SDK.' }
$installation = & $locator -latest -prerelease -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'The Visual Studio C++ toolchain was not found.' }
$setup = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $workspace 'electron\native\ProcessAudioCapture.cpp'
$binaryName = $TargetName
$nativeDirectory = [IO.Path]::GetFullPath((Join-Path $workspace 'electron\native'))
if ($TargetName -eq 'ProcessAudioCapture.pcm.exe') {
  # A running replay keeps its helper open. Publish a content-addressed helper
  # only after compilation succeeds, so a dev reload never loads a partial EXE.
  $hashInput = [Text.Encoding]::UTF8.GetBytes((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash + (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $revision = [BitConverter]::ToString($hasher.ComputeHash($hashInput)).Replace('-', '').ToLowerInvariant().Substring(0, 12) } finally { $hasher.Dispose() }
  $binaryName = 'ProcessAudioCapture.pcm.' + $revision + '.exe'
}
$target = Join-Path $nativeDirectory $binaryName
$object = Join-Path $workspace '.cache\ProcessAudioCapture.obj'
New-Item -ItemType Directory -Path (Split-Path -Parent $object) -Force | Out-Null
$versioned = $TargetName -eq 'ProcessAudioCapture.pcm.exe'
if (!$versioned -or !(Test-Path -LiteralPath $target)) {
  $compilerTarget = if ($versioned) { Join-Path $workspace ('.cache\audio-' + [Guid]::NewGuid().ToString('N') + '.exe') } else { $target }
  try {
    $compileCommand = 'call "{0}" >nul && cl /nologo /std:c++17 /O2 /EHsc /MT "{1}" /Fe:"{2}" /Fo:"{3}" /link ole32.lib mmdevapi.lib uuid.lib' -f $setup, $source, $compilerTarget, $object
    & cmd.exe /d /c $compileCommand
    if ($LASTEXITCODE -ne 0) { throw 'Process audio helper compilation failed.' }
    if ($versioned) { [IO.File]::Move($compilerTarget,$target) }
  } finally {
    if ($versioned -and (Test-Path -LiteralPath $compilerTarget)) { Remove-Item -LiteralPath $compilerTarget -ErrorAction SilentlyContinue }
  }
}
if ($binaryName -match '^ProcessAudioCapture\.pcm\.[a-f0-9]{12}\.exe$') {
  $manifest = Join-Path $nativeDirectory 'audio-capture.json'
  $contents = (@{file=$binaryName} | ConvertTo-Json -Compress) + [Environment]::NewLine
  if (!(Test-Path -LiteralPath $manifest) -or [IO.File]::ReadAllText($manifest) -ne $contents) {
    $temporaryManifest = $manifest + '.tmp'
    [IO.File]::WriteAllText($temporaryManifest,$contents,(New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $manifest) { [IO.File]::Replace($temporaryManifest,$manifest,[NullString]::Value) } else { [IO.File]::Move($temporaryManifest,$manifest) }
  }
  foreach ($previous in Get-ChildItem -LiteralPath $nativeDirectory -File) {
    if ($previous.Name -ne $binaryName -and $previous.Name -match '^ProcessAudioCapture\.pcm\.[a-f0-9]{12}\.exe$' -and [IO.Path]::GetFullPath($previous.DirectoryName) -eq $nativeDirectory) {
      try { Remove-Item -LiteralPath $previous.FullName -ErrorAction Stop } catch { }
    }
  }
}
