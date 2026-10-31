# Builds TitleBarStyler.exe with the C# compiler that ships with Windows (no SDK needed).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out = Join-Path $here 'bin'
New-Item -ItemType Directory -Force $out | Out-Null

# A running copy locks the exe; stop it so the build can overwrite it.
$running = Get-Process TitleBarStyler -ErrorAction SilentlyContinue
if ($running) {
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue
    Write-Host "Stopped running TitleBarStyler (start it again after the build)."
}

& $csc /nologo /target:winexe /platform:x64 /optimize+ `
    /win32manifest:"$here\app.manifest" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    /out:"$out\TitleBarStyler.exe" "$here\Program.cs"
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Write-Host "Built $out\TitleBarStyler.exe"
