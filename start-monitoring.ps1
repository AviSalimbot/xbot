#!/usr/bin/env pwsh

# Script to start the monitoring with power management prevention
# This ensures the monitoring continues even when the laptop would normally sleep

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$MONITOR_SCRIPT = Join-Path $SCRIPT_DIR "monitorRelevantTweets.js"

# Get topic from command line argument or environment variable
$TOPIC = if ($args.Count -gt 1) { $args[1] } else { $env:TOPIC }
if (-not $TOPIC) { $TOPIC = "ethereum" }

# Topic-specific file naming
$PID_FILE = Join-Path $SCRIPT_DIR ".${TOPIC}_monitor.pid"
$LOCK_FILE = Join-Path $SCRIPT_DIR ".${TOPIC}_monitor.lock"
$LOG_FILE = Join-Path $SCRIPT_DIR "${TOPIC}_monitor.log"

# Function to check if monitoring is already running
function Test-MonitoringRunning {
    if (Test-Path $PID_FILE) {
        $processId = Get-Content $PID_FILE
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
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

# Function to prevent system sleep using PowerShell execution policy
function Start-SleepPrevention {
    Write-Host "Preventing system sleep..." -ForegroundColor Yellow
    
    # Create a PowerShell job that prevents sleep by calling SetThreadExecutionState
    $sleepPreventionScript = @'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class PowerManager {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
    
    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
}
"@

# Prevent system sleep and display sleep
[PowerManager]::SetThreadExecutionState([PowerManager]::ES_CONTINUOUS -bor [PowerManager]::ES_SYSTEM_REQUIRED -bor [PowerManager]::ES_DISPLAY_REQUIRED)

# Keep the job alive
while ($true) {
    Start-Sleep -Seconds 30
    # Refresh the execution state every 30 seconds
    [PowerManager]::SetThreadExecutionState([PowerManager]::ES_CONTINUOUS -bor [PowerManager]::ES_SYSTEM_REQUIRED -bor [PowerManager]::ES_DISPLAY_REQUIRED)
}
'@

    try {
        $sleepJob = Start-Job -ScriptBlock ([ScriptBlock]::Create($sleepPreventionScript))
        $sleepJobPidFile = Join-Path $SCRIPT_DIR ".sleep_job.pid"
        $sleepJob.Id | Out-File $sleepJobPidFile
        Write-Host "Sleep prevention activated" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Could not start sleep prevention. Monitoring will continue but system may sleep." -ForegroundColor Yellow
        return $false
    }
}

# Function to stop sleep prevention
function Stop-SleepPrevention {
    $sleepJobPidFile = Join-Path $SCRIPT_DIR ".sleep_job.pid"
    if (Test-Path $sleepJobPidFile) {
        try {
            $sleepJobId = Get-Content $sleepJobPidFile
            Get-Job -Id $sleepJobId -ErrorAction Stop | Stop-Job -PassThru | Remove-Job
            Remove-Item $sleepJobPidFile -Force -ErrorAction SilentlyContinue
            Write-Host "Sleep prevention stopped" -ForegroundColor Yellow
        }
        catch {
            Write-Host "Could not stop sleep prevention job" -ForegroundColor Yellow
        }
    }
    
    # Reset execution state to allow normal sleep
    try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class PowerManagerReset {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
    
    public const uint ES_CONTINUOUS = 0x80000000;
}
"@ -ErrorAction SilentlyContinue
        [PowerManagerReset]::SetThreadExecutionState([PowerManagerReset]::ES_CONTINUOUS)
    }
    catch {
        # Silently continue if we can't reset
    }
}

# Function to start monitoring
function Start-Monitoring {
    if (Test-MonitoringRunning) {
        $processId = Get-Content $PID_FILE
        Write-Host "Monitoring is already running (PID: $processId)" -ForegroundColor Yellow
        return $false
    }

    # Check if monitor script exists
    if (-not (Test-Path $MONITOR_SCRIPT)) {
        Write-Host "Monitor script not found: $MONITOR_SCRIPT" -ForegroundColor Red
        return $false
    }

    Write-Host "Starting monitoring with sleep prevention..." -ForegroundColor Green
    
    # Start sleep prevention
    Start-SleepPrevention
    
    try {
        # Prepare environment variables
        $envVars = @{
            "TOPIC" = $TOPIC
        }
        if ($env:FOLLOWER_OVERRIDE) {
            $envVars["FOLLOWER_OVERRIDE"] = $env:FOLLOWER_OVERRIDE
        }
        
        # Start the monitoring script in background using Start-Process
        $process = Start-Process -FilePath "node" -ArgumentList "monitorRelevantTweets.js" -WorkingDirectory $SCRIPT_DIR -WindowStyle Hidden -PassThru -Environment $envVars
        
        # Save PID
        $process.Id | Out-File $PID_FILE
        
        # Wait a moment to see if it started successfully
        Start-Sleep -Seconds 2
        
        if (Test-MonitoringRunning) {
            Write-Host "Monitoring started successfully (PID: $($process.Id))" -ForegroundColor Green
            Write-Host "Logs: $LOG_FILE" -ForegroundColor Cyan
            Write-Host "To stop: .\start-monitoring.ps1 stop" -ForegroundColor Cyan
            return $true
        } else {
            Write-Host "Failed to start monitoring" -ForegroundColor Red
            Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            Stop-SleepPrevention
            return $false
        }
    }
    catch {
        Write-Host "Error starting monitoring: $_" -ForegroundColor Red
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
        Stop-SleepPrevention
        return $false
    }
}

# Function to stop monitoring
function Stop-Monitoring {
    if (-not (Test-MonitoringRunning)) {
        Write-Host "Monitoring is not running" -ForegroundColor Yellow
        # Still try to clean up sleep prevention and remaining processes
        Stop-SleepPrevention
        # No global cleanup - only clean up sleep prevention for this topic
        # Return success since the goal (stop monitoring) is achieved
        return $true
    }

    $processId = Get-Content $PID_FILE
    Write-Host "Stopping monitoring (PID: $processId)..." -ForegroundColor Yellow
    
    try {
        # Kill the main process
        Stop-Process -Id $processId -Force -ErrorAction Stop
        
        # Wait for process to stop
        for ($i = 1; $i -le 10; $i++) {
            try {
                Get-Process -Id $processId -ErrorAction Stop | Out-Null
                Start-Sleep -Seconds 1
            }
            catch {
                break
            }
        }
        
        # Force kill if still running
        try {
            Get-Process -Id $processId -ErrorAction Stop | Out-Null
            Write-Host "Force killing process..." -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            # Process already stopped
        }
        
        # Kill any remaining Node.js processes running the monitor script
        try {
            Get-WmiObject Win32_Process | Where-Object { 
                $_.CommandLine -like "*monitorRelevantTweets.js*" 
            } | ForEach-Object { 
                Write-Host "Killing remaining monitor process (PID: $($_.ProcessId))" -ForegroundColor Yellow
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
            # Continue if we can't clean up remaining processes
        }
        
        # Clean up files
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
        Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
        
        # Stop sleep prevention
        Stop-SleepPrevention
        
        Write-Host "Monitoring stopped" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Error stopping monitoring: $_" -ForegroundColor Red
        # Still try to clean up
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
        Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
        Stop-SleepPrevention
        return $false
    }
}

# Function to get status
function Get-MonitoringStatus {
    if (Test-MonitoringRunning) {
        $processId = Get-Content $PID_FILE
        Write-Host "Monitoring is running (PID: $processId)" -ForegroundColor Green
        
        # Check if sleep prevention job is running
        $sleepJobPidFile = Join-Path $SCRIPT_DIR ".sleep_job.pid"
        if (Test-Path $sleepJobPidFile) {
            try {
                $sleepJobId = Get-Content $sleepJobPidFile
                $sleepJob = Get-Job -Id $sleepJobId -ErrorAction Stop
                if ($sleepJob.State -eq "Running") {
                    Write-Host "Sleep prevention: Active" -ForegroundColor Cyan
                } else {
                    Write-Host "Sleep prevention: Inactive" -ForegroundColor Yellow
                }
            }
            catch {
                Write-Host "Sleep prevention: Unknown" -ForegroundColor Yellow
            }
        } else {
            Write-Host "Sleep prevention: Inactive" -ForegroundColor Yellow
        }
        
        # Show log file size if it exists
        if (Test-Path $LOG_FILE) {
            $logSize = (Get-Item $LOG_FILE).Length
            $logSizeKB = [math]::Round($logSize / 1024, 2)
            Write-Host "Log file size: ${logSizeKB}KB" -ForegroundColor Cyan
        }
        
        return $true
    } else {
        Write-Host "Monitoring is not running" -ForegroundColor Red
        
        # Check if sleep prevention is still running even though monitoring stopped
        $sleepJobPidFile = Join-Path $SCRIPT_DIR ".sleep_job.pid"
        if (Test-Path $sleepJobPidFile) {
            try {
                $sleepJobId = Get-Content $sleepJobPidFile
                $sleepJob = Get-Job -Id $sleepJobId -ErrorAction Stop
                if ($sleepJob.State -eq "Running") {
                    Write-Host "Sleep prevention: Active (orphaned - will be cleaned up)" -ForegroundColor Yellow
                } else {
                    Write-Host "Sleep prevention: Inactive" -ForegroundColor Yellow
                }
            }
            catch {
                Write-Host "Sleep prevention: Inactive" -ForegroundColor Yellow
            }
        } else {
            Write-Host "Sleep prevention: Inactive" -ForegroundColor Yellow
        }
        
        return $false
    }
}

# Main script logic
$action = if ($args.Count -gt 0) { $args[0] } else { "start" }

switch ($action) {
    "start" {
        if (Test-MonitoringRunning) {
            $processId = Get-Content $PID_FILE
            Write-Host "Monitoring is already running (PID: $processId)" -ForegroundColor Yellow
            return
        }

        Write-Host "Starting monitoring with sleep prevention..." -ForegroundColor Green
        
        # Start sleep prevention
        Start-SleepPrevention
        
        try {
            # Start the monitoring script in background using Start-Process
            $process = Start-Process -FilePath "node" -ArgumentList "monitorRelevantTweets.js" -WorkingDirectory $SCRIPT_DIR -WindowStyle Hidden -PassThru
            
            # Save PID
            $process.Id | Out-File $PID_FILE
            
            # Wait a moment to see if it started successfully
            Start-Sleep -Seconds 2
            
            if (Test-MonitoringRunning) {
                Write-Host "Monitoring started successfully (PID: $($process.Id))" -ForegroundColor Green
                Write-Host "Logs: $LOG_FILE" -ForegroundColor Cyan
                Write-Host "To stop: .\start-monitoring.ps1 stop" -ForegroundColor Cyan
            } else {
                Write-Host "Failed to start monitoring" -ForegroundColor Red
                Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
                Stop-SleepPrevention
            }
        }
        catch {
            Write-Host "Error starting monitoring: $_" -ForegroundColor Red
            Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            Stop-SleepPrevention
        }
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