# Changelog

## Features

### Photo Slideshow & Albums
- **Photo Slideshow Plugin**: Implemented a comprehensive photo slideshow visualization.
    - Support for local folders and Apple Photos (macOS).
    - 6 transition categories: Fade, Slide, Zoom, 3D Rotate, Cube, Flip.
    - Smart image preloading and caching.
    - "Mosaic" mode for side-by-side portrait images.
    - Face detection for smart cropping.
- **Searchable Album Selector**:
    - Replaced native prompt with a custom React modal.
    - Real-time filtering/search for albums.
    - Handles large libraries (470+ albums) without crashing.
    - Shows "X of Y albums" count.
- **Apple Photos Integration Improvements**:
    - **Performance**: Implemented smart caching system. First load takes time (export), subsequent loads are instant (cached for 1 hour).
    - **Album Discovery**: Fixed AppleScript to discover regular albums, folders, nested albums, and iCloud Shared Albums.
    - **Shared Albums**: Added specific support for iCloud Shared Albums (often prefixed with `[Shared]`).
    - **Fixes**:
        - Fixed `prompt()` blocking issues in Tauri.
        - Fixed double execution of backend calls.
        - Fixed syntax errors in AppleScript for different macOS versions.
        - Fixed UI crash when listing too many albums by limiting initial display and allowing search.

### YouTube Plugin
- **YouTube Visualization**:
    - Plays YouTube videos as background.
    - Supports `youtu.be`, `youtube.com/watch`, `embed`, and direct IDs.
    - **Premium Support**: Detects browser login to play ad-free if the user has Premium.
    - **Controls**: Options to show/hide controls, mute/unmute, and set volume.
    - **Looping**: Automatically loops videos.

### File Loading & Credits
- **File-Based Message Text**:
    - Load message text from external files (e.g., `credits.txt`).
    - Supports relative paths in configuration (relative to the config file).
- **Credits Text Style**:
    - New scrolling text style for movie-like credits.
    - Handles multi-line text files effectively.

### Presets & Defaults
- **New Visualization Presets**:
    - **Blue Glow Fireplace**: A calm, specialized fireplace settings without logs/flames.
    - **Techno (No Blob)**: Variation of Techno without the central sphere.
    - **Photo Slideshow**: Added default preset.
- **Updated Presets**:
    - **Particles**: Tweaked for larger, slower particles.
- **New Text Style Presets**:
    - **Centered Scrolling Capitals**: Large, centered marquee text.
- **Default Content**:
    - Added "Party Countdown" folder with example messages showcasing various styles (Typewriter, Bounce with split, Scrolling Capitals).

### Backend Refactoring
- **Cargo Workspace**: Split the monolithic `src-tauri` crate into a modular workspace for improved compilation speed and separation of concerns.
    - **`vibe-cast-app`**: Main application logic.
    - **`vibe-cast-server`**: Axum server logic.
    - **`vibe-cast-audio`**: Audio processing logic.
    - **`vibe-cast-state`**: Shared state management.
    - **`vibe-cast-models`**: Shared data types.

### Performance Improvements
- **Particles Visualization**: Optimized rendering by using pre-rendered sprite sheets and `drawImage` instead of creating gradients per frame. Significantly reduced CPU usage.
- **Fireplace Visualization**: Optimized flame animation by replacing `height` interpolation (Layout thrashing) with `transform: scaleY` (Composite only).

## Code Quality & Infrastructure

### Linting & Review
- **ESLint & Prettier**: Added modern ESLint configuration with TypeScript support.
- **Rust Clippy**: All Rust code passes `cargo clippy` with `-D warnings`.
- **Type Safety**: Improved TypeScript types, reduced `any` usage.

### Debugging
- **Debug Overlay**: Added visual debug overlay (`Cmd+Shift+D`) to inspect state, SSE connection, and active messages in production.
- **Logging**: Enhanced logging in both frontend (console) and backend (terminal) for message flow and album loading.

## Bug Fixes

- **Shared Albums**: Fixed issues where "Inskannade bilder" and "Nyårsgänget genom åren" were missing by improving AppleScript container queries.
- **AppleScript Syntax**: Fixed "Expected end of line" errors by removing invalid `cloud shared albums` syntax and using a more robust query.
- **Path Handling**: Fixed issues with special characters and folder paths in AppleScript.
- **Message Display**: Fixed issues where messages wouldn't appear by ensuring proper state synchronization between SSE and Tauri events.

## Recent Updates

### Visualizations
- **Example Photos**: The Photo Slideshow plugin now includes bundled example photos (abstract SVG patterns) that are used automatically if no folder path is configured. This improves the out-of-the-box experience.
- **Pulsing Glow**: Added an optional "Pulse Glow" setting to "Scrolling Capitals" text style, which animates the glow intensity for a dynamic effect.

### UX Improvements
- **Toggle Stage**: Renamed "Toggle Stage" to "Show/Hide Stage" and added tooltips to clarify functionality.
- **Restart Stability**: Fixed an issue where restarting the stage would briefly flash default settings by delaying visualization rendering until state is loaded.