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

### Current Implementation Issues
- **Isolated State**: Each window (Control Plane and Visualizer) runs in its own webview context with its own Zustand store. Currently, state changes in one window are not reflected in the other.
- **Visualizer Blank**: Because state isn't synced, the Visualizer window defaults to its initial state and doesn't respond to Control Plane interactions.

### Planned Improvements
1.  **State Synchronization**:
    -   Implement a "Single Source of Truth" strategy using Tauri events.
    -   The Control Plane will emit events (e.g., `state-changed`) which the Visualizer window and backend will listen to.
    -   The Zustand store will be updated in response to these events to ensure all windows stay in sync.
2.  **Tailwind 4 Integration**:
    -   Migrate to Tailwind 4 for more robust styling and modern UI components.
    -   Leverage Tailwind 4's CSS-first approach for better performance and easier customization.
3.  **Visualization Enhancements**:
    -   Refactor `Fireplace` to use a consistent animation loop for smoother flickering.
    -   Optimize `TechnoViz` for lower latency audio reactivity.

## Tech Stack
- **Framework**: Tauri v2
- **Frontend**: React 19, Vite 7, Tailwind 4 (Planned), Zustand
- **3D/Animation**: React Three Fiber, Three.js, Framer Motion
- **Backend**: Rust, Axum, Tokio, Cpal, RealFFT
