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

  Step 4 "Choosing a model"

  # What decides conversation speed is VRAM, not system RAM. A 14B model on a
  # GPU answers in ~2s; the same model on CPU takes 15-20s per reply, which is
  # unusable when you are standing there waiting to speak.
  $vramGB = 0
  $gpuName = ''

  # 1. nvidia-smi is the most reliable source when it exists.
  $smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($smi) {
    try {
      $out = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1
      if ($out) {
        $parts = $out -split ','
        $gpuName = $parts[0].Trim()
        $vramGB  = [math]::Round([double]($parts[1].Trim()) / 1024)
      }
    } catch { }
  }

  # 2. Fall back to the registry, which reports VRAM above 4GB correctly
  #    (Win32_VideoController.AdapterRAM is a 32-bit field and silently caps).
  if ($vramGB -le 0) {
    try {
      $keys = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue
      foreach ($k in $keys) {
        $qw = (Get-ItemProperty $k.PSPath -Name 'HardwareInformation.qwMemorySize' -ErrorAction SilentlyContinue).'HardwareInformation.qwMemorySize'
        if ($qw) {
          $g = [math]::Round($qw / 1GB)
          if ($g -gt $vramGB) {
            $vramGB = $g
            $gpuName = (Get-ItemProperty $k.PSPath -Name 'DriverDesc' -ErrorAction SilentlyContinue).DriverDesc
          }
        }
      }
    } catch { }
  }

  $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
  Note "system RAM: ${ramGB} GB"
  if ($vramGB -gt 0) { Note "GPU: $gpuName (${vramGB} GB VRAM)" }
  else               { Note "no dedicated GPU detected - will run on CPU" }

  if (-not $Model) {
    if     ($vramGB -ge 10) { $Model = 'qwen2.5:14b' }
    elseif ($vramGB -ge 6)  { $Model = 'qwen2.5:7b'  }
    elseif ($vramGB -ge 4) { $Model = 'qwen2.5:3b'  }
    elseif ($ramGB -ge 16) { $Model = 'qwen2.5:7b'  }   # CPU: tolerable, not fast
    else                   { $Model = 'qwen2.5:3b'  }
  }

  Note "choosing $Model"
  Note "(qwen2.5 speaks better Spanish than llama3.2 at the same size)"

  Step 5 "Pulling $Model - a few GB the first time, one-off"
  ollama pull $Model
  Ok "$Model ready"

  Step 6 "Measuring how fast it actually replies on your machine"
  try {
    $body = @{
      model  = $Model
      prompt = 'Responde en espanol en una frase corta: como estas?'
      stream = $false
      options = @{ num_predict = 40 }
    } | ConvertTo-Json -Depth 5

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $gen = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post `
             -Body $body -ContentType 'application/json' -TimeoutSec 300
    $sw.Stop()

    $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    if ($gen.eval_count -and $gen.eval_duration) {
      $tps = [math]::Round($gen.eval_count / ($gen.eval_duration / 1e9), 1)
      Note "$tps tokens/sec"
    }
    Ok "first reply took ${secs}s"
    Note ("it said: " + $gen.response.Trim())

    # A typical Parla reply is ~40 tokens, so this timing is representative.
    if ($secs -gt 12) {
      Warn "That is slow enough to be annoying in conversation."
      Warn "Drop to a smaller model with:  .\setup-windows.ps1 -Model qwen2.5:7b"
      Warn "(or qwen2.5:3b if 7b is still slow)"
    } elseif ($secs -gt 6) {
      Note "Usable, but a smaller model would feel snappier: -Model qwen2.5:7b"
    } else {
      Ok "That is comfortably fast for conversation."
    }
  } catch {
    Warn "Could not time a generation: $($_.Exception.Message)"
  }

  Step 7 "Verifying"
  try {
    $tags = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 10
    Ok ("Ollama responding, models: " + (($tags.models | ForEach-Object { $_.name }) -join ', '))
  } catch {
    Warn "Ollama did not answer on port 11434. Open the Ollama app manually, then re-run this."
  }
}

Step 8 "Starting Parla"
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
