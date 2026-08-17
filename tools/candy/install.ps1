<#
.SYNOPSIS
    Sets Candy up on this machine — portable, no system changes required.

.DESCRIPTION
    Installs the free dependencies, verifies the install with the built-in
    self-test, and optionally creates a Start Menu / startup shortcut.

    Nothing here writes to Program Files, registers a service, or modifies
    Windows security settings. Everything lives in the folder you choose, and
    "uninstalling" means deleting that folder (plus the shortcut, if you made
    one).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell -ExecutionPolicy Bypass -File install.ps1 -InstallPath "D:\Tools\Candy" -AutoStart
#>
[CmdletBinding()]
param(
    # Where to install. Default: keep the files where they already are.
    [string]$InstallPath,
    # Create a shortcut that starts Candy when you log in.
    [switch]$AutoStart,
    # Create a desktop shortcut.
    [switch]$DesktopShortcut,
    # Skip the dependency install (offline machines).
    [switch]$NoDeps
)

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  Candy installer" -ForegroundColor Cyan
Write-Host "  a user-mode tripwire for Roblox executors"
Write-Host ""

# --- 1. Copy files if a destination was given ------------------------------
$target = $source
if ($InstallPath) {
    Write-Host "Copying Candy to $InstallPath…"
    New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
    foreach ($item in @('candy', 'config', 'data', 'docs', 'tests', 'run.py',
                        'requirements.txt', 'README.md', 'LICENSE', 'build.ps1', 'install.ps1')) {
        $path = Join-Path $source $item
        if (Test-Path $path) { Copy-Item $path -Destination $InstallPath -Recurse -Force }
    }
    $target = $InstallPath
}
Set-Location $target

# --- 2. Locate Python or a prebuilt exe -------------------------------------
$exe = Join-Path $target "Candy.exe"
$usingExe = Test-Path $exe

if (-not $usingExe) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        Write-Host "Python was not found and there is no Candy.exe here." -ForegroundColor Red
        Write-Host "Install Python 3.10+ from https://python.org (tick 'Add python.exe to PATH'),"
        Write-Host "or build the portable exe first with:  powershell -File build.ps1"
        exit 1
    }
    Write-Host "Found Python: $($python.Source)"

    if (-not $NoDeps) {
        Write-Host "Installing dependencies (psutil, watchdog, WMI)…"
        & python -m pip install --user --quiet --upgrade psutil watchdog
        & python -m pip install --user --quiet WMI pywin32 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "WMI/pywin32 unavailable — Candy will poll for new processes instead of getting instant notifications."
            $global:LASTEXITCODE = 0
        }
    }
}

# --- 3. Self-test -----------------------------------------------------------
Write-Host ""
Write-Host "Running self-test…"
if ($usingExe) { & $exe selftest } else { & python run.py selftest }
if ($LASTEXITCODE -ne 0) { Write-Warning "Self-test reported problems — see the output above." }

# --- 4. Shortcuts -----------------------------------------------------------
function New-Shortcut([string]$linkPath, [string]$description) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($linkPath)
    if ($usingExe) {
        $link.TargetPath = $exe
    } else {
        $link.TargetPath = (Get-Command pythonw -ErrorAction SilentlyContinue)?.Source
        if (-not $link.TargetPath) { $link.TargetPath = (Get-Command python).Source }
        $link.Arguments = "`"$(Join-Path $target 'run.py')`""
    }
    $link.WorkingDirectory = $target
    $link.Description = $description
    $link.Save()
    Write-Host "Created $linkPath"
}

if ($DesktopShortcut) {
    New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Candy.lnk') 'Candy'
}
if ($AutoStart) {
    $startup = [Environment]::GetFolderPath('Startup')
    New-Shortcut (Join-Path $startup 'Candy.lnk') 'Candy (start at login)'
    Write-Host "Candy will start when you log in. Remove the shortcut from"
    Write-Host "  $startup"
    Write-Host "to undo that."
}

# --- 5. Done ----------------------------------------------------------------
Write-Host ""
Write-Host "Installed to $target" -ForegroundColor Green
Write-Host ""
Write-Host "Start it with:"
if ($usingExe) {
    Write-Host "    .\Candy.exe            (graphical interface)"
    Write-Host "    .\Candy.exe run        (console monitor)"
    Write-Host "    .\Candy.exe scan       (one-off scan)"
} else {
    Write-Host "    python run.py              (graphical interface)"
    Write-Host "    python run.py run          (console monitor)"
    Write-Host "    python run.py scan         (one-off scan)"
}
Write-Host ""
Write-Host "Candy starts in OBSERVE mode: it detects and logs, but changes nothing."
Write-Host "Switch to Enforce in the Settings tab once you trust what it is reporting."
Write-Host ""
Write-Host "For the full picture — including what a user-mode tool cannot do — read"
Write-Host "README.md and docs\LIMITATIONS.md."
