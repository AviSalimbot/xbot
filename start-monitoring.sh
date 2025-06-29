#!/bin/bash

# Script to start the monitoring with caffeinate to prevent sleep
# This ensures the monitoring continues even when the laptop would normally sleep

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/monitorRelevantTweets.js"
PID_FILE="$SCRIPT_DIR/.monitor.pid"
LOCK_FILE="$SCRIPT_DIR/.monitor.lock"

# Function to check if monitoring is already running
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0  # Running
        else
            # Stale PID file, remove it
            rm -f "$PID_FILE"
            rm -f "$LOCK_FILE"
            return 1  # Not running
        fi
    fi
    return 1  # Not running
}

# Function to start monitoring
start_monitoring() {
    if is_running; then
        echo "Monitoring is already running (PID: $(cat "$PID_FILE"))"
        return 1
    fi

    echo "Starting monitoring with caffeinate (prevents sleep)..."
    
    # Start the monitoring script with caffeinate in the background
    # -i prevents idle sleep, -s prevents system sleep
    nohup caffeinate -is node "$MONITOR_SCRIPT" > "$SCRIPT_DIR/monitor.log" 2>&1 &
    
    # Get the PID of the caffeinate process
    CAFFEINATE_PID=$!
    echo "$CAFFEINATE_PID" > "$PID_FILE"
    
    # Wait a moment to see if it started successfully
    sleep 2
    
    if is_running; then
        echo "Monitoring started successfully (PID: $CAFFEINATE_PID)"
        echo "Logs: $SCRIPT_DIR/monitor.log"
        echo "To stop: $SCRIPT_DIR/stop-monitoring.sh"
        return 0
    else
        echo "Failed to start monitoring"
        rm -f "$PID_FILE"
        return 1
    fi
}

# Function to stop monitoring
stop_monitoring() {
    if ! is_running; then
        echo "Monitoring is not running"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    echo "Stopping monitoring (PID: $PID)..."
    
    # Kill the caffeinate process (this will also kill the node process)
    kill "$PID" 2>/dev/null
    
    # Wait for process to stop
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Force killing process..."
        kill -9 "$PID" 2>/dev/null
    fi
    
    # Clean up files
    rm -f "$PID_FILE"
    rm -f "$LOCK_FILE"
    
    echo "Monitoring stopped"
    return 0
}

# Function to get status
get_status() {
    if is_running; then
        PID=$(cat "$PID_FILE")
        echo "Monitoring is running (PID: $PID)"
        
        # Check if caffeinate is preventing sleep
        if pmset -g assertions | grep -q "caffeinate"; then
            echo "Sleep prevention: Active"
        else
            echo "Sleep prevention: Unknown"
        fi
        
        return 0
    else
        echo "Monitoring is not running"
        return 1
    fi
}

# Main script logic
case "${1:-start}" in
    start)
        start_monitoring
        ;;
    stop)
        stop_monitoring
        ;;
    restart)
        stop_monitoring
        sleep 2
        start_monitoring
        ;;
    status)
        get_status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo "  start   - Start monitoring with sleep prevention"
        echo "  stop    - Stop monitoring"
        echo "  restart - Restart monitoring"
        echo "  status  - Check monitoring status"
        exit 1
        ;;
esac