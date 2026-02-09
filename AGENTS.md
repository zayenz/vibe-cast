# Agent Instructions (Short)

Vibe Cast is a dual-window Tauri v2 + React app: Control Plane (main window), Visualizer (borderless secondary), and a Mobile Remote served over LAN. Rust is the single source of truth for state; clients sync via SSE and Tauri events.

## Key Features

- Dual-window experience: Control Plane + Visualizer
- Mobile Remote via LAN server (Axum, SSE)
- Audio-reactive visuals (cpal + FFT)
- Plugin-based visualizations and text styles

## Architecture Snapshot

- **State**: `src-tauri/crates/state` (`AppStateSync`) is authoritative
- **Sync**: SSE `/api/events` for Control Plane + Remote, Tauri events for Visualizer + audio (`audio-data`)
- **Server**: `src-tauri/crates/server` (Axum, binds `8080..8100`)
- **Frontend**: `src/components` and `src/hooks/useAppState.ts`
- **Plugins**: `src/plugins/visualizations` and `src/plugins/textStyles`

## Dev Commands

- Dev: `npm run tauri dev`
- Build: `npm run tauri build`
- Test (frontend): `npm test`
- Lint (frontend): `npm run lint`

## Issue Tracking (bd)

- Start: `bd onboard`
- Find work: `bd ready`
- Claim: `bd update <id> --status in_progress`
- Close: `bd close <id>`
- Sync: `bd sync`

## Session End (Required)

1. File issues for follow-up
2. Run quality gates if code changed
3. Update bd status and close finished work
4. Clean up stashes / prune branches
5. Commit + `git push`
6. Hand off context for next session
