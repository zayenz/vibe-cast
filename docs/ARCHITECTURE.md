# Vibe Cast Architecture

This document is the authoritative, LLM-friendly map of how Vibe Cast works today. It is organized for progressive disclosure: start at the top, then dive only as needed.

## 1) TL;DR (Read This First)

- **Single source of truth**: Rust `AppStateSync` in `src-tauri/crates/state`.
- **Sync channel**: SSE (`/api/events`) for Control Plane + Mobile Remote.
- **Sync channel**: Tauri events for Visualizer + high-frequency audio (`audio-data`).
- **All state mutations** go through server handlers or Tauri commands, then **broadcast** to SSE and Tauri.
- **LAN server** binds `8080..8100`; use `get_server_info` to discover the active port + LAN IP.

If you only read one rule: never "fix" a UI state bug by mutating client state directly; make the Rust state correct and broadcast.

## 2) Runtime Topology

```
                          ┌──────────────────────────────────────┐
                          │          Rust Backend                │
                          │  AppStateSync + Axum Server          │
                          │  /api/command + /api/events (SSE)    │
                          └──────────────────────────────────────┘
                             ▲            ▲              ▲
                             │            │              │
                             │            │              │
                   SSE (state/command)    │     Tauri events + audio
                             │            │              │
                             │            │              │
                ┌────────────┘            │              └────────────┐
                │                         │                           │
        ┌───────────────┐         ┌───────────────┐           ┌────────────────┐
        │ Control Plane │         │ Mobile Remote │           │ Visualizer     │
        │ (Tauri main)  │         │ (Browser)     │           │ (Tauri viz)    │
        └───────────────┘         └───────────────┘           └────────────────┘
```

## 3) State Ownership and Broadcast

Authoritative state lives in `AppStateSync`.

Key locations:
- `src-tauri/crates/state/src/lib.rs` (state + mutation helpers)
- `src-tauri/crates/models/src/lib.rs` (`BroadcastState` SSE payload)
- `state_tx` and `command_tx` are broadcast channels for full state and transient commands

Key mechanics:
- Any mutation updates `AppStateSync` then calls `broadcast(...)`.
- `broadcast(...)` sends **full state**; clients can replace local state on each event.
- `broadcast_command(...)` sends transient commands (used by some workflows like E2E).

## 4) Server API

Implemented in `src-tauri/crates/server/src/lib.rs`.

SSE endpoint: `GET /api/events`. It emits `state` (full `BroadcastState`) and `command` (transient `RemoteCommand`).

Commands endpoint: `POST /api/command` with payload `{ command, payload, deviceType }`.

Other endpoints:
- `GET /api/status` (health)
- `GET /api/state` (legacy, full state)
- `GET /api/images/list?folder=...` (Photo Slideshow)
- `GET /api/images/serve?path=...` (Photo Slideshow)
- `POST /api/e2e/report` and `GET /api/e2e/last-report`

Port binding: server tries `8080..8100` and stores the chosen port in `server_port`.

## 5) Desktop Window Roles

Window selection happens in `src/App.tsx`.

- **Control Plane**: Tauri window label `main` (default)
- **Visualizer**: Tauri window label `viz`
- **Remote**: any non-Tauri browser load

### Control Plane

- Uses `useAppState` (SSE) as the canonical state.
- Uses `useSendCommand` / `useFetcher` to call `/api/command`.
- Listens to `playback-control-changed` Tauri events for fast UI feedback.

### Visualizer

- Listens to Tauri events: `audio-data` (FFT), `state-changed`, `playback-control-changed`.
- Also subscribes to SSE as a fallback for initial configuration.

### Mobile Remote

- Runs in browser; SSE only (`useAppState` with `apiBase = ''`).
- Mutations go through `/api/command` with `deviceType = mobile_remote`.

## 6) Audio Pipeline

Location: `src-tauri/crates/audio/src/lib.rs`.

- Uses `cpal` for capture and `realfft` for FFT.
- Emits `audio-data` Tauri events with magnitudes.
- Keeps stream alive with `mem::forget`.

Important: audio never goes over SSE.

## 7) Configuration Loading

Optional config file is loaded at startup.

- CLI arg: `--app-config <path>` (or `--appconfig`)
- Env var: `VIBECAST_CONFIG=/path/to/config.json`
- Relative paths inside config are resolved against the config file directory

## 8) Plugin Architecture

Visualizations and text styles are plugins with schemas and defaults.

Locations:
- Visualizations: `src/plugins/visualizations/*` and `src/plugins/visualizations/registry.ts`
- Text styles: `src/plugins/textStyles/*` and `src/plugins/textStyles/registry.ts`

To add a plugin: implement a plugin module, export settings schema, register in the registry.

## 9) Common Change Tasks (Minimal Map)

- **Add/modify API command**: `src-tauri/crates/server/src/lib.rs` + `src-tauri/crates/state/src/lib.rs`
- **Fix state sync bugs**: start in `src-tauri/crates/state` and `src/hooks/useAppState.ts`
- **Visualizer render issues**: `src/components/VisualizerWindow.tsx`
- **Control Plane UI**: `src/components/ControlPlane.tsx`
- **Remote UI**: `src/components/RemoteControl.tsx`
- **Playback sync**: `docs/MESSAGE_PLAYBACK_SYNC.md`

## 10) Testing

- Frontend: `npm test` (Vitest run), `npm run lint`
- Rust: `cd src-tauri && cargo test` / `cargo clippy` (if needed)
- E2E: `node scripts/e2e_flow_test.mjs`
