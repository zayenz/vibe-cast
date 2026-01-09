# Visualizer Architecture

This document describes the system architecture of the Visualizer application, a multi-window macOS app built with Tauri v2 and React.

## System Overview

Visualizer is designed to provide immersive visualizations on secondary displays (e.g., Apple TV via AirPlay) while being controlled from a primary monitor or a mobile device.

### Components

1.  **Tauri Core (Rust Backend - Cargo Workspace)**:
    -   **`vibe-cast-app` (`src-tauri/crates/app`)**: Main Tauri application glue code, window management, and command handlers.
    -   **`vibe-cast-audio` (`src-tauri/crates/audio`)**: Captures system audio via `cpal`, performs FFT processing, and manages audio state.
    -   **`vibe-cast-server` (`src-tauri/crates/server`)**: Implements the Axum LAN server for remote control and SSE state broadcasting.
    -   **`vibe-cast-state` (`src-tauri/crates/state`)**: Contains shared application state logic (`AppStateSync`) and synchronization primitives.
    -   **`vibe-cast-models` (`src-tauri/crates/models`)**: Defines shared data structures and configuration types (`MessageConfig`, `BroadcastState`, etc.).

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
- **Stable Animation Values**: Visualization components use `useMemo` to compute random animation offsets once per component instance.
- **Audio Stream Lifecycle**: The audio capture stream uses `mem::forget` to keep it alive for the app's lifetime.
- **Broadcast Channel Buffer**: The SSE broadcast channel has a buffer of 64 messages; slow clients may miss updates (which is acceptable since the next update contains full state).
- **Visualizer on Tauri Events**: The Visualizer window uses Tauri IPC instead of SSE for audio data to handle 60fps updates efficiently.
- **Multiple Message Rendering**: Messages are rendered independently, allowing efficient coexistence of different text styles.

## Development

### Linting and Code Quality

The project uses modern linting tools to ensure code quality:

- **TypeScript**: ESLint with TypeScript plugin for strict type checking
- **Rust**: Clippy with `-D warnings` for all code
- **Run linting**: `npm run lint` (TypeScript) and `cargo clippy` (Rust)

### Adding New Visualizations

1. Create a new plugin file in `src/plugins/visualizations/`
2. Define a settings schema using `SettingDefinition[]`
3. Export a `VisualizationPlugin` object
4. Register in `src/plugins/visualizations/registry.ts`

### Adding New Text Styles

1. Create a new plugin file in `src/plugins/textStyles/`
2. Define a settings schema using `SettingDefinition[]`
3. Export a `TextStylePlugin` object
4. Register in `src/plugins/textStyles/registry.ts`

## E2E Testing Architecture

The application supports a "Loopback Telemetry" pattern for end-to-end testing without requiring browser automation tools (like Selenium).

### Loopback Telemetry Flow

1.  **Test Runner**: A Node.js script (`scripts/e2e_flow_test.mjs`) launches the app binary and connects to the backend API (`http://localhost:8080`).
2.  **Command Dispatch**: The runner sends a `report-status` command via `POST /api/command`.
3.  **Broadcasting**: The backend broadcasts this command to all connected clients (including the Visualizer window) via SSE (`command` event).
    *   *Note*: This bypasses Tauri IPC restrictions for windows loaded from external URLs (localhost).
4.  **Telemetry Collection**: The Visualizer window receives the command, gathers its internal state (active visualization, message count, etc.), and POSTs it to `POST /api/e2e/report`.
5.  **Verification**: The backend stores the last report. The test runner polls `GET /api/e2e/last-report` to verify the visualizer state matches expectations.

### API Endpoints for Testing

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/e2e/report` | POST | Used by frontend to submit status reports |
| `/api/e2e/last-report` | GET | Used by test runner to fetch the latest report |