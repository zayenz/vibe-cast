# Installation & Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or later)
- **Rust** (latest stable)
- **Tauri Prerequisites** (OS-specific dependencies, see [Tauri Docs](https://tauri.app/v1/guides/getting-started/prerequisites))

## Building from Source

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/zayenz/vibe-cast.git
    cd vibe-cast
    ```

2.  **Install frontend dependencies:**
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

## Audio Loopback Setup

VibeCast visualizes audio by capturing the system output. To do this, you need a "loopback" device that routes audio playing on your computer back into an input that VibeCast can listen to.

### macOS

On macOS, you can use **BlackHole** or **Loopback**. We recommend BlackHole as it is open-source and free.

1.  **Install BlackHole (2ch):**
    *   Download installer from [existential.audio](https://existential.audio/blackhole/) OR
    *   Install via Homebrew: `brew install blackhole-2ch`

2.  **Create a Multi-Output Device:**
    *   Open **Audio MIDI Setup** (Cmd+Space, type "Audio MIDI Setup").
    *   Click the **+** button at the bottom left and select **Create Multi-Output Device**.
    *   In the list on the right, check **BlackHole 2ch** AND your primary output (e.g., **MacBook Pro Speakers** or **External Headphones**).
    *   Ensure "Drift Correction" is checked for the BlackHole device.

3.  **Set System Output:**
    *   Go to **System Settings** > **Sound**.
    *   Set **Output** to the **Multi-Output Device** you just created.
    *   *Note: You won't be able to control volume via keyboard keys while using a Multi-Output Device. You can use utility apps like eqMac or SoundSource if this is critical.*

4.  **VibeCast Setup:**
    *   VibeCast will automatically try to capture audio from the default input device.
    *   Set **Input** in **System Settings** > **Sound** to **BlackHole 2ch**.
    *   Alternatively, VibeCast may have an audio device selector in the future (currently it uses the default input).

### Windows

On Windows, you can use **VB-CABLE** or the built-in "Stereo Mix" if your driver supports it.

#### Option A: VB-CABLE (Recommended)

1.  **Install VB-CABLE:**
    *   Download and install [VB-CABLE Virtual Audio Device](https://vb-audio.com/Cable/).
    *   Reboot your computer if prompted.

2.  **Configure Output:**
    *   Set your system **Playback** device to **CABLE Input (VB-Audio Virtual Cable)**.
    *   *Problem:* You won't hear anything.
    *   *Solution:* Open **Sound Settings** > **Sound Control Panel** > **Recording** tab.
    *   Right-click **CABLE Output** > **Properties** > **Listen** tab.
    *   Check **Listen to this device**.
    *   Select your actual speakers/headphones in **Playback through this device**.

3.  **VibeCast Setup:**
    *   VibeCast should capture audio from **CABLE Output**. Set it as your default **Recording** device.

#### Option B: Stereo Mix

1.  Open **Sound Settings** > **Sound Control Panel** > **Recording** tab.
2.  Right-click empty space and ensure **Show Disabled Devices** is checked.
3.  If **Stereo Mix** appears, right-click and **Enable** it.
4.  Set it as the Default Device.

### Linux

On Linux (PulseAudio/PipeWire):

1.  Most distributions using PulseAudio or PipeWire make it easy to route "Monitor of [Output Device]" to an input.
2.  Use **pavucontrol** (PulseAudio Volume Control).
3.  In the **Recording** tab, find VibeCast (while it's running) and change its source to **Monitor of Built-in Audio Analog Stereo**.

---

## Troubleshooting

-   **Visualizations are silent/flat:** Ensure your system output is routed to the loopback device, and the loopback device is set as the default input (or selected within the app if supported).
-   **Permissions (macOS):** VibeCast requires Microphone permission to capture audio. If prompted, click "Allow". Check System Settings > Privacy & Security > Microphone if you denied it previously.
