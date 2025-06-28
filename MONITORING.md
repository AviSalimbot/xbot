# Tweet Monitoring System

## Overview
The monitoring system now uses `caffeinate` to prevent your Mac from sleeping while monitoring tweets. This ensures continuous operation even when you're not actively using your computer.

## Files Created
- `start-monitoring.sh` - Main startup script with sleep prevention
- `stop-monitoring.sh` - Quick stop script
- `monitorManager.js` - Node.js module to manage the shell scripts
- `MONITORING.md` - This documentation

## How It Works
1. When you click "Start Monitoring" in the dashboard, it runs `caffeinate -is node monitorRelevantTweets.js`
2. The `-i` flag prevents idle sleep, `-s` prevents system sleep
3. The monitoring process runs every 5 minutes as configured
4. Sleep is prevented while the process is running
5. When you click "Stop Monitoring", it gracefully terminates the process and allows sleep again

## Manual Usage
You can also control monitoring from the command line:

```bash
# Start monitoring with sleep prevention
./start-monitoring.sh start

# Check status
./start-monitoring.sh status

# Stop monitoring
./start-monitoring.sh stop

# Restart monitoring
./start-monitoring.sh restart
```

## Log Files
- `monitor.log` - Output from the monitoring process
- `.monitor.pid` - Process ID of the running caffeinate process
- `.monitor.lock` - Lock file for the Node.js monitoring script

## Benefits
- ✅ Prevents laptop from sleeping during monitoring
- ✅ Automatically resumes when system wakes up
- ✅ Graceful shutdown when stopping
- ✅ Proper process management with PID tracking
- ✅ Easy to start/stop from web interface
- ✅ Command line control available

## Power Management
The system uses `caffeinate` which:
- Prevents idle sleep (`-i`)
- Prevents system sleep (`-s`) 
- Only affects sleep while monitoring is running
- Automatically allows sleep when monitoring stops
- Is a native macOS utility designed for this purpose

## Troubleshooting
1. If monitoring won't start, check if another instance is running:
   ```bash
   ./start-monitoring.sh status
   ```

2. To force stop if needed:
   ```bash
   ./start-monitoring.sh stop
   ```

3. Check logs for errors:
   ```bash
   tail -f monitor.log
   ```

4. Verify caffeinate is working:
   ```bash
   pmset -g assertions | grep caffeinate
   ```