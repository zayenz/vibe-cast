# Message Playback Cross-View Sync — Handoff for Agents

## What Problem Was Attacked

**Vibe Cast** has three UIs that must stay in sync for "message playback" (playing a text/marquee message on the visualizer):

1. **Control Plane** — React window (Tauri, main display); starts/stops messages.
2. **Visualizer** — React window (Tauri, secondary display); shows the message.
3. **Remote** — React web app (browser, served by Axum on LAN); starts/stops messages.

**Goal:** When any device starts or stops a message, **all** devices must show the same state (playing vs idle, and who can stop). In particular:

- If the **Remote** starts a message, the **Control Plane** and other Remotes must show "playing" and be able to stop it.
- If the **Control Plane** starts a message, the **Remote** must show "playing" and be able to stop it.
- If **any** device stops a message, **all** UIs must show "stopped" (and the visualizer must stop displaying it).
- When a message **finishes on its own** (no user stop), all UIs must show "stopped" (no stuck "playing" state).

## Architecture (Where Things Live)

- **Single source of truth:** Rust `AppStateSync` in `src-tauri/crates/state/src/lib.rs`.
  - Holds: `playback_control` (PlaybackControlState), `triggered_message`, and the usual app config/messages.
  - Updates flow: HTTP commands (Control Plane + Remote) → mutate `AppStateSync` → broadcast to clients.

- **Two delivery paths to clients:**
  1. **SSE (Server):** `GET /api/events` streams full state. Used by **Control Plane** and **Remote**. Implemented in `src-tauri/crates/server/src/lib.rs` (`state_events`, and `handle_command` which mutates state then the existing `broadcast` sends to `state_tx`).
  2. **Tauri events:** Backend emits `playback-control-changed` (and `state-changed`, `triggered-message`) to **all Tauri windows** (Control Plane + Visualizer). Control Plane uses these for low-latency UI; Visualizer uses them to clear/start messages.

- **Relevant files:**
  - **Rust state:** `src-tauri/crates/state/src/lib.rs` — `start_message_playback`, `start_message_playback_with_message`, `stop_message_playback`, `broadcast()`, `clear_triggered_message()`, `get_state()`.
  - **Rust app (Tauri commands):** `src-tauri/crates/app/src/lib.rs` — `start_message_playback`, `stop_message_playback`; kept for backward compatibility but no longer called from the CP frontend.
  - **Rust server (HTTP + SSE):** `src-tauri/crates/server/src/lib.rs` — `handle_command` for `trigger-message`, `stop-message`, `message-complete`, `clear-active-message`; each updates `AppStateSync`, emits `playback-control-changed` for Tauri windows, and broadcasts via SSE. The `RemoteCommand` struct has an optional `deviceType` field for source tracking.
  - **Frontend state hook:** `src/hooks/useAppState.ts` — subscribes to SSE, parses state (including `playbackControl`). `useSendCommand` detects Tauri vs browser to set `deviceType` automatically.
  - **Control Plane:** `src/components/ControlPlane.tsx` — uses `sendCommand('trigger-message', msg)` and `sendCommand('stop-message', {})` via HTTP; listens to `playback-control-changed` Tauri events for fast UI override; syncs from SSE as fallback.
  - **Remote:** `src/components/RemoteControl.tsx` — uses `state?.playbackControl` and `state?.triggeredMessage` (and `currentMessageId` from them); sends `stop-message` when user stops, `trigger-message` when user starts.
  - **Visualizer:** `src/components/VisualizerWindow.tsx` — listens to `playback-control-changed` (e.g. `MESSAGE_STOPPED`) to clear active messages; also uses SSE state as fallback.

## What Was Fixed (So Far)

1. **Server `trigger-message`:** Calls `start_message_playback_with_message(msg, device_type)` and emits `playback-control-changed` so playback state is set and Tauri windows + SSE get it. Uses `device_type` from the command payload (defaults to `MobileRemote`).
2. **Server `stop-message`:** Calls `stop_message_playback(device_type)` and emits `playback-control-changed` so all views see "stopped."
3. **Server `message-complete`:** When there is no next message to play, calls `stop_message_playback(DeviceType::System)` and emits `playback-control-changed` so "playing" does not get stuck after a message ends.
4. **Server `clear-active-message`:** When the current message is cleared with no next, calls `stop_message_playback` and emits so state stays consistent.
5. **Remote:** Sends `stop-message` (not only `clear-active-message`) when stopping; derives "playing" from `playbackControl` and `triggeredMessage`.
6. **useAppState:** When `apiBase` is `''`, uses `window.location.origin` so the Remote (same-origin) connects to SSE and receives state.
7. **Control Plane:** Syncs `playbackControlOverride` from SSE when `state?.playbackControl?.isPlaying === false` so it updates when the Remote stops even if the Tauri event does not reach it.
8. **Unified playback path (Feb 2026):** Control Plane now uses `sendCommand('trigger-message', msg)` and `sendCommand('stop-message', {})` via the HTTP API instead of Tauri `invoke('start_message_playback')`. This ensures all playback (CP, Remote, folder) flows through the same server handler, which: updates `message_stats` (triggerCount, history) for all plays; broadcasts state via SSE to all connected clients; emits Tauri events for Visualizer and CP; tracks source via `deviceType`; and has an auto-stop safety timer.

## How to Investigate Further Issues

1. **Trace the path of the action (unified):**
   - **Start from any client:** HTTP `POST /api/command` with `trigger-message` → `handle_command` in server → `start_message_playback_with_message(msg, device_type)` + emit Tauri events + update `message_stats` + final `broadcast()`.
   - **Stop from any client:** HTTP `POST /api/command` with `stop-message` → `handle_command` in server → `stop_message_playback(device_type)` + emit Tauri events + final `broadcast()`.
   - **Auto-stop paths:** `message-complete` (Visualizer reports done) or safety timer (duration + 500ms) → `stop_message_playback(System)` + emit + broadcast.

2. **Check both channels:** For "X didn't update," determine whether X uses **SSE only** (Remote), **Tauri events only** (Visualizer for clearing), or **both** (Control Plane). If it's SSE, ensure the final `broadcast()` at end of `handle_command` fires. If it's Tauri, ensure `app_handle.emit("playback-control-changed", ...)` is called in the handler.

3. **Control Plane override:** It uses `playbackControlOverride || state?.playbackControl`. The override is set from `playback-control-changed` Tauri events (emitted by the server handler). SSE also updates `state.playbackControl`. If the override is stale, check that the server handler emits Tauri events and that the CP's sync effect runs when `!isPlaying`.

4. **Remote not connecting:** If the Remote runs on the same origin as the server (e.g. `http://localhost:8080`), `apiBase` is `''`. Confirm `useAppState` uses `window.location.origin` when `apiBase` is empty and that the SSE URL is correct (e.g. `/api/events` on that origin).

5. **Device type tracking:** The `RemoteCommand` struct has an optional `deviceType` field (`control_plane` or `mobile_remote`). `useSendCommand` and `commandAction` detect Tauri vs browser automatically. Missing field defaults to `MobileRemote`.

## How to Test

- **Manual (recommended):**
  1. Start app: `npm run tauri dev`. Open Remote in browser at the URL shown (e.g. `http://<LAN>:8080`).
  2. Start a message from **Control Plane** → Remote should show "playing" and play count should increment; stop from Remote → Control Plane should show "stopped."
  3. Start a message from **Remote** → Control Plane should show "playing" (and "started from Remote") with count increment; stop from Control Plane → Remote should show "stopped."
  4. Start a message from either → let it finish; both should show "stopped" (no stuck "playing").
  5. Open a **second Remote** tab → start from either; both Remotes and CP should show "playing."

- **Rust:** `cd src-tauri && cargo test --workspace` (state crate has playback/command tests, models has property-based UI consistency tests).
- **Frontend:** `npm test -- --run` (playback-related: `ControlPlanePlaybackControls.test.tsx` verifies HTTP trigger-message/stop-message flow with deviceType).

## How to Fix Further Issues

- **State not updating on one client:** Since all playback goes through the server's `handle_command`, ensure the handler calls (a) the right `AppStateSync` method and (b) both `broadcast()` (for SSE) and `app_handle.emit(...)` (for Tauri windows).
- **Play count not incrementing:** Verify the `message_stats` update block in the `trigger-message` handler runs before the final `broadcast()` at end of `handle_command`.
- **Auto-stop not firing:** Check `playback_control.current_message.duration` — if `None`, no safety timer is spawned. The Visualizer should still send `message-complete` when the animation ends.

Design and requirements are also under `.kiro/specs/message-control-sync/` (design.md, requirements.md) and the implementation plan in `cross-view-stop-plan.md` there.
