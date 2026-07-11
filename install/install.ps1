# aiws installer for Windows — downloads the prebuilt binary (no Node.js required).
#
#   irm https://raw.githubusercontent.com/vanhbakaa/aiws/main/install/install.ps1 | iex
#
$ErrorActionPreference = "Stop"
$Repo = "vanhbakaa/aiws"

# Bun compiles a Windows x64 binary; arm64 users should use `npm install -g aiws`.
$asset = "aiws-windows-x64.exe"
$url = "https://github.com/$Repo/releases/latest/download/$asset"

$dir = Join-Path $env:LOCALAPPDATA "aiws\bin"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$out = Join-Path $dir "aiws.exe"

Write-Host "-> Downloading $asset ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $out

# Add the install dir to the user PATH if it's not already there.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $dir) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$dir", "User")
  $env:Path = "$env:Path;$dir"
  Write-Host "  Added $dir to your PATH (open a new terminal to pick it up)." -ForegroundColor DarkGray
}

Write-Host "OK Installed aiws -> $out" -ForegroundColor Green
Write-Host "   Run:  aiws"
