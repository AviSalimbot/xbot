#!/bin/bash

# Simple script to stop monitoring with topic support
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pass topic argument if provided, otherwise use default
TOPIC="${1:-${TOPIC:-ethereum}}"

"$SCRIPT_DIR/start-monitoring.sh" stop "$TOPIC"