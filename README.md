# Vibe Cast

<div align="center">
  <img src="docs/assets/vibe-cast-icon.png" alt="Vibe Cast Icon" width="200"/>
</div>

**Vibe Cast** is a visualizer application designed for dual-screen setups. It runs a control panel on your main display (e.g., MacBook) and a fullscreen visualizer on a secondary display (e.g., TV via AirPlay), allowing you to control visuals and messages from your phone.

It features immersive, audio-reactive visualizations (Fireplace, Techno, Waves) and a scrolling message marquee, perfect for parties, events, or chill vibes.

> [!NOTE]
> This application is built with Tauri v2 and React. It is a hobby project and may have bugs or stability issues.

## 🚀 Features

- **Dual Window Experience**:
  - **Control Plane**: Manage everything from your Mac.
  - **Visualizer**: Borderless, full-screen visuals for your TV/Monitor.
- **Remote Control**: Scan a QR code to control the app from your iPhone (no app install needed).
- **Audio Reactive**: Visuals dance to your system audio (Spotify, Apple Music, etc.).
- **Visualizations**:
  - **Fireplace**: Cozy, procedural flames and embers.
  - **Techno**: 3D geometric audio visualization.
  - **Waves**: Calming ocean patterns.
  - **Particles**: Dynamic particle systems.
  - **YouTube**: Loop videos (great for ambiance loops). [Docs](docs/YOUTUBE_PLUGIN.md)
  - **Photo Slideshow**: Stream local photos or albums. [Docs](docs/PHOTO_SLIDESHOW_PLUGIN.md)
- **Message Marquee**:
  - Send scrolling messages to the screen.
  - Styles: Scrolling Capitals, Fade, Typewriter, Bounce, Credits.
  - Queue management and presets.
  - [File Loading Docs](docs/FILE_LOADING.md)

## 🚦 Quick Start

### Prerequisites
-   **macOS** (Primary platform)
-   **Rust** & **Node.js** installed.
-   **Audio Loopback**: To capture system audio, use [BlackHole](https://github.com/ExistentialAudio/BlackHole) (2ch) and set up a Multi-Output Device in Audio MIDI Setup.

### Run It
```bash
npm install
npm run tauri dev
```

1.  Move the **Visualizer** window to your secondary display.
2.  Scan the QR code on the **Control Plane** with your phone.
3.  Play some music and enjoy!

## 📚 Documentation

- [Release Process](docs/RELEASE.md)
- [Architecture & Development](docs/ARCHITECTURE.md)
- [Changelog](docs/CHANGELOG.md)

## 🛠️ Built With

-   **Core**: Tauri v2 (Rust)
-   **Frontend**: React, TypeScript, Tailwind CSS
-   **Graphics**: React Three Fiber, Three.js, Framer Motion