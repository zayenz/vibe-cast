# Visualizer

A high-performance, multi-window macOS application built with **Tauri v2** and **React**. Designed for immersive visualizations on secondary displays (like Apple TV via AirPlay) with remote control capabilities from an iPhone.

## 🚀 Features

- **Dual Window Setup**:
  - **Control Plane**: A management interface for the main monitor.
  - **Visualizer**: A dedicated, borderless window for the secondary display.
- **Immersive Visualizations**:
  - **Fireplace**: A calm, procedurally animated fireplace.
  - **Techno**: A dynamic, audio-reactive 3D environment built with React Three Fiber.
- **Audio Reactivity**: Real-time FFT analysis of system audio (e.g., Spotify) using Rust.
- **iPhone Remote**: A web-based remote control served over the LAN, accessible via QR code.
- **Rolling Messages**: Overlay smooth, marquee-style text messages on top of visualizations.

## 🏗️ Architecture

The application follows a distributed architecture combining a native Rust core with a React-based frontend.

### System Diagram

```mermaid
graph TD
    subgraph "macOS App (Tauri)"
        Rust[Rust Backend]
        CP[Control Plane Window]
        VW[Visualizer Window]
        Axum[Axum LAN Server]
    end
    
    subgraph "Local Network"
        iPhone[iPhone Browser]
    end

    subgraph "Audio System"
        Spotify[Spotify / System Audio]
        Loopback[Virtual Audio Device]
    end

    Loopback -->|"cpal"| Rust
    Rust -->|"FFT Data"| VW
    iPhone -->|"Commands"| Axum
    Axum -->|"Events"| Rust
    CP -->|"Invoke"| Rust
    Rust -->|"State Sync"| CP
    Rust -->|"State Sync"| VW
```

### Backend (Rust)
- **Window Management**: Orchestrates multiple windows and ensures the Visualizer window is optimized for secondary displays.
- **Audio Engine**: Uses `cpal` to capture audio from a loopback device and `realfft` to provide frequency data to the frontend at 60fps.
- **LAN Server**: An integrated `axum` server that serves the mobile remote UI to devices on the same Wi-Fi network.
- **State Synchronization**: Maintains shared application state (`AppStateSync`) for mode and messages, exposed via REST API for the mobile remote.

### Frontend (React)
- **Zustand Store**: Per-window state management synchronized via Tauri events for mode switching, message queues, and audio data.
- **React Three Fiber**: Powers the high-performance 3D techno visualizations.
- **Framer Motion**: Handles the smooth rolling message animations.

## 🛠️ Tech Stack

- **Framework**: Tauri v2
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **3D/Animation**: React Three Fiber, Three.js, Framer Motion
- **Backend**: Rust (cpal, axum, tokio, realfft)
- **State**: Zustand

## 🚦 Getting Started

### Prerequisites
1.  **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
2.  **Node.js**: [Install Node.js](https://nodejs.org/)
3.  **Audio Loopback (macOS)**: To capture system audio (like Spotify), you need a virtual audio device.
    -   Recommended: [BlackHole](https://github.com/ExistentialAudio/BlackHole)
    -   Setup: Create a "Multi-Output Device" in Audio MIDI Setup that includes your speakers/AirPlay and BlackHole.

### Installation
```bash
# Clone the repository
# ...

# Install dependencies
npm install
```

### Development
```bash
# Start the app in development mode
npm run tauri dev
```

### Building for Production
```bash
# Build the production bundle
npm run tauri build
```

## 📱 Usage
1.  Launch the app on your Mac.
2.  If using AirPlay, move the **Visualizer** window to your secondary display.
3.  Scan the QR code displayed in the **Control Plane** using your iPhone.
4.  Use the remote to toggle between **Fireplace** and **Techno** modes, or trigger scrolling messages.
