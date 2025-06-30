#!/usr/bin/env pwsh

# Script to start the monitoring with power management prevention
# This ensures the monitoring continues even when the laptop would normally sleep

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$MONITOR_SCRIPT = Join-Path $SCRIPT_DIR "monitorRelevantTweets.js"
$PID_FILE = Join-Path $SCRIPT_DIR ".monitor.pid"
$LOCK_FILE = Join-Path $SCRIPT_DIR ".monitor.lock"

# Function to check if monitoring is already running
function Test-MonitoringRunning {
    if (Test-Path $PID_FILE) {
        $PID = Get-Content $PID_FILE
        try {
            $process = Get-Process -Id $PID -ErrorAction Stop
            return $true
        }
        catch {
            # Stale PID file, remove it
            Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
            return $false
        }
    }
    return $false
}

# Function to prevent system sleep (Windows equivalent of caffeinate)
function Start-SleepPrevention {
    Write-Host "🔋 Preventing system sleep..." -ForegroundColor Yellow
    
    # Use Windows power management to prevent sleep
    # This is the Windows equivalent of caffeinate
    try {
        # Set power scheme to prevent sleep
        powercfg /change standby-timeout-ac 0
        powercfg /change standby-timeout-dc 0
        powercfg /change monitor-timeout-ac 0
        powercfg /change monitor-timeout-dc 0
        
        Write-Host "✅ Sleep prevention activated" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "⚠️  Could not set power management settings. Monitoring will continue but system may sleep." -ForegroundColor Yellow
        return $false
    }
}

# Function to restore normal power settings
function Stop-SleepPrevention {
    Write-Host "🔋 Restoring normal power settings..." -ForegroundColor Yellow
    try {
        # Restore default power settings (15 minutes for AC, 10 minutes for DC)
        powercfg /change standby-timeout-ac 15
        powercfg /change standby-timeout-dc 10
        powercfg /change monitor-timeout-ac 15
        powercfg /change monitor-timeout-dc 10
        
        Write-Host "✅ Normal power settings restored" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Could not restore power settings" -ForegroundColor Yellow
    }
}

# Function to start monitoring
function Start-Monitoring {
    if (Test-MonitoringRunning) {
        $PID = Get-Content $PID_FILE
        Write-Host "Monitoring is already running (PID: $PID)" -ForegroundColor Yellow
        return $false
    }

    # Check if monitor script exists
    if (-not (Test-Path $MONITOR_SCRIPT)) {
        Write-Host "❌ Monitor script not found: $MONITOR_SCRIPT" -ForegroundColor Red
        return $false
    }

    Write-Host "🚀 Starting monitoring with sleep prevention..." -ForegroundColor Green
    
    # Start sleep prevention
    Start-SleepPrevention
    
    # Start the monitoring script in the background
    $logFile = Join-Path $SCRIPT_DIR "monitor.log"
    
    try {
        # Start Node.js process in background
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = "node"
        $processInfo.Arguments = "`"$MONITOR_SCRIPT`""
        $processInfo.WorkingDirectory = $SCRIPT_DIR
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $processInfo
        $process.Start() | Out-Null
        
        # Save PID
        $process.Id | Out-File $PID_FILE
        
        # Wait a moment to see if it started successfully
        Start-Sleep -Seconds 2
        
        if (Test-MonitoringRunning) {
            Write-Host "✅ Monitoring started successfully (PID: $($process.Id))" -ForegroundColor Green
            Write-Host "📝 Logs: $logFile" -ForegroundColor Cyan
            Write-Host "🛑 To stop: .\stop-monitoring.ps1" -ForegroundColor Cyan
            return $true
        } else {
            Write-Host "❌ Failed to start monitoring" -ForegroundColor Red
            Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            return $false
        }
    }
    catch {
        Write-Host "❌ Error starting monitoring: $_" -ForegroundColor Red
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# Function to stop monitoring
function Stop-Monitoring {
    if (-not (Test-MonitoringRunning)) {
        Write-Host "Monitoring is not running" -ForegroundColor Yellow
        return $false
    }

    $PID = Get-Content $PID_FILE
    Write-Host "🛑 Stopping monitoring (PID: $PID)..." -ForegroundColor Yellow
    
    try {
        # Kill the process
        Stop-Process -Id $PID -Force -ErrorAction Stop
        
        # Wait for process to stop
        for ($i = 1; $i -le 10; $i++) {
            try {
                Get-Process -Id $PID -ErrorAction Stop | Out-Null
                Start-Sleep -Seconds 1
            }
            catch {
                break
            }
        }
        
        # Force kill if still running
        try {
            Get-Process -Id $PID -ErrorAction Stop | Out-Null
            Write-Host "Force killing process..." -ForegroundColor Yellow
            Stop-Process -Id $PID -Force -ErrorAction Stop
        }
        catch {
            # Process already stopped
        }
        
        # Clean up files
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
        Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
        
        # Restore power settings
        Stop-SleepPrevention
        
        Write-Host "✅ Monitoring stopped" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ Error stopping monitoring: $_" -ForegroundColor Red
        return $false
    }
}

# Function to get status
function Get-MonitoringStatus {
    if (Test-MonitoringRunning) {
        $PID = Get-Content $PID_FILE
        Write-Host "✅ Monitoring is running (PID: $PID)" -ForegroundColor Green
        
        # Check power settings
        try {
            $powerSettings = powercfg /query | Select-String "Standby"
            if ($powerSettings) {
                Write-Host "🔋 Sleep prevention: Active" -ForegroundColor Cyan
            } else {
                Write-Host "🔋 Sleep prevention: Unknown" -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "🔋 Sleep prevention: Unknown" -ForegroundColor Yellow
        }
        
        return $true
    } else {
        Write-Host "❌ Monitoring is not running" -ForegroundColor Red
        return $false
    }
}

# Main script logic
$action = if ($args.Count -gt 0) { $args[0] } else { "start" }

switch ($action) {
    "start" {
        Start-Monitoring
    }
    "stop" {
        Stop-Monitoring
    }
    "restart" {
        Stop-Monitoring
        Start-Sleep -Seconds 2
        Start-Monitoring
    }
    "status" {
        Get-MonitoringStatus
    }
    default {
        Write-Host "Usage: .\start-monitoring.ps1 {start|stop|restart|status}" -ForegroundColor Yellow
        Write-Host "  start   - Start monitoring with sleep prevention" -ForegroundColor Cyan
        Write-Host "  stop    - Stop monitoring" -ForegroundColor Cyan
        Write-Host "  restart - Restart monitoring" -ForegroundColor Cyan
        Write-Host "  status  - Check monitoring status" -ForegroundColor Cyan
        exit 1
    }
} 