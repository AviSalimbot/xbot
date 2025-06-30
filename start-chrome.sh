#!/bin/bash

# Start Chrome with remote debugging
echo "🚀 Starting Google Chrome with remote debugging..."
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"

# Wait a moment for Chrome to start
echo "⏳ Waiting for Chrome to start..."
sleep 3

# Check if Chrome is running on port 9222
echo "🔍 Checking if Chrome is ready..."
for i in {1..10}; do
    if curl -s http://localhost:9222 > /dev/null; then
        echo "✅ Chrome is ready on port 9222"
        break
    else
        echo "⏳ Waiting for Chrome... (attempt $i/10)"
        sleep 2
    fi
done

# Start the XBot with the specified topic
if [ $# -eq 0 ]; then
    echo "❌ No topic specified"
    echo "Usage: ./start-chrome.sh <topic>"
    echo "Available topics: ethereum, basketball, crypto"
    echo "Example: ./start-chrome.sh ethereum"
    exit 1
fi

TOPIC=$1
echo "🤖 Starting XBot for topic: $TOPIC"
node start.js $TOPIC 