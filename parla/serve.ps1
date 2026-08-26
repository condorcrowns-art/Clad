<#
.SYNOPSIS
  Serves the Parla folder over http://localhost:8000 with no dependencies.

.DESCRIPTION
  Windows rarely has python or node installed, and the microphone will not work
  from a file:// URL - so this uses .NET's HttpListener, which ships with
  Windows, to serve this folder as a real web server.

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
  '.md'   = 'text/markdown; charset=utf-8'
}

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
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

if (-not $NoBrowser) { Start-Process $prefix }

try {
  while ($listener.IsListening) {
    $context  = $listener.GetContext()
    $request  = $context.Request
    $response = $context.Response

    try {
      $rel = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

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
      $response.StatusCode = 500
      Write-Warning $_.Exception.Message
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host "Parla server stopped." -ForegroundColor Yellow
}
