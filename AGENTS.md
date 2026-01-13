# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## System Overview

**Vibe Cast** is a dual-window macOS app built with **Tauri v2** and **React**.
- **Control Plane**: React window on main display.
- **Visualizer**: React window on secondary display (borderless).
- **Backend**: Rust (Tauri, Axum) handles audio capture (cpal), FFT, and state sync.
- **Mobile Remote**: React web app served by Axum (LAN).

### Core Directories
- **`src-tauri/crates/app`**: Main Rust application entry point.
- **`src-tauri/crates/audio`**: Audio capture and FFT processing.
- **`src-tauri/crates/server`**: Axum LAN server and SSE logic.
- **`src-tauri/crates/state`**: Shared application state (`AppStateSync`).
- **`src`**: React Frontend (Control Plane, Visualizer, Remote).
- **`scripts`**: E2E tests and release scripts.

## Development Workflow

### 1. Build & Run
- **Dev**: `npm run tauri dev`
- **Build**: `npm run tauri build`

### 2. Testing
- **Unit (Frontend)**: `npm test` (Vitest)
- **Unit (Backend)**: `cd src-tauri && cargo test`
- **E2E Flow**: `node scripts/e2e_flow_test.mjs` (Requires built app or running dev server)

### 3. Linting
- **Frontend**: `npm run lint` (ESLint)
- **Backend**: `cd src-tauri && cargo clippy`

### 4. Releasing
- Use the helper script: `node scripts/create_release.mjs <version>`
- Do NOT manually edit version files.

## Architecture Highlights

- **State Sync**: Hybrid SSE + Tauri Events.
    - **SSE**: Syncs state to Control Plane and Mobile Remote (`/api/events`).
    - **Tauri Events**: Syncs state and Audio Data (60fps) to Visualizer window.
    - **Single Source of Truth**: Rust backend (`AppStateSync`).
- **Visualizations**: Located in `src/plugins/visualizations/`.
    - To add new viz: Create plugin, register in `registry.ts`.
- **Audio**: System audio captured via loopback device (BlackHole).

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Clean up** - Clear stashes, prune remote branches
5. **Verify** - All changes committed AND pushed
6. **Hand off** - Provide context for next session
