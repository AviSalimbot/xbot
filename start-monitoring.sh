#!/bin/bash

# Script to start the monitoring with caffeinate to prevent sleep
# This ensures the monitoring continues even when the laptop would normally sleep

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/monitorRelevantTweets.js"

# Get topic from command line argument or environment variable
TOPIC="${2:-${TOPIC:-ethereum}}"

# Topic-specific files
PID_FILE="$SCRIPT_DIR/.${TOPIC}_monitor.pid"
LOCK_FILE="$SCRIPT_DIR/.${TOPIC}_monitor.lock"
LOG_FILE="$SCRIPT_DIR/${TOPIC}_monitor.log"

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
    # Set TOPIC and FOLLOWER_OVERRIDE environment variables for the monitoring process
    ENV_VARS="TOPIC=$TOPIC"
    if [ -n "$FOLLOWER_OVERRIDE" ]; then
        ENV_VARS="$ENV_VARS FOLLOWER_OVERRIDE=$FOLLOWER_OVERRIDE"
    fi
    nohup caffeinate -is env $ENV_VARS node "$MONITOR_SCRIPT" > "$LOG_FILE" 2>&1 &
    
    # Get the PID of the caffeinate process
    CAFFEINATE_PID=$!
    echo "$CAFFEINATE_PID" > "$PID_FILE"
    
    # Wait a moment to see if it started successfully
    sleep 2
    
    if is_running; then
        echo "Monitoring started successfully (PID: $CAFFEINATE_PID)"
        echo "Topic: $TOPIC"
        echo "Logs: $LOG_FILE"
        echo "To stop: $SCRIPT_DIR/stop-monitoring.sh stop $TOPIC"
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
        echo "Monitoring is not running for topic: $TOPIC"
        # Still try to clean up any remaining processes for this specific topic
        # No global cleanup when topic is not running
        # Return 0 since the goal (stop monitoring) is achieved
        return 0
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
    
    # Only clean up topic-specific processes, not all monitoring processes
    # The specific process should already be killed above
    
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
        echo "Monitoring is not running for topic: $TOPIC"
        return 1
    fi
}

# Main script logic
# Usage: ./start-monitoring.sh {start|stop|restart|status} [topic]
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
        echo "Usage: $0 {start|stop|restart|status} [topic]"
        echo "  start [topic]   - Start monitoring with sleep prevention (default: ethereum)"
        echo "  stop [topic]    - Stop monitoring for specific topic"
        echo "  restart [topic] - Restart monitoring for specific topic"
        echo "  status [topic]  - Check monitoring status for specific topic"
        echo "  topic defaults to 'ethereum' if not specified"
        exit 1
        ;;
esac