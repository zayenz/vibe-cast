# Vibe Cast

<div align="center">
  <img src="docs/assets/vibe-cast-icon.png" alt="Vibe Cast Icon" width="200"/>
</div>

**Vibe Cast** is a dual-window Tauri app for running audio-reactive visuals on a second display while controlling everything from a laptop (plus a LAN remote for phones).

## TL;DR

- **Windows**: Control Plane (main window) + Visualizer (borderless secondary window) + Mobile Remote (browser).
- **Single source of truth**: Rust backend state in `src-tauri/crates/state`.
- **Sync**: SSE (`/api/events`) for Control Plane + Remote, Tauri events for Visualizer + audio (`audio-data`).
- **LAN server**: Axum binds `8080..8100`; Remote lives at `http://<lan-ip>:<port>/`.
- **Optional config**: Start with `--app-config <path>` or `VIBECAST_CONFIG=/path/to/config.json`.

## Quick Start (Dev)

Prereqs:
- Node.js 18+
- Rust (stable)
- Tauri prerequisites for your OS
- Loopback audio device for system audio (macOS: BlackHole; Windows: VB-CABLE)

Commands:
```bash
npm install
npm run tauri dev
```

Build:
```bash
npm run tauri build
```

## How It Works (1 minute)

- Rust starts an Axum server and owns **all app state** (`AppStateSync`).
- Control Plane and Mobile Remote subscribe to **SSE** (`/api/events`) for real-time state.
- Visualizer receives **Tauri events** for state + high-frequency audio data (`audio-data`).
- All mutations go through `/api/command` (HTTP) or Tauri commands, which then broadcast to SSE + Tauri.

## Visualizations

Registered in `src/plugins/visualizations/registry.ts`:
- Fireplace
- Techno
- Waves
- Particles
- Mushrooms
- YouTube
- Photo Slideshow
- Transition Demo

## Message Text Styles

Registered in `src/plugins/textStyles/registry.ts`:
- Scrolling Capitals
- Fade
- Typewriter
- Bounce
- Dot Matrix
- Credits

## Audio Loopback Setup

macOS (recommended):
- Install BlackHole 2ch
- Create a Multi-Output Device (speakers + BlackHole)
- Set System Output to the Multi-Output Device
- Set System Input to BlackHole

Windows (recommended):
- Install VB-CABLE
- Set output to CABLE Input
- Enable "Listen to this device" on CABLE Output
- Set System Input to CABLE Output

## Project Map (LLM-Friendly)

- `src-tauri/crates/app`: Tauri entry point, window creation, Tauri commands, event emits
- `src-tauri/crates/server`: Axum HTTP + SSE server, `/api/*` endpoints
- `src-tauri/crates/state`: **AppStateSync** and state mutation logic
- `src-tauri/crates/audio`: CPAL capture + FFT, emits `audio-data`
- `src-tauri/crates/models`: Shared structs for SSE and commands
- `src/components`: Control Plane, Visualizer, Remote UI
- `src/hooks/useAppState.ts`: SSE client + state parsing
- `src/plugins/visualizations`: Visualization plugins
- `src/plugins/textStyles`: Message text style plugins

## Docs

- `docs/ARCHITECTURE.md`
- `docs/MESSAGE_PLAYBACK_SYNC.md`
- `docs/PHOTO_SLIDESHOW_PLUGIN.md`
- `docs/YOUTUBE_PLUGIN.md`
- `docs/FILE_LOADING.md`
- `docs/RELEASE.md`
