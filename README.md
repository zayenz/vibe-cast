# Vibe Cast

<div align="center">
  <img src="docs/assets/vibe-cast-icon.png" alt="Vibe Cast Icon" width="200"/>
</div>

**Vibe Cast** is an application designed for a visualization monitor at a party.
The main idea is to have a dual-screen set-up, with a control pane on a laptop
and a fullscreen visualizer window on a secondary large display (e.g., a TV via AirPlay). 
The visualizer can show (audio-reactive) visualizations, the control pane controls which visualization to show, and set up an trigger messages to display. 
There is also a remote control web page available on the local network that can be used for switching visualizations and triggering messages form a phone.

> [!WARNING] 
> This application has been vibe-coded and developed 
> for a single use-case, it is not meant for general usage 
> nor has it been extensively tested or audited. 
> It has only been used on a Mac.
> It may have a lot of bugs, it has very little
> documentation and may crash in the middle of yur usage.
> You have been warned!


## 🚀 Features

- **Dual Window Experience**:
  - **Control Plane**: Manage everything from your Mac.
  - **Visualizer**: Borderless, full-screen visuals for your TV/Monitor.
- **Remote Control**: Scan a QR code to control the app from your iPhone (no app install needed).
- **Audio Reactive**: Visuals dance to your system audio (using a loopback audio device).
- **Visualizations**:
  - **Fireplace**: Cozy, procedural flames and embers.
  - **Techno**: 3D geometric audio visualization.
  - **Waves**: Calming ocean patterns.
  - **Particles**: Dynamic particle systems.
  - **YouTube**: Loop videos (great for ambiance loops). [Docs](docs/YOUTUBE_PLUGIN.md)
  - **Photo Slideshow**: Stream local photos or albums. [Docs](docs/PHOTO_SLIDESHOW_PLUGIN.md)
- **Message Marquee**:
  - Send messages to the screen.
  - Styles: Scrolling Capitals, Fade, Typewriter, Bounce, Credits.
  - Queue management and presets.
  - [Load long messages from file](docs/FILE_LOADING.md)

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

- [Installation Guide](INSTALLATION.md)
- [Release Process](docs/RELEASE.md)
- [Architecture & Development](docs/ARCHITECTURE.md)
- [Changelog](docs/CHANGELOG.md)

## 🛠️ Built With

This application has been vibe coded using Cursos and Gemini CLI. 
A plethora of models have been used, most of the models available in Cursor and Gemini CLI have been tested.

The technical stack uses
-   **Core**: Tauri v2 (Rust)
-   **Frontend**: React, TypeScript, Tailwind CSS
-   **Graphics**: React Three Fiber, Three.js, Framer Motion
