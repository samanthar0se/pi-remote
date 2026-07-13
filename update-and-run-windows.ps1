[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

Write-Host "Updating Pi Remote..." -ForegroundColor Cyan
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "Could not update the repository." }

& "$PSScriptRoot\run-windows.ps1"
