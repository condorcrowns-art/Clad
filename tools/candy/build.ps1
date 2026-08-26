<#
.SYNOPSIS
    Builds Candy into a single portable Candy.exe.

.DESCRIPTION
    Creates a virtual environment, installs the (free) dependencies, and runs
    PyInstaller in one-file mode. The result is dist\Candy.exe, which runs
    on Windows 10/11 without Python installed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File build.ps1
    powershell -ExecutionPolicy Bypass -File build.ps1 -Console
#>
[CmdletBinding()]
param(
    # Build a console binary (shows a terminal window; useful for debugging).
    [switch]$Console,
    # Skip the test run before packaging.
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Candy build" -ForegroundColor Cyan
Write-Host "---------------"

# --- 1. Python -------------------------------------------------------------
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python 3.10+ was not found on PATH. Install it from https://python.org (tick 'Add python.exe to PATH')." }

$version = & python -c "import sys; print('%d.%d' % sys.version_info[:2])"
Write-Host "Using Python $version at $($python.Source)"
if ([version]$version -lt [version]"3.10") { throw "Python 3.10 or newer is required (found $version)." }

# --- 2. Virtual environment ------------------------------------------------
if (-not (Test-Path ".venv")) {
    Write-Host "Creating .venv…"
    & python -m venv .venv
}
$venvPython = Join-Path $root ".venv\Scripts\python.exe"

Write-Host "Installing dependencies…"
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install --quiet psutil watchdog pyinstaller
# WMI/pywin32 are optional; a failure here only costs event-driven process
# notifications, so it must not fail the build.
& $venvPython -m pip install --quiet WMI pywin32 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "WMI/pywin32 did not install — Candy will poll for new processes instead."
    $global:LASTEXITCODE = 0
}

# --- 3. Tests --------------------------------------------------------------
if (-not $SkipTests) {
    Write-Host "Running tests…"
    & $venvPython -m unittest discover -s tests
    if ($LASTEXITCODE -ne 0) { throw "Tests failed — not packaging a broken build." }
}

# --- 4. Package ------------------------------------------------------------
Write-Host "Packaging with PyInstaller…"
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue

$pyiArgs = @(
    "-m", "PyInstaller",
    "--onefile",
    "--name", "Candy",
    "--clean",
    "--noconfirm",
    # Ship the seed threat database and default config inside the exe; they are
    # unpacked next to the exe on first run.
    "--add-data", "data\threats.json;data",
    "--add-data", "config\config.json;config",
    "--hidden-import", "tkinter",
    "--collect-submodules", "candy",
    "run.py"
)
if (-not $Console) { $pyiArgs += "--windowed" }

& $venvPython @pyiArgs
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed." }

$exe = Join-Path $root "dist\Candy.exe"
$size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host ""
Write-Host "Built $exe ($size MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Copy Candy.exe to a folder of your choice (it is portable)."
Write-Host "  2. Run it once — it creates config\, logs\, data\ and quarantine\ beside itself."
Write-Host "  3. Right-click -> 'Run as administrator' for full visibility."
Write-Host ""
Write-Host "Note: unsigned executables are frequently flagged by SmartScreen and by"
Write-Host "antivirus heuristics. That is expected for a self-built binary; code signing"
Write-Host "certificates cost money and this project deliberately has no budget."
