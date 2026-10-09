# Message playback synchronization

Rust `AppStateSync` owns playback state. Control Plane and Remote send HTTP commands; the Visualizer renders messages from state snapshots and reports completion. Tauri playback commands remain available for IPC callers.

## State and delivery

- `src-tauri/crates/state/src/lib.rs` owns `playback_control`, `triggered_message`, the folder queue, and runtime revisions. Every new playback receives a unique `sessionId`, including replays of the same message.
- `src-tauri/crates/server/src/lib.rs` handles HTTP commands, updates play statistics, schedules safety timeouts, and broadcasts state through SSE.
- `src-tauri/crates/app/src/lib.rs` exposes IPC playback commands and initial state loading.
- `playback-control-changed` Tauri events include a complete `state` snapshot. SSE `/api/events` carries the same playback fields. Remote uses compact SSE state through `useRemoteAppState`; desktop uses `useAppState`.
- `src/components/VisualizerWindow.tsx` reconciles IPC bootstrap, Tauri events, and SSE through one revision-aware function. Older revisions are ignored. A session is rendered once, and its duplicate snapshots cannot resurrect it after local completion. Different messages may overlap; replaying the same message replaces its earlier renderer.

Raw trigger events and cross-window timestamp-based clear events are no longer part of playback synchronization. Configuration and debug actions still use their existing event paths.

## Commands

All HTTP commands use `POST /api/command`. `deviceType` identifies the initiating client (`control_plane`, `mobile_remote`, or `system`).

| Command | Payload | Effect |
| --- | --- | --- |
| `trigger-message` | Message configuration | Starts a new session and clears any prior folder queue. |
| `stop-message` | `{}` | Stops current playback and clears the folder queue. |
| `play-folder` | `{ "folderId": "…" }` | Starts the folder's first message and queues the remainder. |
| `cancel-folder-playback` | `{}` | Clears the queue and stops playback. |
| `message-complete` | `{ "messageId": "…", "playbackSessionId": "…" }` | Advances the matching session's queue, or stops it if no next message exists. |
| `clear-active-message` | `{ "messageId": "…", "playbackSessionId": "…" }` | Uses the same session check and queue advancement as completion. |

Completion and clear requests missing either identity return HTTP 400. Requests for an old session are harmless no-ops. The Visualizer captures the session in each renderer's completion callback; it must never substitute the latest session. Debug-only messages complete locally without notifying Rust. `playbackSessionId` is distinct from the top-level E2E `sessionId` metadata.

Safety timers also retain the originating session and check it before stopping or advancing playback. State still uses multiple mutexes; session checks and mutations are not a single atomic operation across concurrent commands.

## Verification and diagnosis

Run frontend tests with `npm test -- --maxWorkers=1` and Rust tests with `cargo test --workspace -j 2 -- --test-threads=1` from `src-tauri`.

`VisualizerPlayback.test.tsx` covers transport deduplication, same-message replay, stale stops/completions, and local debug completion. Server tests cover session rejection and folder advancement. `ControlPlanePlaybackControls.test.tsx` covers HTTP start/stop and device identity.

For a stale view, compare `runtimeRevision` and playback `sessionId` on its IPC/SSE snapshots. Confirm the handler broadcasts current state and emits `playback-control-changed`. Control Plane uses an immediate Tauri playback override plus SSE; Remote derives playback from SSE.

For a manual check, start from Control Plane and stop from Remote, then reverse the direction. Let a message finish, replay it immediately, and play a folder through to completion. All controls should agree on the current playback, and late callbacks must leave newer sessions alone.
