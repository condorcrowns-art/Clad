<#
.SYNOPSIS
  One-shot Windows setup for Parla: installs Ollama, configures it for the
  browser, pulls a Spanish-capable model, and starts the app.

.DESCRIPTION
  Run this from an ADMINISTRATOR PowerShell window. It is safe to re-run -
  every step checks whether it is already done and skips if so.

  What it does:
    1. Installs Ollama via winget (skipped if already installed)
    2. Sets OLLAMA_ORIGINS=* machine-wide, so the browser is allowed to talk
       to it. Without this Ollama refuses the request and Parla falls back to
       its scripted partner.
    3. Restarts Ollama so it picks that variable up
    4. Pulls a model sized to your RAM
    5. Starts the local web server and opens the app

.EXAMPLE
  .\setup-windows.ps1
  .\setup-windows.ps1 -Model qwen2.5:3b     # force a smaller model
  .\setup-windows.ps1 -SkipOllama           # just run the app
#>
[CmdletBinding()]
param(
  [string]$Model = '',
  [int]$Port = 8000,
  [switch]$SkipOllama
)

$ErrorActionPreference = 'Stop'

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Note($text)     { Write-Host "    --  $text" -ForegroundColor DarkGray }
function Warn($text)     { Write-Host "    !!  $text" -ForegroundColor Yellow }

Write-Host "`n=== Parla setup ===" -ForegroundColor Magenta

# Admin is needed to set a machine-wide env var and to bind the HTTP port.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "`nThis needs an Administrator PowerShell window." -ForegroundColor Red
  Write-Host "Right-click PowerShell -> 'Run as administrator', then run this again."
  exit 1
}

if (-not $SkipOllama) {

  Step 1 "Installing Ollama"
  if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Ok "already installed"
  } else {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Host "    winget not found. Install Ollama manually from https://ollama.com/download" -ForegroundColor Red
      exit 1
    }
    winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
    # winget updates PATH for new processes, not this one.
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    Ok "installed"
  }

  Step 2 "Allowing the browser to reach Ollama (OLLAMA_ORIGINS=*)"
  $current = [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'Machine')
  if ($current -eq '*') {
    Ok "already set"
  } else {
    [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'Machine')
    Ok "set machine-wide"
  }
  $env:OLLAMA_ORIGINS = '*'

  Step 3 "Restarting Ollama so it picks that up"
  Get-Process ollama, 'ollama app' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 4
  Ok "restarted"

  Step 4 "Choosing and pulling a model"
  if (-not $Model) {
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    Note "detected ${ramGB} GB RAM"
    # Leave headroom for Windows itself - a model that swaps is unusable.
    if     ($ramGB -ge 32) { $Model = 'qwen2.5:14b' }
    elseif ($ramGB -ge 16) { $Model = 'qwen2.5:7b'  }
    elseif ($ramGB -ge 8)  { $Model = 'qwen2.5:3b'  }
    else                   { $Model = 'qwen2.5:1.5b' }
  }
  Note "using $Model  (qwen2.5 handles Spanish better than llama3.2 at the same size)"
  Note "this downloads a few GB the first time - it is a one-off"
  ollama pull $Model
  Ok "$Model ready"

  Step 5 "Verifying"
  try {
    $tags = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 10
    Ok ("Ollama responding, models: " + (($tags.models | ForEach-Object { $_.name }) -join ', '))
  } catch {
    Warn "Ollama did not answer on port 11434. Open the Ollama app manually, then re-run this."
  }
}

Step 6 "Starting Parla"
$serve = Join-Path $PSScriptRoot 'serve.ps1'
if (-not (Test-Path $serve)) {
  Write-Host "    Could not find serve.ps1 next to this script." -ForegroundColor Red
  Write-Host "    Are you running this from inside the 'parla' folder?"
  exit 1
}

Write-Host @"

  Setup done. Opening http://localhost:$Port

  In the app: the chip in the top-right should read 'ollama' in green.
  If it reads 'ollama X' in red, go to Settings -> Test connection.

  Leave this window open while you use Parla. Ctrl+C stops it.

"@ -ForegroundColor Green

& $serve -Port $Port
