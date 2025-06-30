#!/usr/bin/env pwsh

# Simple script to stop monitoring
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Call the start-monitoring script with stop parameter
& "$SCRIPT_DIR\start-monitoring.ps1" stop 