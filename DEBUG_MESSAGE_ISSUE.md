# Debug Guide: Message Display Issue in Production

If messages are still not showing in the visualization, follow this guide to collect debug information.

## Where to Find Logs

### 1. Debug Overlay (RECOMMENDED - Works in Production!)
- **Enable the debug overlay** in VisualizerWindow:
  - Press `Cmd+Shift+D` (Mac) or `Ctrl+Shift+D` (Windows/Linux)
  - OR add `?vizDebug=1` to the URL when opening the window
  - OR set `localStorage.setItem('vibecast:vizDebug', '1')` in console
- The overlay shows:
  - Real-time state: `isStateLoaded`, `sseConnected`, `activeMessages` count
  - Current `triggeredMessage` from SSE
  - Click "Show Logs" button to see recent log events
  - Color-coded status indicators (green = good, red = bad)

### 2. VisualizerWindow Console (Browser DevTools)
- Open the VisualizerWindow
- Right-click → "Inspect" or press `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
- Go to the "Console" tab
- Look for logs prefixed with `[VisualizerWindow]`
- **Note**: In production builds, console may not be easily accessible

### 3. ControlPlane Console
- Open the ControlPlane window
- Open DevTools (same as above)
- Check for any errors when triggering messages

### 4. Rust Backend Logs (Terminal)
- If running `tauri dev`, check the terminal where you started it
- Look for logs from `[Server]`, `[message-complete]`, `[Rust]`

## Key Logs to Check

### Initialization Logs (should appear on window load)

1. **SSE Connection:**
   ```
   [VisualizerWindow] SSE effect triggered: { sseState: 'received' | 'null', sseConnected: true/false }
   ```
   - ✅ **Good**: `sseState: 'received'`, `sseConnected: true`
   - ❌ **Bad**: `sseState: 'null'` or `sseConnected: false` (SSE not connected)

2. **State Loading:**
   ```
   [VisualizerWindow] SSE state received: { ... }
   ```
   - Check if `triggeredMessage` is present in this log
   - Check if `textStylePresetsCount` is > 0

3. **State Loaded Flag:**
   ```
   [VisualizerWindow] Config loaded into store, isStateLoaded: true/false
   ```
   - ✅ **Good**: `isStateLoaded: true`
   - ❌ **Bad**: `isStateLoaded: false` (messages won't render)

4. **Event Listeners:**
   ```
   [VisualizerWindow] Initializing event listeners for message processing
   ```
   - Should appear once when component mounts

### Message Triggering Logs

5. **When Message is Triggered (Tauri Event):**
   ```
   [VisualizerWindow] Received trigger-message via Tauri event: { id: '...', text: '...' }
   [VisualizerWindow] Triggering message via Tauri event
   ```
   - ✅ **Good**: Both logs appear
   - ❌ **Bad**: Only first log (message not being added to store)

6. **When Message is Triggered (SSE):**
   ```
   [VisualizerWindow] Syncing triggeredMessage from SSE to store: { id: '...', text: '...' }
   ```
   - ✅ **Good**: This log appears
   - ❌ **Bad**: No log (SSE triggeredMessage not being synced)

7. **Active Messages Updated:**
   ```
   [VisualizerWindow] activeMessages changed: { count: 1, messages: [...] }
   ```
   - ✅ **Good**: `count` increases when message is triggered
   - ❌ **Bad**: `count` stays at 0

8. **Message Rendering:**
   ```
   [VisualizerWindow] Rendering activeMessages: [...]
   ```
   - ✅ **Good**: This log appears with message data
   - ❌ **Bad**: No log (messages not being rendered)

### Message Completion Logs

9. **Message Completed:**
   ```
   [VisualizerWindow] Message completed: <messageId> timestamp: <timestamp>
   [VisualizerWindow] Successfully sent command message-complete
   ```
   - ✅ **Good**: Both logs appear
   - ❌ **Bad**: Only first log (backend not receiving completion)

## Debug Checklist

When testing, check these in order:

### Step 1: Verify Initialization
- [ ] VisualizerWindow console shows "SSE effect triggered" with `sseConnected: true`
- [ ] VisualizerWindow console shows "SSE state received" with state data
- [ ] VisualizerWindow console shows "Config loaded into store, isStateLoaded: true"
- [ ] VisualizerWindow console shows "Initializing event listeners"

### Step 2: Verify Message Triggering
- [ ] Trigger a message from ControlPlane
- [ ] Check VisualizerWindow console for "Received trigger-message" OR "Syncing triggeredMessage from SSE"
- [ ] Check VisualizerWindow console for "activeMessages changed" with `count: 1`
- [ ] Check VisualizerWindow console for "Rendering activeMessages"

### Step 3: Verify Message Display
- [ ] Message appears visually on screen
- [ ] Message completes and disappears
- [ ] Check console for "Message completed" log
- [ ] Check console for "Successfully sent command message-complete"

## What to Report If It Still Doesn't Work

If messages still don't appear, provide:

1. **Screenshot of Debug Overlay** (MOST IMPORTANT!)
   - Enable debug overlay (`Cmd+Shift+D` or `?vizDebug=1`)
   - Take screenshot showing all the state values
   - Click "Show Logs" and take another screenshot of the logs
   - This works even when console isn't accessible

2. **Debug Overlay State Values:**
   - `isStateLoaded`: Should be `true` (green)
   - `sseConnected`: Should be `true` (green)
   - `hasReceivedSSEState`: Should be `true` (green)
   - `activeMessages`: Should show count > 0 when message is triggered
   - `triggeredMsg (SSE)`: Should show message ID when triggered

3. **Logs from Debug Overlay:**
   - Click "Show Logs" button in debug overlay
   - Look for these key log entries:
     - "SSE effect triggered"
     - "SSE state received"
     - "Config loaded into store"
     - "Syncing triggeredMessage from SSE to store"
     - "activeMessages changed"
     - "Rendering activeMessages"

4. **Console logs** (if accessible):
   - Filter by `[VisualizerWindow]`
   - Include logs from window load through message trigger

5. **Steps to reproduce:**
   - How you triggered the message (button click, HTTP command, etc.)
   - Whether it's a production build or dev mode
   - Whether the window was just opened or recreated

## Quick Diagnostic Commands

If you have access to the browser console, you can run these:

```javascript
// Check if overlay exists
document.querySelector('[data-message-overlay="true"]')

// Check activeMessages in store
// (This requires the store to be accessible - may not work in production)
// But you can check the console logs for "activeMessages changed"

// Check if SSE is connected
// Look for "sseConnected: true" in logs
```

## Common Issues and Solutions

### Issue: `isStateLoaded: false`
**Cause**: `textStylePresets` not loaded from SSE
**Check**: Look for "SSE state received" log and verify `textStylePresetsCount` > 0

### Issue: No "Syncing triggeredMessage from SSE" log
**Cause**: `triggeredMessage` not in SSE state or already processed
**Check**: Look for "SSE state received" log and check if `triggeredMessage` is present

### Issue: "activeMessages changed" shows count: 0
**Cause**: Message not being added to store
**Check**: Look for "Triggering message via Tauri event" or "Syncing triggeredMessage" logs

### Issue: "Rendering activeMessages" log appears but no visual message
**Cause**: Message component not rendering or CSS issue
**Check**: Inspect DOM to see if message elements exist but are hidden

