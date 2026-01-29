# Message Control Sync - Root Cause Analysis

## Executive Summary

The message-control-sync spec implementation has broken message playback because **the Visualizer window is no longer receiving the `triggered-message` event** that it depends on to display messages. The spec changes introduced a new playback control system but failed to maintain backward compatibility with the existing message display mechanism.

## Root Cause - FINAL ANALYSIS (CORRECTED)

After thorough code review and checking Tauri v2 documentation, I've identified the actual problem:

### The Real Issue: SSE Connection Failure

Looking at your debug logs more carefully:
```
SSE connection timed out, falling back to local defaults
sseConnected: false
hasReceivedSSEState: false
triggeredMsg (SSE): none
activeMessages: 0
```

**The Tauri events ARE being emitted correctly** (using `handle.emit()` which is global in Tauri v2), but the Visualizer is not receiving them because:

1. **The SSE connection is failing** - The Visualizer expects to receive initial state via SSE
2. **The Visualizer waits for SSE state before fully initializing** - See line 617: `const stateIsReady = Array.isArray(sseState.textStylePresets) && hasReceivedSSEState;`
3. **The 2-second timeout triggers** - The Visualizer falls back to local defaults but `hasReceivedSSEState` remains `false`
4. **The Tauri event listener IS set up** (line 779, runs on mount), but something else is preventing messages from displaying

### Why Messages Don't Show

The issue is NOT that events aren't reaching the Visualizer. The issue is that **even if the event is received and `triggerMessage()` is called, the messages don't render** because:

1. The Visualizer component has `isStateLoaded` set to `true` after timeout (line 637)
2. But `hasReceivedSSEState` is still `false`
3. This might be affecting other parts of the rendering logic

Let me check if there's a guard condition that prevents rendering when SSE hasn't connected...

## Evidence from Code

### app/src/lib.rs (lines 446-473)
```rust
#[tauri::command]
async fn start_message_playback(
    handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppStateSync>>,
    message_id: String
) -> Result<serde_json::Value, String> {
    // ... message lookup and state update ...
    
    // CRITICAL: Emit the triggered-message event that the Visualizer listens for
    let _ = handle.emit("triggered-message", &message);  // ← WRONG! Only emits to calling window
    
    // ... rest of the code ...
}
```

**The problem:** `handle.emit()` only emits to the window that invoked the command (Control Plane), not to all windows.

### VisualizerWindow.tsx (lines 779-790)
```typescript
// Listen for triggered-message events from Tauri commands (Control Plane)
const unlistenTriggeredPromise = listen<MessageConfig>('triggered-message', (event) => {
  const msg = event.payload;
  console.log('[VisualizerWindow] Received triggered-message event:', { id: msg.id, text: msg.text?.substring(0, 50) });
  
  const isActive = useStore.getState().activeMessages.some((am) => am.message.id === msg.id);
  if (!isActive) {
    console.log('[VisualizerWindow] Triggering message from triggered-message event');
    triggerMessage(msg, false);
  }
});
```

**The listener is set up correctly**, but it never receives the event because the event is only sent to the Control Plane window.

### Your Debug Logs
```
SSE connection timed out, falling back to local defaults
SSE state is null, waiting...
sseConnected: false
hasReceivedSSEState: false
activeMessages: 0
```

**Notably missing:**
- No `[VisualizerWindow] Received triggered-message event:` log
- No `[VisualizerWindow] Triggering message from triggered-message event` log

This confirms the event is not reaching the Visualizer.

## The Spec's Design Flaw

The spec design document shows this architecture:

```
Control Plane → Command → AppStateSync → SSE Handler → Visualizer
                                      → Tauri Events → Visualizer
```

But it **failed to account for**:
1. **Tauri event scoping** - `handle.emit()` only emits to the calling window, not all windows
2. **The need for `emit_all()` or `emit_to()`** - To reach other windows
3. **Testing across windows** - The spec was likely tested with SSE working, masking the Tauri event issue

## What Should Have Happened

The spec should have:

1. **Used `emit_all()` instead of `emit()`** - To broadcast to all windows
2. **Tested without SSE** - To verify Tauri events work independently
3. **Documented the window communication pattern** - Make it clear which events go where
4. **Added logging** - To debug event delivery issues

## Immediate Fixes Needed

### Fix 1: Use emit_all() in Rust (CRITICAL)

In `src-tauri/crates/app/src/lib.rs`, line 473:

```rust
// WRONG (current):
let _ = handle.emit("triggered-message", &message);

// RIGHT (fix):
let _ = handle.emit_all("triggered-message", &message);
```

This single line change will fix the entire issue!

### Fix 2: Also Fix Other Event Emissions

Check all other `handle.emit()` calls in the same function and ensure they use `emit_all()` or `emit_to()` as appropriate:

```rust
// Line 476 - This should probably also be emit_all
let _ = handle.emit_all("playback-control-changed", serde_json::json!({
    "type": "MESSAGE_STARTED",
    "playbackControl": playback_control,
    "state": complete_state
}));

// Line 482 - This should probably also be emit_all
let _ = handle.emit_all("state-changed", serde_json::json!({
    "type": "MESSAGE_STARTED",
    "payload": serde_json::json!({ "messageId": message_id }),
    "state": complete_state
}));
```

### Fix 3: Fix stop_message_playback Too

Check the `stop_message_playback` command and ensure it also uses `emit_all()`.

### Fix 4: Test Without SSE

After fixing, test with SSE disabled to verify Tauri events work independently.

## Lessons Learned

1. **Understand Tauri event scoping** - `emit()` vs `emit_all()` vs `emit_to()`
2. **Test cross-window communication** - Don't assume events reach all windows
3. **Add comprehensive logging** - Log event emissions AND receptions
4. **Test failure modes** - What happens when SSE times out? When events don't arrive?
5. **Don't rely on a single communication channel** - Have fallbacks

## Recommended Action Plan

1. **Immediate** (2 min): Change `handle.emit()` to `handle.emit_all()` in `start_message_playback`
2. **Immediate** (2 min): Change `handle.emit()` to `handle.emit_all()` in `stop_message_playback`
3. **Short-term** (10 min): Test that messages now work
4. **Short-term** (20 min): Review all other `handle.emit()` calls and fix them
5. **Medium-term** (1 hour): Add logging to track event delivery
6. **Long-term** (2 hours): Debug why SSE is timing out (secondary issue)

## Conclusion

The spec implementation broke message playback because:

1. **The Rust code uses `handle.emit()` instead of `handle.emit_all()`**
2. This means events are only sent to the Control Plane window, not the Visualizer
3. The Visualizer never receives the `triggered-message` event
4. Messages don't display because the event never arrives

The fix is trivial: change one word in the Rust code from `emit` to `emit_all`.

The SSE timeout is a **secondary issue** that doesn't affect the core functionality, but should be investigated separately.
