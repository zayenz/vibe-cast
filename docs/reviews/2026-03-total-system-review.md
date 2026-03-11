# Total System Review

Date: 2026-03-12

## Scope and evidence

This review covers the current worktree, including the in-progress mobile remote startup changes.

Evidence gathered in this pass:

- `npm test`: passing (`35` files, `165` tests)
- `cd src-tauri && cargo test --workspace`: passing
- `npm run build`: passing
- `npm run perf:remote-bundle-report`: passing
- `npm run lint`: passing with warnings only
- `cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings`: failing on pre-existing warnings in `crates/models` and `crates/state` test code

Current production build evidence:

| Area | Asset(s) | Raw | Gzip |
|---|---|---:|---:|
| Phone remote first load | `index` + `index.css` + `RemoteControl` + `useAppState` + `iconSet` | `285.46 KiB` | `83.95 KiB` |
| Desktop-heavy emitted code | `ControlPlaneRouter` + `VisualizerWindow` + `store` | `1.89 MiB` | `526.23 KiB` |

## Findings

### P1: Backend mutation logic is still duplicated

The codebase still has more than one mutation authority:

- Axum command handler: `src-tauri/crates/server/src/lib.rs`
- Tauri mutation command: `src-tauri/crates/app/src/lib.rs:239`
- Dedicated Tauri playback commands: `src-tauri/crates/app/src/lib.rs:529`, `src-tauri/crates/app/src/lib.rs:610`

The current worktree improves parity for remote playback, but it does not eliminate the structural problem. `emit_state_change()` still mutates state directly and broadcasts independently of the HTTP path, while the server keeps its own match tree in `handle_command()` (`src-tauri/crates/server/src/lib.rs:645`). That means command side effects can still drift across:

- state mutation
- SSE broadcast
- Tauri event emission
- message stats updates
- playback timers

Correctness risk: medium-high. This is the main remaining source of "works from one client, drifts from another".

Recommended follow-up: `tasks/task-03-unify-command-mutation-path.md`.

### P1: `AppStateSync::get_state()` is not an atomic snapshot

`get_state()` in `src-tauri/crates/state/src/lib.rs:314` reads many independent mutexes one after another. The resulting `BroadcastState` can represent mixed-time state, for example:

- new `playback_control` with old `triggered_message`
- new `messages` with old `message_tree`
- new preset selection with old active visualization

There is also no `stateVersion` or equivalent monotonic ordering metadata in the payload. Clients therefore cannot reject stale or reordered state safely.

Correctness risk: high under rapid command sequences, queue transitions, or mixed SSE/Tauri delivery.

Recommended follow-up: `tasks/task-04-state-snapshot-atomicity-and-versioning.md`.

### P1: Channel ownership and ordering are still implicit

The current worktree improves remote responsiveness, but the event contract is still only partially codified:

- `useAppState()` eagerly patches preset changes from SSE `command` events before the next full state (`src/hooks/useAppState.ts:541`)
- Control Plane still keeps a local `playbackControlOverride` derived from Tauri events (`src/components/ControlPlane.tsx:232`)
- Visualizer still combines Tauri events, SSE state, and local fallback behavior

That architecture works, but it still allows stale local overrides to outlive canonical state because no shared sequence/version boundary exists. In practice, the system is still relying on timing rather than an explicit ordering contract.

Correctness risk: medium-high.

Recommended follow-up: `tasks/task-05-event-ordering-and-channel-contracts.md`.

### P2: Port discovery is better, but hard-coded `8080` assumptions remain

This review pass fixed one real correctness issue: router actions now resolve the active backend port dynamically (`src/router.tsx:13`).

The broader codebase still has mixed assumptions:

- Control Plane bootstraps with `http://localhost:8080` before IPC resolves (`src/components/ControlPlane.tsx:39`)
- Visualizer bootstraps with `http://127.0.0.1:8080` and falls back to that in readiness checks (`src/components/VisualizerWindow.tsx:317`, `src/components/VisualizerWindow.tsx:391`)
- some tests and plugin paths still assume `8080`

This is no longer just a theoretical issue because the server intentionally binds a free port in a range. The router fix closes one important hole, but the remaining hard-coded defaults should still be treated as correctness debt.

### P2: Phone remote startup is mostly a hydration path problem, not the desktop `store` chunk

The important distinction from the build is:

- phone remote first-load assets: `285.46 KiB raw / 83.95 KiB gzip`
- desktop-heavy `store` chunk: `1.70 MiB raw / 465.10 KiB gzip`

The phone does not currently pay the `store` chunk on first load. The current worktree also improves the remote path materially:

- the remote no longer depends on `RouterProvider` / `useFetcher` (`src/App.tsx:65`, `src/components/RemoteControl.tsx:195`)
- browser remote now requests compact `/api/state` and compact SSE state (`src/hooks/useAppState.ts:330`, `src/hooks/useAppState.ts:332`)
- the server now emits compact state and a lightweight `connected` event before the first full state (`src-tauri/crates/server/src/lib.rs:1284`)

The current remote critical path is:

1. `index.html` loads from Axum
2. base `index` JS and CSS load
3. `App` decides this is a remote session and lazy-loads `RemoteControl` (`src/App.tsx:17`, `src/App.tsx:65`)
4. `RemoteControl` loads `useAppState` and `iconSet`
5. `useAppState` constructs `EventSource(/api/events?...&compact=1)` immediately (`src/hooks/useAppState.ts:339`, `src/hooks/useAppState.ts:506`)
6. `useAppState` also starts bootstrap `/api/state?compact=1` retries immediately (`src/hooks/useAppState.ts:477`)
7. the server emits `connected`, then initial `state`
8. the remote exits the blocking spinner on first SSE state, bootstrap success, or the 2 second degrade threshold (`src/hooks/useAppState.ts:283`, `src/hooks/useAppState.ts:633`, `src/components/RemoteControl.tsx:211`)

That means perceived slowness on a phone can still come from:

- base bundle parse/execute
- duplicate initial transport work (`EventSource` plus bootstrap fetch)
- lack of strong asset caching/compression policy
- icon chunk cost before first interactive render
- hot-path logging during startup

### P2: Static asset serving is still under-optimized for repeat phone loads

The server serves hashed assets via `ServeDir` (`src-tauri/crates/server/src/lib.rs:380`), but there is no explicit immutable cache policy for `/assets`, and there is no compression layer configured in the router.

Implications:

- repeat phone visits may not get a strong cache contract for hashed files
- transfer size likely stays closer to raw bytes than the gzip numbers reported by the bundle script
- the current phone startup still depends heavily on LAN conditions and device CPU

The HTML response correctly disables caching (`src-tauri/crates/server/src/lib.rs:607`), but the asset path still needs an explicit performance policy.

### P2: Logging overhead is still significant on hot paths

The current worktree added useful remote timing instrumentation in `useAppState()` (`src/hooks/useAppState.ts:267`), but the app still logs aggressively in production paths:

- repeated connection/state logs in `useAppState()` (`src/hooks/useAppState.ts:340`, `src/hooks/useAppState.ts:503`, `src/hooks/useAppState.ts:518`, `src/hooks/useAppState.ts:619`)
- Control Plane render/sync logs (`src/components/ControlPlane.tsx:36`, `src/components/ControlPlane.tsx:58`, `src/components/ControlPlane.tsx:118`, `src/components/ControlPlane.tsx:237`)
- Visualizer logs in render and sync loops (`src/components/VisualizerWindow.tsx:502`, `src/components/VisualizerWindow.tsx:746`, `src/components/VisualizerWindow.tsx:849`, `src/components/VisualizerWindow.tsx:1157`)

On desktop this is mostly noise. On mobile Safari and lower-end phones it adds avoidable work exactly where the app is trying to become interactive.

### P3: The remote still pays for a large icon catalog up front

The bundle report shows the remote path loading an `iconSet` chunk of `21.95 KiB raw / 7.58 KiB gzip`.

`src/utils/iconSet.tsx` imports a broad Lucide catalog for both desktop editing flows and remote rendering. The phone remote only needs:

- a few fixed UI icons
- whatever preset icon names are actually present

This is not the main startup bottleneck, but it is clean, removable first-load weight.

### P3: Desktop bundle size remains a separate performance problem

`store` is still `1.70 MiB raw / 465.10 KiB gzip`. That is a desktop concern, not the phone bottleneck, but it still affects:

- Control Plane startup
- long-term maintainability of the editing surface
- any Tauri webview reload/recovery path

The current review should not misattribute this to the phone remote, but it should remain on the performance roadmap.

## Testing assessment

### What improved in this pass

The frontend suite was previously stale around the browser/Tauri contract. This pass repaired that regression net:

- tests now model compact browser SSE/state versus full Tauri SSE/state
- router action now has explicit dynamic-port tests
- remote startup now has coverage for:
  - degraded startup after 2 seconds with no state
  - bootstrap hydration
  - transition from degraded to live
  - optimistic preset selection while waiting for SSE confirmation
- server tests now cover truthy compact flags and compact-state payload reduction

Net effect: the frontend suite is now much more trustworthy for the paths that were actively drifting.

### What is still missing

The test net is still not strong enough for the system-level risks identified above:

1. No integration test proves Axum and Tauri mutation paths are behaviorally identical.
2. No test rejects stale state/event ordering because version metadata does not exist yet.
3. No end-to-end test traces the phone remote startup timeline on a real browser.
4. No synthetic burst test measures SSE lag/backpressure under repeated commands.
5. No test covers asset cache headers or compression behavior for remote cold/warm loads.
6. `cargo clippy --workspace --all-targets -- -D warnings` is not currently green, so the Rust quality gate is incomplete.

## Remediation plan

### Phase 1: correctness debt with the highest blast radius

1. Unify all command mutation into one backend command processor.
2. Add monotonic `stateVersion` to every canonical state payload.
3. Define channel ownership explicitly:
   - Control Plane + Remote: SSE state authoritative
   - Visualizer: Tauri playback events authoritative for the hot path, SSE only as recovery

Primary task files:

- `tasks/task-03-unify-command-mutation-path.md`
- `tasks/task-04-state-snapshot-atomicity-and-versioning.md`
- `tasks/task-05-event-ordering-and-channel-contracts.md`

### Phase 2: phone remote startup and SSE efficiency

1. Keep compact state mode for browser clients and extend the instrumentation added here.
2. Add explicit immutable cache headers for hashed `/assets/*`.
3. Add response compression for static assets only; do not regress SSE flushing.
4. Trim or lazily resolve icon rendering for the remote path.
5. Gate startup metrics and debug logs behind debug/dev flags.

Primary task file:

- `tasks/task-06-sse-performance-and-payload-optimization.md`

### Phase 3: stronger test and perf validation

1. Add parity tests that run the same command through Axum and Tauri and compare final state/events.
2. Add stale-event regression tests once `stateVersion` exists.
3. Add a remote startup trace script that records:
   - HTML loaded
   - base bundle complete
   - `RemoteControl` mounted
   - SSE constructed
   - SSE open
   - first state event
   - bootstrap success
   - first usable controls
4. Add a burst benchmark for back-to-back command broadcasts and lag/drop observation.

## Immediate improvements already present in this worktree

The current worktree is better than the baseline that prompted this review:

1. Remote playback start/stop now goes through the unified HTTP command path and updates playback state for all views.
2. Remote no longer requires router/fetcher infrastructure on first load.
3. Browser remote now uses compact `/api/state` and compact SSE payloads.
4. The server now emits an immediate lightweight SSE event before the first state payload.
5. Router command submission now resolves the actual bound backend port instead of assuming `8080`.
6. The test suite now covers several browser-vs-Tauri contract differences that were previously untested.

## Notes

- Security was intentionally not the focus of this review, although the `tasks/` backlog currently also contains security hardening follow-ups.
- The remaining `clippy` failures are pre-existing and should be addressed separately before treating the Rust quality gate as fully clean.
