#!/bin/bash

# Simple script to stop monitoring
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/start-monitoring.sh" stop