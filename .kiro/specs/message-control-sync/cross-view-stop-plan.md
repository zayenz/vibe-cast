# Cross-View Message Stop and Sync — Implementation Plan

## Tauri v2 alignment

This plan is aligned with [Tauri v2 State Management](https://v2.tauri.app/develop/state-management/) and the app’s existing use of Tauri APIs:

- **State management**: The app uses `app.manage(app_state_sync.clone())` in `setup` so commands receive `State<'_, Arc<AppStateSync>>`. Tauri manages the stored value; no extra `Arc` is required for *managed* state, but we pass the same `Arc<AppStateSync>` into the Axum server at spawn time so the server and Tauri commands share one source of truth.
- **Access outside commands**: The server does not use `app_handle.state::<Arc<AppStateSync>>()` because it receives `app_handle` and `app_state_sync` when `start_server(handle, server_state, 8080)` is called from `setup`. That matches the pattern “access state with the Manager trait” when you need it outside a command (we pass it explicitly instead of resolving it later).
- **Event emission**: The codebase uses `handle.emit("playback-control-changed", ...)` with the comment that “emit() broadcasts globally to all windows in Tauri v2.” The server will use `state.app_handle.emit("playback-control-changed", ...)` so Control Plane and Visualizer (all Tauri windows) receive the event. No `emit_all` is required if `emit` from `AppHandle` already broadcasts to all windows in this Tauri version.
- **Mutex / interior mutability**: `AppStateSync` uses `Mutex` (and similar) for fields that are mutated; that aligns with Tauri’s guidance on interior mutability for shared state.

---

## Current behavior (gaps)

- **Control Plane start/stop**: Uses Tauri `invoke('start_message_playback')` / `invoke('stop_message_playback')`, which update `AppStateSync.playback_control`, broadcast via `state_tx`, and emit `playback-control-changed` to Tauri windows. All views get state via SSE and Tauri events.
- **Remote start**: Sends `trigger-message` to the server. The server only sets local `triggered_message`, updates message stats, and calls `broadcast(triggered_message)` at the end. It **never** calls `AppStateSync.start_message_playback_with_message()`, so `playback_control` stays idle (`can_stop: false`). SSE clients get `triggeredMessage` but not updated `playbackControl`, so Control Plane and other remotes do not see “stop” for a message started from a remote.
- **Remote stop**: Sends `clear-active-message` with `messageId`. The server handles folder/queue logic and emits `remote-command` for next message but **never** calls `stop_message_playback()`, so `playback_control` is not cleared and Tauri windows do not get `playback-control-changed`.
- **Control Plane fallback**: When Tauri invoke fails, Control Plane sends `stop-message` / `start-message` over HTTP, but the server **does not handle** these commands today (no match branch in `handle_command`).

So: when a message is started from a remote, other remotes and the Control Plane do not get `playbackControl.canStop`; when stop is requested from a remote (or via fallback), the backend state and Tauri listeners are not updated.

## Target behavior

1. When **any** device starts a message (Control Plane or Remote), `playback_control` is updated and broadcast so **all** views (Control Plane, Visualizer, all Remotes) show playing state and stop control.
2. When **any** device stops playback, the backend runs the same stop logic, broadcasts state, and notifies Tauri windows so **all** views update immediately.

## Architecture (unchanged; fix server and clients)

- **Single source of truth**: `AppStateSync` (playback_control, triggered_message).
- **SSE**: Control Plane and Remotes use `useAppState`; state includes `playbackControl` and `triggeredMessage`.
- **Tauri events**: Control Plane and Visualizer listen to `playback-control-changed` for immediate UI and visualizer stop.
- **Server**: Axum `AppState` holds `app_handle: AppHandle` and `app_state_sync: Arc<AppStateSync>` (same `Arc` as in `app.manage`). The server uses `state.app_handle.emit(...)` so all Tauri windows receive playback events.

## Implementation plan

### 1. Server: Update playback state when Remote starts a message

**File**: `src-tauri/crates/server/src/lib.rs`

- In the `"trigger-message"` branch, after parsing `MessageConfig` and updating message stats:
  - Call `state.app_state_sync.start_message_playback_with_message(msg.clone(), DeviceType::MobileRemote)`.
  - Import `DeviceType` from `vibe_cast_models` (e.g. in the existing `use vibe_cast_models::{ ... }`).
- `start_message_playback_with_message` already updates `playback_control`, sets `triggered_message`, and calls `broadcast(Some(message))`, so SSE gets the new state.
- After that, emit `playback-control-changed` to Tauri windows (same payload shape as in `src-tauri/crates/app/src/lib.rs` `start_message_playback`), e.g. `state.app_handle.emit("playback-control-changed", { type, playbackControl, state })`, so Control Plane and Visualizer get immediate stop capability.

### 2. Server: Handle `stop-message` command

**File**: `src-tauri/crates/server/src/lib.rs`

- Add a `"stop-message"` branch in `handle_command`.
  - Call `state.app_state_sync.stop_message_playback(DeviceType::MobileRemote)` (or derive device from payload if desired).
  - `stop_message_playback` already calls `clear_triggered_message()`, which sends `get_state()` on `state_tx`, so SSE clients get the updated state.
  - Then emit `playback-control-changed` to Tauri (same payload shape as in app’s `stop_message_playback`: `type: "MESSAGE_STOPPED"`, `playbackControl`, `state`) so Control Plane and Visualizer clear playback and stop button immediately.

This gives a single, unified stop path for both Control Plane fallback and Remote.

### 3. Server: Optional consistency for `clear-active-message`

**File**: `src-tauri/crates/server/src/lib.rs`

- When `clear-active-message` results in “no next message” (queue cleared or no advance), call `state.app_state_sync.stop_message_playback(DeviceType::MobileRemote)` and emit `playback-control-changed` so `playback_control` and all views stay in sync.

### 4. Remote: Use unified stop command

**File**: `src/components/RemoteControl.tsx`

- When the user clicks stop on the **currently playing** message, send `stop-message` instead of `clear-active-message` (payload can be `{}` or `{ deviceId: 'mobile-remote' }` if the server uses it later).
- Keep `clear-active-message` for folder/queue advancement; optionally have that path also call `stop_message_playback` when there is no next message (see §3).

### 5. Remote: Use `playbackControl` from SSE for stop availability

**File**: `src/components/RemoteControl.tsx`

- Ensure the Remote UI uses `state?.playbackControl?.canStop` (and optionally `state?.playbackControl?.currentMessage`) so that when a message was started from Control Plane (or another remote), the Remote still shows “Playing” and “Stop” correctly.

### 6. Control Plane fallback

- Control Plane already sends `stop-message` and `start-message` when Tauri invoke fails. Once the server handles `stop-message` (and optionally `start-message` if added), fallback will work; no front-end change required for stop.

## Message passing summary

| Source        | Start path                         | Stop path                          |
|---------------|------------------------------------|------------------------------------|
| Control Plane | Tauri `start_message_playback`     | Tauri `stop_message_playback`       |
| Control Plane (fallback) | HTTP `start-message` (optional) | HTTP `stop-message` (add handler)  |
| Remote        | HTTP `trigger-message` (+ update playback_control + emit) | HTTP `stop-message` (add handler)  |

## Testing

- **Backend**: Add or extend server tests so that after `trigger-message` with a valid message, `get_playback_control()` has `is_playing: true`, `can_stop: true`; after `stop-message`, `get_playback_control()` has `is_playing: false`, `can_stop: false` and `triggered_message` is cleared.
- **Frontend**: Ensure Control Plane and Remote tests mock `playbackControl.canStop` and that Remote sends `stop-message` when stop is clicked.
- **E2E / manual**: Trigger from Remote, confirm Control Plane shows stop; stop from Control Plane or Remote, confirm all views update.

## Files to touch (summary)

- `src-tauri/crates/server/src/lib.rs`: `trigger-message` → call `start_message_playback_with_message` + emit `playback-control-changed`; add `stop-message` handler + emit; optionally in `clear-active-message` when no next message call `stop_message_playback` + emit.
- `src/components/RemoteControl.tsx`: Send `stop-message` when user stops current playback; rely on `state?.playbackControl` for stop availability.

## Risks and notes

- **Duplicate broadcast**: For `trigger-message`, the existing end-of-handler `broadcast(triggered_message)` runs after `start_message_playback_with_message` (which also broadcasts). Redundant but idempotent; can leave as is or skip final broadcast for `trigger-message` only.
- **Tauri emit from server**: The server already has `state.app_handle` and uses it for `remote-command`. Use the same handle to emit `playback-control-changed` with the same JSON shape as the app’s `stop_message_playback` / `start_message_playback` so frontend listeners do not need changes.
- **Device type**: Use `DeviceType::MobileRemote` for all HTTP-originated commands from the server for now; later you can add `deviceId` in the payload and map to `DeviceType` if needed.
