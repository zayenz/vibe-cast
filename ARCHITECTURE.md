# Visualizer Architecture

This document describes the system architecture of the Visualizer application, a multi-window macOS app built with Tauri v2 and React.

## System Overview

Visualizer is designed to provide immersive visualizations on secondary displays (e.g., Apple TV via AirPlay) while being controlled from a primary monitor or a mobile device.

### Components

1.  **Tauri Core (Rust Backend)**:
    -   **Window Management**: Manages two primary windows: `main` (Control Plane) and `viz` (Visualizer Stage).
    -   **Audio Engine**: Captures system audio via `cpal`, performs FFT using `realfft`, and broadcasts frequency data to the frontend.
    -   **LAN Server (Axum)**: Serves a mobile-optimized remote control interface over the local network with SSE for real-time updates.
    -   **State Broadcast**: Maintains canonical application state and broadcasts changes via both SSE (for HTTP clients) and Tauri events (for the Visualizer window).

2.  **Control Plane (React Window)**:
    -   The primary management interface.
    -   Displays a QR code for mobile remote access.
    -   Controls the visualization mode (`fireplace` vs `techno`).
    -   Triggers marquee messages on the visualizer window.
    -   Uses SSE for state synchronization and React Router's `useFetcher` for mutations.

3.  **Visualizer Stage (React Window)**:
    -   A dedicated, borderless window designed for full-screen display.
    -   Renders high-performance visualizations using React Three Fiber (Techno) and CSS/SVG (Fireplace).
    -   Displays rolling marquee messages.
    -   Uses Tauri events for both audio data (60fps) and state changes (for maximum performance).

4.  **Mobile Remote (React Web App)**:
    -   Served by the Axum backend.
    -   Allows remote control of the app's functionality from a smartphone browser.
    -   Uses SSE for real-time state updates (no polling) and React Router's `useFetcher` for mutations.

## Communication & State Management

### State Synchronization Architecture

The application uses a **hybrid SSE + Tauri events architecture** with the Rust backend as the single source of truth:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Axum Server (localhost:8080)                 │
│                    ══════════════════════════                   │
│                    Single Source of Truth                       │
│                                                                 │
│   POST /api/command     GET /api/events (SSE)                  │
│   (mutations)           (real-time state stream)                │
└─────────────────────────────────────────────────────────────────┘
         ▲                      │
         │ useFetcher           │ SSE
         │                      ▼
┌────────┴──────────────────────────────────────────────────────┐
│          Control Plane + Mobile Remote                         │
│          ═════════════════════════════                         │
│   useAppState() hook → SSE subscription → React state          │
│   useFetcher() → POST mutations → triggers SSE broadcast       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    Visualizer Window                           │
│                    ══════════════════                          │
│            Tauri events for audio (60fps) + state changes      │
│            (Kept on Tauri IPC for maximum performance)         │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow

1.  **SSE-Based Sync (Control Plane + Mobile Remote)**:
    -   Both components subscribe to `GET /api/events` SSE stream on mount.
    -   The stream sends initial state immediately, then pushes updates on every change.
    -   Components use the `useAppState()` hook which manages the SSE connection with automatic reconnection.
    -   Mutations use React Router's `useFetcher` to POST to `/api/command`.
    -   No polling - updates are pushed in real-time.

2.  **Tauri Event Sync (Visualizer Window)**:
    -   The Visualizer window stays on Tauri events for performance (audio data at 60fps).
    -   State changes are also broadcast via Tauri events for the Visualizer.
    -   Uses Zustand for local state management.

3.  **Audio Data Flow**:
    -   Audio is captured via `cpal` and processed with `realfft` in Rust.
    -   FFT data is emitted as `audio-data` events to the Visualizer window only.
    -   SSE is not used for audio (too high frequency for HTTP).

### SSE Broadcast Mechanism

The Rust backend uses a `tokio::sync::broadcast` channel to fan out state changes:

```rust
pub struct AppStateSync {
    pub mode: Mutex<String>,
    pub messages: Mutex<Vec<String>>,
    pub state_tx: broadcast::Sender<BroadcastState>,
}
```

When state changes (via `/api/command` or Tauri invoke):
1. The canonical state is updated
2. The new state is broadcast to all SSE subscribers
3. A Tauri event is also emitted for the Visualizer window

### Event Types

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `state-changed` | Backend → All Windows | `{ type, payload }` | Sync mode/messages (Tauri) |
| `remote-command` | Backend → All Windows | `{ command, payload }` | Forward remote commands (Tauri) |
| `audio-data` | Backend → Visualizer | `number[]` | FFT frequency data (Tauri) |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/events` | GET (SSE) | Real-time state stream |
| `/api/state` | GET | Get current mode and messages (legacy) |
| `/api/command` | POST | Send command (set-mode, trigger-message, set-messages) |
| `/api/status` | GET | Health check |

## Tech Stack

- **Framework**: Tauri v2
- **Frontend**: React 19, React Router 7, Vite 7, Tailwind 4
- **3D/Animation**: React Three Fiber, Three.js, Framer Motion
- **Backend**: Rust, Axum, Tokio, Cpal, RealFFT, tokio-stream

## Key Patterns

### useAppState Hook

The `useAppState` hook manages SSE connection lifecycle:

```typescript
const { state, isConnected, error } = useAppState({ apiBase: API_BASE });
```

- Automatically connects to SSE on mount
- Reconnects on connection errors (2s backoff)
- Returns typed state, connection status, and errors

### useFetcher for Mutations

Commands are sent using React Router's `useFetcher`:

```typescript
const fetcher = useFetcher();

// Send command
fetcher.submit(
  { command: 'set-mode', payload: JSON.stringify('techno') },
  { method: 'post', action: '/' }
);

// Check pending state
const isPending = fetcher.state !== 'idle';
```

Benefits:
- No navigation on submit
- Built-in pending state tracking
- Automatic request cancellation on unmount
- Form-based progressive enhancement possible

## Testing

### Test Utilities

- **MockEventSource**: Simulates SSE connections in tests
- **renderWithRouter**: Wraps components with a memory router for `useFetcher` support

### Running Tests

```bash
npm test        # Watch mode
npm test -- --run  # Single run
```

## Performance Considerations

- **SSE over Polling**: The mobile remote now uses SSE instead of 3-second polling, providing instant updates with lower server load.
- **Stable Animation Values**: The Fireplace component uses `useMemo` to compute random animation offsets once per component instance.
- **Audio Stream Lifecycle**: The audio capture stream uses `mem::forget` to keep it alive for the app's lifetime.
- **Broadcast Channel Buffer**: The SSE broadcast channel has a buffer of 64 messages; slow clients may miss updates (which is acceptable since the next update contains full state).
- **Visualizer on Tauri Events**: The Visualizer window uses Tauri IPC instead of SSE for audio data to handle 60fps updates efficiently.
