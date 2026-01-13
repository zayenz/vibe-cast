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

<!-- SCREENSHOT PLACEHOLDER: Main interface showing Control Plane and Visualizer window side-by-side -->

## 📦 Installation & Usage

You can run Vibe Cast either by downloading a pre-built binary or by building it from source.

### Running Pre-built Binaries

**Note:** The binaries provided in the Releases section are **unsigned**. This means they have not been verified by Apple or Microsoft. Running them is at your own risk.

1.  Go to the [Releases](https://github.com/zayenz/vibe-cast/releases) page.
2.  Download the appropriate file for your OS (`.dmg` for macOS, `.msi` or `.exe` for Windows).

#### macOS Security
Because the app is unsigned, macOS Gatekeeper will likely prevent it from opening, reporting that the app is "damaged" or "cannot be opened".

To fix this, you must manually remove the security quarantine attribute:
1.  Open **Terminal**.
2.  Run the following command (adjust the path if you moved the app elsewhere):
    ```bash
    xattr -d com.apple.quarantine /Applications/VibeCast.app
    ```
3.  You should now be able to open the app normally.

#### Windows Security
Microsoft Defender SmartScreen may block the application. You will likely need to click "More info" and "Run anyway" to proceed.

### Running from Code

If you prefer to build it yourself or want to develop features:

#### Prerequisites
-   **Node.js** (v18 or later)
-   **Rust** (latest stable)
-   **Tauri Prerequisites** (OS-specific dependencies, see [Tauri Docs](https://tauri.app/v1/guides/getting-started/prerequisites))

#### Build Steps
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/zayenz/vibe-cast.git
    cd vibe-cast
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in development mode:**
    ```bash
    npm run tauri dev
    ```

4.  **Build for production:**
    ```bash
    npm run tauri build
    ```
    The output binary/installer will be in `src-tauri/target/release/bundle/`.

---

## 🔊 Audio Loopback Setup

To visualize audio playing on your computer, you need to route the audio output back into an input that VibeCast can listen to.

### macOS

We recommend **BlackHole** (open-source).

1.  **Install BlackHole (2ch):** [Download](https://existential.audio/blackhole/) or `brew install blackhole-2ch`.
2.  **Create a Multi-Output Device** in **Audio MIDI Setup**:
    -   Combine your speakers/headphones AND BlackHole 2ch.
    -   Enable "Drift Correction" for BlackHole.
3.  **Set System Output**: Select this Multi-Output Device in System Settings > Sound.
4.  **VibeCast Input**: VibeCast listens to the default input. Set your System Input to **BlackHole 2ch**.

<!-- SCREENSHOT PLACEHOLDER: Audio MIDI Setup showing Multi-Output Device configuration -->

### Windows

We recommend **VB-CABLE**.

1.  **Install VB-CABLE**: [Download](https://vb-audio.com/Cable/).
2.  **Configure Output**: Set system playback to **CABLE Input**.
3.  **Hear the Audio**:
    -   Go to Sound Settings > Recording > CABLE Output > Properties > Listen.
    -   Check "Listen to this device" and select your speakers/headphones.
4.  **VibeCast Input**: Set **CABLE Output** as your default recording device.

### Linux

Use **pavucontrol** to route "Monitor of [Your Output]" to the VibeCast recording source.

---

## 📚 Documentation

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

---

### Screenshot List (TODO)
- **Main Interface**: Split view showing Control Plane and Visualizer.
- **Audio Setup**: macOS Audio MIDI Setup window with Multi-Output Device.
- **Mobile Remote**: Screenshot of the mobile web interface.