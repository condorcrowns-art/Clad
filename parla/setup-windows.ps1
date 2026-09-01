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
    4. Detects your GPU and picks a model sized to VRAM (not system RAM -
       VRAM is what decides whether replies feel instant or sluggish)
    5. Pulls it, then times one real generation and tells you if it is too
       slow to hold a conversation with
    6. Installs Piper, a neural text-to-speech voice that runs on this machine.
       Windows' own Spanish voices are decade-old SAPI ones that sound robotic;
       Piper sounds like a person. Also free, also local, also offline.
    7. Starts the local web server and opens the app

  Everything here is free and stays on this machine. Nothing is billed, no
  account is created, and no audio or text is sent anywhere.

.EXAMPLE
  .\setup-windows.ps1
  .\setup-windows.ps1 -Model qwen2.5:3b     # force a smaller model
  .\setup-windows.ps1 -SkipOllama           # just run the app
  .\setup-windows.ps1 -SkipVoice            # do not install the neural voice
#>
[CmdletBinding()]
param(
  [string]$Model = '',
  [int]$Port = 8000,
  [switch]$SkipOllama,
  [switch]$SkipVoice
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

  # Thresholds are on USABLE VRAM, not total. Windows holds ~1.5 GB for the
  # desktop, and a model needs its weights PLUS context and compute buffers.
  # If the whole thing does not fit, Ollama silently spills layers to the CPU
  # and the CPU half sets the pace - a 12 GB card running the 9 GB 14b model
  # measured 4.1 tok/s, which is CPU speed. Weights: 14b=9.0GB, 7b=4.7GB,
  # 3b=1.9GB; leave roughly 3 GB of headroom above the weights.
  if (-not $Model) {
    if     ($vramGB -ge 16) { $Model = 'qwen2.5:14b' }
    elseif ($vramGB -ge 8)  { $Model = 'qwen2.5:7b'  }
    elseif ($vramGB -ge 5)  { $Model = 'qwen2.5:3b'  }
    elseif ($ramGB -ge 16)  { $Model = 'qwen2.5:7b'  }   # CPU: tolerable, not fast
    else                    { $Model = 'qwen2.5:3b'  }
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

    # The first call also loads the model from disk, which can dominate the
    # wall clock and has nothing to do with conversation speed - keep_alive
    # keeps the model resident, so only the very first turn ever pays it.
    # Ollama reports the split, so judge on the warm number, not the total.
    $loadSecs = 0
    $warmSecs = $secs
    if ($gen.load_duration -and $gen.total_duration) {
      $loadSecs = [math]::Round($gen.load_duration / 1e9, 1)
      $warmSecs = [math]::Round(($gen.total_duration - $gen.load_duration) / 1e9, 1)
    }

    if ($gen.eval_count -and $gen.eval_duration) {
      $tps = [math]::Round($gen.eval_count / ($gen.eval_duration / 1e9), 1)
      Note "$tps tokens/sec"
    }
    Ok "first reply took ${secs}s (${loadSecs}s of that was loading the model)"
    Ok "every later reply: about ${warmSecs}s - the model stays loaded"
    Note ("it said: " + $gen.response.Trim())

    # /api/ps reports how much of the model is actually resident in VRAM.
    # Anything under ~99% means layers spilled to the CPU, which is the single
    # most common reason a capable GPU still feels slow.
    try {
      $ps = Invoke-RestMethod -Uri 'http://localhost:11434/api/ps' -TimeoutSec 10
      $m  = $ps.models | Where-Object { $_.name -eq $Model } | Select-Object -First 1
      if ($m -and $m.size -gt 0) {
        $pct = [math]::Round(100 * $m.size_vram / $m.size)
        if ($pct -ge 99) {
          Ok "fully on the GPU (${pct}% of the model in VRAM)"
        } else {
          Warn "only ${pct}% of the model fits in VRAM - the rest runs on your CPU"
          Warn "That spill is why it is slow, not the model being 'big'."
        }
      }
    } catch { }

    # A typical Parla reply is ~40 tokens, so this timing is representative.
    # Judged on the warm number: a slow disk can add seconds to the first load
    # without saying anything about how the conversation will feel.
    $secs = $warmSecs
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

  Step 7 "Verifying Ollama"
  try {
    $tags = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 10
    Ok ("Ollama responding, models: " + (($tags.models | ForEach-Object { $_.name }) -join ', '))
  } catch {
    Warn "Ollama did not answer on port 11434. Open the Ollama app manually, then re-run this."
  }
}

Step 8 "Installing the neural voice (Piper)"

# Downloads are quiet and fast only if the progress renderer is off - in
# Windows PowerShell it repaints per chunk and can triple the time for a 60 MB
# file. Also force TLS 1.2: 5.1 still negotiates SSL3/TLS1 by default and both
# GitHub and Hugging Face refuse those.
$oldProgress = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$piperDir  = Join-Path $PSScriptRoot 'piper'
$voicesDir = Join-Path $PSScriptRoot 'voices'
$piperExe  = Join-Path $piperDir 'piper.exe'

if ($SkipVoice) {
  Note "skipped (-SkipVoice) - the app will use your browser's voices"
} else {
  try {
    if (Test-Path $piperExe -PathType Leaf) {
      Ok "piper already installed"
    } else {
      # Resolve the download from the releases API rather than hardcoding a
      # version that will rot. The pinned URL below is only the parachute.
      $url = ''
      try {
        $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/rhasspy/piper/releases/latest' `
                 -Headers @{ 'User-Agent' = 'parla-setup' } -TimeoutSec 30
        $hit = $rel.assets | Where-Object { $_.name -match 'windows.*amd64.*\.zip$' } | Select-Object -First 1
        if ($hit) { $url = $hit.browser_download_url }
      } catch { }
      if (-not $url) {
        Note "releases API unreachable - using the last known good build"
        $url = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
      }

      $zip = Join-Path $env:TEMP 'parla-piper.zip'
      Note "downloading piper (about 20 MB)"
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600

      if (Test-Path $piperDir) { Remove-Item $piperDir -Recurse -Force -ErrorAction SilentlyContinue }
      # The archive already contains a top-level piper\ folder, so expand into
      # the app folder rather than into piper\ or you get piper\piper\.
      Expand-Archive -Path $zip -DestinationPath $PSScriptRoot -Force
      Remove-Item $zip -Force -ErrorAction SilentlyContinue

      if (-not (Test-Path $piperExe -PathType Leaf)) {
        # Some builds nest it one deeper; find it wherever it landed.
        $found = Get-ChildItem $PSScriptRoot -Filter 'piper.exe' -Recurse -File -ErrorAction SilentlyContinue |
                   Select-Object -First 1
        if ($found) { $piperExe = $found.FullName }
      }
      if (Test-Path $piperExe -PathType Leaf) { Ok "piper installed" }
      else { throw "the archive did not contain piper.exe" }
    }

    # Voice models. es_ES first because the app listens in es-ES; the Mexican
    # voice is there so Latin American Spanish is one dropdown away.
    if (-not (Test-Path $voicesDir -PathType Container)) {
      New-Item -ItemType Directory -Path $voicesDir -Force | Out-Null
    }
    $hfBase = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
    # Four voices, not one. Your partner is a different person in every
    # scenario, and one voice reading every part is the detail that quietly
    # tells you nobody was paying attention. Parla casts them by character;
    # Settings -> Voice lets you say which sounds like a woman and which a man,
    # since the model cards do not record it and the app cannot hear itself.
    $wanted = @(
      @{ id = 'es_ES-davefx-medium';   path = 'es/es_ES/davefx/medium';   label = 'Spain, voice 1'  },
      @{ id = 'es_ES-sharvard-medium'; path = 'es/es_ES/sharvard/medium'; label = 'Spain, voice 2'  },
      @{ id = 'es_MX-claude-high';     path = 'es/es_MX/claude/high';     label = 'Mexico, voice 1' },
      @{ id = 'es_MX-ald-medium';      path = 'es/es_MX/ald/medium';      label = 'Mexico, voice 2' }
    )

    $installed = 0
    foreach ($v in $wanted) {
      $onnx = Join-Path $voicesDir ($v.id + '.onnx')
      $json = Join-Path $voicesDir ($v.id + '.onnx.json')
      if ((Test-Path $onnx -PathType Leaf) -and (Test-Path $json -PathType Leaf)) {
        Ok ("voice already present: " + $v.label)
        $installed++
        continue
      }
      try {
        Note ("downloading voice: " + $v.label + " (about 65 MB)")
        Invoke-WebRequest -Uri ("$hfBase/" + $v.path + '/' + $v.id + '.onnx') `
          -OutFile $onnx -UseBasicParsing -TimeoutSec 900
        Invoke-WebRequest -Uri ("$hfBase/" + $v.path + '/' + $v.id + '.onnx.json') `
          -OutFile $json -UseBasicParsing -TimeoutSec 300
        Ok ("voice ready: " + $v.label)
        $installed++
      } catch {
        Warn ("could not download " + $v.label + ": " + $_.Exception.Message)
        Remove-Item $onnx, $json -Force -ErrorAction SilentlyContinue
      }
    }

    # Prove it actually speaks, rather than assuming the files are enough.
    if ($installed -gt 0 -and (Test-Path $piperExe -PathType Leaf)) {
      $testVoice = Get-ChildItem $voicesDir -Filter '*.onnx' -File | Select-Object -First 1
      $inTxt = Join-Path $env:TEMP 'parla-tts-check.txt'
      $outWav = Join-Path $env:TEMP 'parla-tts-check.wav'
      [System.IO.File]::WriteAllText($inTxt, 'Hola, buenos dias.',
        (New-Object System.Text.UTF8Encoding($false)))
      Remove-Item $outWav -Force -ErrorAction SilentlyContinue
      $p = Start-Process -FilePath $piperExe `
             -ArgumentList @('--model', ('"' + $testVoice.FullName + '"'),
                             '--output_file', ('"' + $outWav + '"')) `
             -RedirectStandardInput $inTxt -NoNewWindow -Wait -PassThru
      if ($p.ExitCode -eq 0 -and (Test-Path $outWav -PathType Leaf)) {
        Ok "neural voice working - Parla will use it instead of the Windows voices"
      } else {
        Warn "piper is installed but did not produce audio; the app will use browser voices"
      }
      Remove-Item $inTxt, $outWav -Force -ErrorAction SilentlyContinue
    } elseif ($installed -eq 0) {
      Warn "no voice models installed - the app will use your browser's voices"
    }
  } catch {
    Warn "Neural voice setup failed: $($_.Exception.Message)"
    Warn "Not fatal - Parla falls back to your browser's voices. Re-run this to retry."
  }
}
$ProgressPreference = $oldProgress

Step 9 "Starting Parla"
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

  Under Settings -> Voice, the top entry should be marked [neural - best].
  That is Piper speaking from this machine. If it is not there, re-run this
  script - the voice download is the only part that can fail on its own.

  Nothing here costs money: the model, the voice and the server all run
  locally, and nothing you say leaves this computer.

  Leave this window open while you use Parla. Ctrl+C stops it.

"@ -ForegroundColor Green

& $serve -Port $Port
