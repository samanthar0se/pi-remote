[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

Get-Process -Name "Pi-Remote-portable", "pi-remote" -ErrorAction SilentlyContinue | Stop-Process -Force

corepack prepare pnpm@10.14.0 --activate
if ($LASTEXITCODE -ne 0) { throw "Could not activate pnpm." }

corepack pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Could not install dependencies." }

$env:VITE_BUILD_REVISION = (git rev-parse --short HEAD).Trim()
Write-Host "Starting Pi Remote from revision $env:VITE_BUILD_REVISION" -ForegroundColor Green

corepack pnpm --filter @pi-remote/desktop tauri dev
if ($LASTEXITCODE -ne 0) { throw "Pi Remote development app exited with an error." }
