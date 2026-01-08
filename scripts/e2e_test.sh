#!/bin/bash
set -e

# Path to the built app binary
APP_PATH="./src-tauri/target/release/bundle/macos/VibeCast.app/Contents/MacOS/vibe_cast"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_PATH="$SCRIPT_DIR/e2e_config.json"

if [ ! -f "$APP_PATH" ]; then
    echo "Error: App binary not found at $APP_PATH"
    echo "Please run 'npm run tauri build' first."
    exit 1
fi

echo "Starting VibeCast E2E Test..."
echo "Config: $CONFIG_PATH"

# Cleanup previous instances
echo "Cleaning up previous instances..."
pkill vibe_cast || true
node scripts/kill-port.mjs 8080
sleep 1

# Launch app in background (no config initially)
"$APP_PATH" &
APP_PID=$!
echo "App launched with PID $APP_PID"

# Function to clean up on exit
cleanup() {
    echo "Stopping app..."
    kill "$APP_PID" || true
    wait "$APP_PID" 2>/dev/null || true
    rm -f load_payload.json
    echo "Done."
}
trap cleanup EXIT

# Wait for server to be ready
echo "Waiting for server to start..."
MAX_RETRIES=30
SERVER_PORT=8080
CONNECTED=false

for ((i=1; i<=MAX_RETRIES; i++)); do
    if curl -s "http://localhost:$SERVER_PORT/api/status" | grep -q "online"; then
        echo "Server is online at port $SERVER_PORT"
        CONNECTED=true
        break
    fi
    sleep 1
done

if [ "$CONNECTED" = false ]; then
    echo "Error: Server failed to start within timeout."
    exit 1
fi

# Load configuration via API
echo "Loading configuration via API..."
jq -n --slurpfile config "$CONFIG_PATH" '{command: "load-configuration", payload: $config[0]}' > load_payload.json

curl -s -X POST -H "Content-Type: application/json" -d @load_payload.json "http://localhost:$SERVER_PORT/api/command" > /dev/null
echo "Configuration loaded."

# Wait for state update
sleep 2

# Check state
echo "Checking application state..."
STATE=$(curl -s "http://localhost:$SERVER_PORT/api/state")

if echo "$STATE" | grep -q "E2E TEST START"; then
    echo "SUCCESS: Found 'E2E TEST START' in state."
else
    echo "FAILURE: 'E2E TEST START' not found in state."
    echo "State content: $STATE"
    exit 1
fi

# Optional: Trigger a message to verify command handling
echo "Triggering message..."
curl -s -X POST -H "Content-Type: application/json" \
    -d '{"command": "trigger-message", "payload": "E2E TEST START"}' \
    "http://localhost:$SERVER_PORT/api/command" > /dev/null

echo "Message triggered. Waiting 2 seconds..."
sleep 2

echo "E2E Test Passed!"
