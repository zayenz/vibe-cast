# Visualizer Architecture

This document describes the system architecture of the Visualizer application, a multi-window macOS app built with Tauri v2 and React.

## System Overview

Visualizer is designed to provide immersive visualizations on secondary displays (e.g., Apple TV via AirPlay) while being controlled from a primary monitor or a mobile device.

### Components

1.  **Tauri Core (Rust Backend)**:
    -   **Window Management**: Manages two primary windows: `main` (Control Plane) and `viz` (Visualizer Stage).
    -   **Audio Engine**: Captures system audio via `cpal`, performs FFT using `realfft`, and broadcasts frequency data to the frontend.
    -   **LAN Server (Axum)**: Serves a mobile-optimized remote control interface over the local network.
    -   **Event Bridge**: Facilitates communication between the backend, the mobile remote, and the local windows via Tauri events.

2.  **Control Plane (React Window)**:
    -   The primary management interface.
    -   Displays a QR code for mobile remote access.
    -   Controls the visualization mode (`fireplace` vs `techno`).
    -   Triggers marquee messages on the visualizer window.

3.  **Visualizer Stage (React Window)**:
    -   A dedicated, borderless window designed for full-screen display.
    -   Renders high-performance visualizations using React Three Fiber (Techno) and CSS/SVG (Fireplace).
    -   Displays rolling marquee messages.

4.  **Mobile Remote (React Web App)**:
    -   Served by the Axum backend.
    -   Allows remote control of the app's functionality from a smartphone browser.

## Communication & State Management

### State Synchronization

Each window (Control Plane and Visualizer) runs in its own webview context with its own Zustand store. State is synchronized using a hybrid event-based architecture:

1.  **Event-Based Sync (Tauri Windows)**:
    -   State changes (mode, messages) are broadcast via Tauri's `emit` API using `state-changed` events.
    -   Both Control Plane and Visualizer windows listen for these events and update their local Zustand stores accordingly.
    -   The `sync` parameter on store actions (`setMode`, `setMessages`, `triggerMessage`) controls whether to emit events, preventing infinite loops.

2.  **API-Based Sync (Mobile Remote)**:
    -   The Rust backend maintains an `AppStateSync` struct that mirrors the current application state.
    -   The mobile remote fetches initial state via `GET /api/state` on load.
    -   Commands from the remote are sent via `POST /api/command` and broadcast as `remote-command` events.

3.  **Audio Data Flow**:
    -   Audio is captured via `cpal` and processed with `realfft` in Rust.
    -   FFT data is emitted as `audio-data` events to the Visualizer window only.

### Event Types

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `state-changed` | Backend → All Windows | `{ type, payload }` | Sync mode/messages |
| `remote-command` | Backend → All Windows | `{ command, payload }` | Forward remote commands |
| `audio-data` | Backend → Visualizer | `number[]` | FFT frequency data |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/state` | GET | Get current mode and messages |
| `/api/command` | POST | Send command from remote |
| `/api/status` | GET | Health check |

## Tech Stack

- **Framework**: Tauri v2
- **Frontend**: React 19, Vite 7, Tailwind 4, Zustand
- **3D/Animation**: React Three Fiber, Three.js, Framer Motion
- **Backend**: Rust, Axum, Tokio, Cpal, RealFFT

## Performance Considerations

- **Stable Animation Values**: The Fireplace component uses `useMemo` to compute random animation offsets once per component instance, avoiding re-computation on every render cycle.
- **Audio Stream Lifecycle**: The audio capture stream uses `mem::forget` to keep it alive for the app's lifetime. This is intentional - cpal's `Stream` type is not `Send+Sync`, so it cannot be stored in Tauri's managed state. The stream runs indefinitely and is cleaned up when the process exits.
- **Event Throttling**: Consider implementing throttling for high-frequency audio data events if performance issues occur on lower-end hardware.
