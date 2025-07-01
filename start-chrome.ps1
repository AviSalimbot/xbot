#!/usr/bin/env pwsh

# Start Chrome with remote debugging
Write-Host "Starting Google Chrome with remote debugging..." -ForegroundColor Green

# Try different Chrome paths for Windows
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chromeFound = $false
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        Write-Host "Usage: .\start-chrome.ps1 [topic]" -ForegroundColor Yellow
        Start-Process $path -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=$env:TEMP\chrome-profile"
        $chromeFound = $true
        break
    }
}

if (-not $chromeFound) {
    Write-Host "ERROR: Chrome not found in common locations. Please ensure Chrome is installed." -ForegroundColor Red
    Write-Host "Tried paths:" -ForegroundColor Yellow
    foreach ($path in $chromePaths) {
        Write-Host "  - $path" -ForegroundColor Gray
    }
    exit 1
}

# Wait a moment for Chrome to start
Write-Host "Waiting for Chrome to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Check if Chrome is running on port 9222
Write-Host "Checking if Chrome is ready..." -ForegroundColor Yellow
$chromeReady = $false

for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9222" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "SUCCESS: Chrome is ready on port 9222" -ForegroundColor Green
        $chromeReady = $true
        break
    }
    catch {
        Write-Host "Waiting for Chrome... (attempt $i/10)" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if (-not $chromeReady) {
    Write-Host "ERROR: Chrome failed to start or is not responding on port 9222" -ForegroundColor Red
    Write-Host "Please check if Chrome is running and try again." -ForegroundColor Yellow
    exit 1
}

# Start the XBot with the specified topic
if ($args.Count -eq 0) {
    Write-Host "ERROR: No topic specified" -ForegroundColor Red
    Write-Host "Usage: .\start-chrome.ps1 [topic]" -ForegroundColor Yellow
    Write-Host "Available topics: ethereum, basketball, crypto" -ForegroundColor Cyan
    Write-Host "Example: .\start-chrome.ps1 ethereum" -ForegroundColor Cyan
    exit 1
}

$TOPIC = $args[0]
Write-Host "Starting XBot for topic: $TOPIC" -ForegroundColor Green

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js not found"
    }
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Cyan
}
catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if start.js exists
if (-not (Test-Path "start.js")) {
    Write-Host "ERROR: start.js not found in current directory" -ForegroundColor Red
    Write-Host "Please run this script from the xbot directory" -ForegroundColor Yellow
    exit 1
}

# Start the bot
try {
    node start.js $TOPIC
}
catch {
    Write-Host "ERROR: Error starting XBot - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}