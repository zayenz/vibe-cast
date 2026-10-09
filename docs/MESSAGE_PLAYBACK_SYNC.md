# Message playback synchronization

Rust `AppStateSync` owns playback state. Control Plane and Remote send HTTP commands; the Visualizer renders messages from state snapshots and reports completion. Tauri playback commands remain available for IPC callers.

## State and delivery

- `src-tauri/crates/state/src/lib.rs` keeps playback control, the triggered message, and the folder queue in one private mutex. Every new playback receives an opaque UUID-based `sessionId`, including replays of the same message. IDs do not repeat when the backend restarts, so retained HTTP completion requests cannot identify a new session by accident.
- `src-tauri/crates/server/src/lib.rs` handles HTTP commands, updates play statistics, schedules safety timeouts, and broadcasts state through SSE.
- `src-tauri/crates/app/src/lib.rs` exposes IPC playback commands and initial state loading. `get_app_state` serializes the same canonical snapshot used by desktop SSE, including `runtimeRevision`.
- `playback-control-changed` Tauri events include a complete `state` snapshot. Its embedded `state.playbackControl` and `runtimeRevision` describe playback together; the outer control field mirrors it. Event types describe the operation that caused publication and are advisory: another command may have committed before publication. Desktop uses SSE `/api/events` through `useAppState`; Remote uses `/api/remote/events` through `useRemoteAppState`.
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

## Transition and delivery guarantees

`finish_message_playback(message_id, session_id, device_type)` checks both identities and whether playback is running, resolves the next folder item, and commits the next session or stopped state under the same playback lock. A duplicate or stale completion changes neither playback nor its revision. A missing next message clears the queue and stops playback. Advancement publishes the next playing state directly, without an intermediate stopped snapshot.

Individual starts replace playback and clear the folder queue. Folder starts install the queue and its first session together. Stop and cancel clear playback and queue together. The exposed IPC Start/Stop/Pause/Resume command processor uses the same owner; Start validates that nothing is playing, unlike HTTP `trigger-message`, which permits replacement. Pause/Resume remain IPC control-state operations; the current message renderer does not implement animation pause/resume.

Safety timers capture the session returned by their own start and call the same atomic completion operation after sleeping. HTTP and IPC handlers never hold playback locks while waiting, emitting Tauri events, or scheduling timers. State, remote, and diagnostic snapshots capture playback fields and `runtimeRevision` under that lock. Other configuration fields and play statistics have their own synchronization; a snapshot is not a transaction over the entire application.

SSE and Tauri may deliver snapshots in different orders. Within an SSE connection, both state hooks retain newer runtime fields when an older revision arrives; configuration fields are handled independently. Each SSE connection begins with a fresh authoritative initial snapshot. Reconnect adopts that snapshot as its new revision baseline, allowing a mobile page to recover when the desktop app restarts and revisions return to zero. Initial desktop bootstrap and SSE can overlap, so their first connection retains the revision guard; Remote finishes bootstrap before opening SSE. Control Plane chooses the newer playback snapshot from SSE and Tauri for both playing and stopped states. Visualizer ignores duplicate or older revisions and renders each session once. Revisions order snapshots within a running backend; they are not acknowledgements, command IDs, or a persisted log. The command response acknowledges handling, while snapshots report authoritative playback.

## Verification and diagnosis

Run frontend tests with `npm test -- --maxWorkers=1` and Rust tests with `cargo test --workspace -j 2 -- --test-threads=1` from `src-tauri`.

`VisualizerPlayback.test.tsx` covers transport deduplication, same-message replay, stale stops/completions, and local debug completion. State tests force completion to pause after session validation while a replacement start competes for ownership, and check duplicate completion, queue advancement, and snapshot consistency. Server tests exercise HTTP identity validation, stale requests, missing queue items, and timer advancement. Hook and Control Plane tests deliver snapshots in reversed revision order and check recovery across reconnect with a reset revision counter. `ControlPlanePlaybackControls.test.tsx` covers HTTP start/stop and device identity.

For a stale view, compare `runtimeRevision` and playback `sessionId` on its IPC/SSE snapshots. Confirm the handler broadcasts current state and emits `playback-control-changed`. Control Plane selects playback by revision across Tauri and SSE; Remote derives playback from SSE.

For a manual check, start from Control Plane and stop from Remote, then reverse the direction. Let a message finish, replay it immediately, and play a folder through to completion. All controls should agree on the current playback, and late callbacks must leave newer sessions alone.
