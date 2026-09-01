<#
.SYNOPSIS
  Serves the Parla folder over http://localhost:8000 with no dependencies,
  and exposes a local neural text-to-speech endpoint at /tts.

.DESCRIPTION
  Windows rarely has python or node installed, and the microphone will not work
  from a file:// URL - so this uses .NET's HttpListener, which ships with
  Windows, to serve this folder as a real web server.

  It also fronts Piper, a local neural TTS engine, at POST /tts. The browser's
  own Spanish voices on Windows are decade-old SAPI ones that sound robotic;
  Piper sounds like a person and runs entirely on this machine, so it stays
  free and works offline. Serving it from this same server means the page and
  the audio share an origin, so there is no CORS to fight.

  Piper is optional. Without it /tts returns 503 and the app quietly falls back
  to the browser voices - nothing breaks, it just sounds worse.

  Binding to a port normally needs an elevated shell, which is why this is run
  from an admin PowerShell window.

.EXAMPLE
  .\serve.ps1
  .\serve.ps1 -Port 8080 -NoBrowser
#>
[CmdletBinding()]
param(
  [int]$Port = 8000,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$prefix = "http://localhost:$Port/"

$voicesDir = Join-Path $root 'voices'
$cacheDir  = Join-Path $voicesDir 'cache'

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
  '.wav'  = 'audio/wav'
  '.md'   = 'text/markdown; charset=utf-8'
}

# ---------------------------------------------------------------- Piper ----

# Where setup-windows.ps1 puts it, then anywhere on PATH.
function Find-PiperExe {
  $candidates = @(
    (Join-Path $root 'piper\piper.exe'),
    (Join-Path $root 'piper\piper\piper.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path $c -PathType Leaf) { return $c }
  }
  $cmd = Get-Command piper.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

# Voice files are named like es_ES-davefx-medium.onnx, which is enough to
# describe them in the settings screen without a separate manifest.
function Get-PiperVoices {
  if (-not (Test-Path $voicesDir -PathType Container)) { return @() }
  $out = @()
  foreach ($f in (Get-ChildItem $voicesDir -Filter '*.onnx' -File -ErrorAction SilentlyContinue)) {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $parts = $id -split '-'
    $locale = if ($parts.Count -ge 1) { $parts[0] } else { $id }
    $name   = if ($parts.Count -ge 2) { $parts[1] } else { $id }
    $qual   = if ($parts.Count -ge 3) { $parts[2] } else { '' }
    $out += [pscustomobject]@{
      id      = $id
      name    = $name
      locale  = $locale
      lang    = ($locale -split '_')[0].ToLower()
      quality = $qual
      path    = $f.FullName
    }
  }
  return $out
}

function Get-CacheKey($s) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $b = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s))
  } finally {
    $sha.Dispose()
  }
  return ([System.BitConverter]::ToString($b) -replace '-', '').ToLower()
}

# Drills repeat the same words constantly, so re-synthesising them is pure
# waste. Cache on disk and the second hearing is instant.
function Trim-Cache {
  try {
    $files = @(Get-ChildItem $cacheDir -Filter '*.wav' -File -ErrorAction SilentlyContinue)
    if ($files.Count -le 400) { return }
    $files | Sort-Object LastWriteTime | Select-Object -First ($files.Count - 200) |
      Remove-Item -Force -ErrorAction SilentlyContinue
  } catch { }
}

# Rewrite the sample rate a WAV declares, so it plays back higher and faster.
# Only two little-endian integers in the header move: the sample rate at byte
# 24, and the byte rate at 28, which must stay consistent or players either
# refuse the file or fall back to the wrong speed.
function Set-WavRate($path, $factor) {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 44) { return }
    # Sanity-check it really is the RIFF/WAVE layout before editing offsets.
    if ([System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or
        [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') { return }

    $rate     = [System.BitConverter]::ToUInt32($bytes, 24)
    $byteRate = [System.BitConverter]::ToUInt32($bytes, 28)
    if ($rate -le 0) { return }

    $newRate     = [uint32][math]::Round($rate * $factor)
    $newByteRate = [uint32][math]::Round($byteRate * $factor)

    [System.BitConverter]::GetBytes($newRate).CopyTo($bytes, 24)
    [System.BitConverter]::GetBytes($newByteRate).CopyTo($bytes, 28)
    [System.IO.File]::WriteAllBytes($path, $bytes)
  } catch {
    # A voice at the wrong pitch beats no voice at all.
    Write-Warning ("pitch shift skipped: " + $_.Exception.Message)
  }
}

function Invoke-Piper($piperExe, $voicePath, $text, $lengthScale, $outWav) {
  $tmp    = [System.IO.Path]::GetTempPath()
  $stamp  = [guid]::NewGuid().ToString('N')
  $inTxt  = Join-Path $tmp "parla-tts-$stamp.txt"
  $errTxt = Join-Path $tmp "parla-tts-$stamp.err"

  # Piper reads the text on stdin. Writing it to a UTF-8 file and redirecting
  # that file in sidesteps the console code page, which would otherwise mangle
  # every accent and every enye on the way to the process. No BOM: piper would
  # read those bytes as part of the sentence.
  [System.IO.File]::WriteAllText($inTxt, $text, (New-Object System.Text.UTF8Encoding($false)))

  $cfg = "$voicePath.json"
  $baseArgs = @(
    '--model', ('"' + $voicePath + '"'),
    '--length_scale', $lengthScale
  )
  if (Test-Path $cfg -PathType Leaf) { $baseArgs += @('--config', ('"' + $cfg + '"')) }

  # The classic piper binary spells it --output_file; the newer Python CLI
  # spells it --output-file. Try one, then the other, rather than making the
  # user care which one they ended up with.
  $spellings = @('--output_file', '--output-file')
  $lastErr = ''

  foreach ($flag in $spellings) {
    $argList = $baseArgs + @($flag, ('"' + $outWav + '"'))
    try {
      $p = Start-Process -FilePath $piperExe -ArgumentList $argList `
             -RedirectStandardInput $inTxt -RedirectStandardError $errTxt `
             -NoNewWindow -Wait -PassThru
      if ($p.ExitCode -eq 0 -and (Test-Path $outWav -PathType Leaf)) {
        Remove-Item $inTxt, $errTxt -Force -ErrorAction SilentlyContinue
        return $true
      }
      if (Test-Path $errTxt) { $lastErr = (Get-Content $errTxt -Raw -ErrorAction SilentlyContinue) }
    } catch {
      $lastErr = $_.Exception.Message
    }
  }

  Remove-Item $inTxt, $errTxt -Force -ErrorAction SilentlyContinue
  if ($lastErr) { Write-Warning ("piper: " + $lastErr.Trim()) }
  return $false
}

$piperExe = Find-PiperExe

# --------------------------------------------------------------- Server ----

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "Could not bind to $prefix" -ForegroundColor Red
  Write-Host "Either port $Port is already in use, or this window is not running as Administrator."
  Write-Host "Try:  .\serve.ps1 -Port 8081" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  Parla is running at $prefix" -ForegroundColor Green
Write-Host "  Serving: $root"
if ($piperExe) {
  $vc = @(Get-PiperVoices).Count
  if ($vc -gt 0) {
    Write-Host "  Neural voice: on ($vc installed)" -ForegroundColor Green
  } else {
    Write-Host "  Neural voice: piper found but no voices in \voices - using browser voices" -ForegroundColor Yellow
  }
} else {
  Write-Host "  Neural voice: off - using browser voices" -ForegroundColor DarkGray
}
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

if (-not $NoBrowser) { Start-Process $prefix }

function Write-Json($response, $obj, $status) {
  $response.StatusCode = $status
  $response.ContentType = 'application/json; charset=utf-8'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 5 -Compress))
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

try {
  while ($listener.IsListening) {
    # GetContext() blocks inside .NET, where PowerShell cannot see a Ctrl+C -
    # the server would ignore it until the next HTTP request arrived, which
    # meant the only way out was closing the window. Waiting on the async
    # version in short slices gives the pipeline a checkpoint between each one,
    # so Ctrl+C lands immediately.
    $ctxTask = $listener.GetContextAsync()
    while (-not $ctxTask.Wait(250)) {
      if (-not $listener.IsListening) { break }
    }
    if (-not $ctxTask.IsCompleted) { break }

    $context  = $ctxTask.Result
    $request  = $context.Request
    $response = $context.Response

    try {
      $rel = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

      # ---- What voices are available, if any -----------------------------
      if ($rel -eq 'tts/voices') {
        $response.Headers.Add('Cache-Control', 'no-store')
        $vs = @()
        if ($piperExe) {
          $vs = @(Get-PiperVoices | ForEach-Object {
            [pscustomobject]@{ id = $_.id; name = $_.name; locale = $_.locale; lang = $_.lang; quality = $_.quality }
          })
        }
        Write-Json $response @{ engine = 'piper'; available = [bool]($piperExe -and $vs.Count -gt 0); voices = $vs } 200
        $response.Close()
        continue
      }

      # ---- Synthesise ----------------------------------------------------
      if ($rel -eq 'tts') {
        $response.Headers.Add('Cache-Control', 'no-store')

        if ($request.HttpMethod -ne 'POST') {
          Write-Json $response @{ error = 'POST only' } 405
          $response.Close(); continue
        }
        if (-not $piperExe) {
          Write-Json $response @{ error = 'piper not installed' } 503
          $response.Close(); continue
        }

        $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
        $raw = $reader.ReadToEnd()
        $reader.Dispose()

        $req = $null
        try { $req = $raw | ConvertFrom-Json } catch { }
        $text = if ($req) { [string]$req.text } else { '' }
        if ([string]::IsNullOrWhiteSpace($text)) {
          Write-Json $response @{ error = 'no text' } 400
          $response.Close(); continue
        }
        # A sentence, not an essay - this is a conversation partner.
        if ($text.Length -gt 600) { $text = $text.Substring(0, 600) }

        $all = @(Get-PiperVoices)
        if ($all.Count -eq 0) {
          Write-Json $response @{ error = 'no voices installed' } 503
          $response.Close(); continue
        }

        $wantId   = if ($req) { [string]$req.voice } else { '' }
        $wantLang = if ($req -and $req.lang) { ([string]$req.lang).ToLower() } else { 'es' }

        $voice = $all | Where-Object { $_.id -eq $wantId } | Select-Object -First 1
        if (-not $voice) { $voice = $all | Where-Object { $_.lang -eq $wantLang } | Select-Object -First 1 }
        if (-not $voice) { $voice = $all[0] }

        # rate is a speed multiplier the way the browser means it; piper's
        # length_scale is the inverse, a duration multiplier.
        $rate = 0.9
        if ($req -and $req.rate) { $rate = [double]$req.rate }
        if ($rate -lt 0.5) { $rate = 0.5 }
        if ($rate -gt 2.0) { $rate = 2.0 }

        # Pitch. Piper exposes no pitch control at all, but a WAV is just
        # samples plus a declared playback rate - so declaring a higher rate
        # plays the same samples faster AND higher. That alone would also
        # shorten the clip, which is fixed by asking piper for a proportionally
        # longer one: length_scale = pitch / rate leaves the duration exactly
        # where the speed setting wanted it, with only the pitch moved.
        #
        # It is a resample, so it shifts formants too - which is the point.
        # Formant shift is what actually makes a voice read younger or older,
        # rather than the same person talking in falsetto.
        $pitch = 1.0
        if ($req -and $req.pitch) { $pitch = [double]$req.pitch }
        if ($pitch -lt 0.75) { $pitch = 0.75 }
        if ($pitch -gt 1.35) { $pitch = 1.35 }

        $lengthScale = [math]::Round($pitch / $rate, 3)

        if (-not (Test-Path $cacheDir -PathType Container)) {
          New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
        }
        $key = Get-CacheKey ($voice.id + '|' + $lengthScale + '|' + $pitch + '|' + $text)
        $wav = Join-Path $cacheDir "$key.wav"

        $ok = $true
        if (-not (Test-Path $wav -PathType Leaf)) {
          $ok = Invoke-Piper $piperExe $voice.path $text $lengthScale $wav
          if ($ok -and $pitch -ne 1.0) { Set-WavRate $wav $pitch }
          if ($ok) { Trim-Cache }
        }

        if ($ok -and (Test-Path $wav -PathType Leaf)) {
          $bytes = [System.IO.File]::ReadAllBytes($wav)
          $response.ContentType = 'audio/wav'
          $response.Headers.Add('X-Parla-Voice', $voice.id)
          $response.ContentLength64 = $bytes.Length
          $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          Write-Json $response @{ error = 'synthesis failed' } 500
        }
        $response.Close()
        continue
      }

      # ---- Static files --------------------------------------------------
      # Resolve inside the served folder only - never let ..\ escape it.
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $response.Close()
        continue
      }

      if (Test-Path $full -PathType Container) { $full = Join-Path $full 'index.html' }

      if (Test-Path $full -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        # This is a dev server for a fast-changing app: never let the browser cache.
        $response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - not found: $rel")
        $response.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      try { $response.StatusCode = 500 } catch { }
      Write-Warning $_.Exception.Message
    } finally {
      try { $response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host "Parla server stopped." -ForegroundColor Yellow
}
