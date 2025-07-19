#!/usr/bin/env pwsh

# Simple script to stop monitoring with topic support
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Get topic from command line argument or environment variable
$TOPIC = if ($args.Count -gt 0) { $args[0] } else { $env:TOPIC }
if (-not $TOPIC) { $TOPIC = "ethereum" }

# Call the start-monitoring script with stop parameter and topic
& "$SCRIPT_DIR\start-monitoring.ps1" stop $TOPIC 