# Photo Slideshow Visualization Plugin

## Overview

The Photo Slideshow plugin displays a smooth, transitioning slideshow of images and videos from local folders or Apple Photos shared albums (macOS only). It features multiple professional transition effects, smart face-aware cropping, mosaic mode for portrait images, and comprehensive configuration options.

## Features

### Media Sources

1. **Local Folder (Cross-platform)**
   - Browse and select any folder containing images or videos
   - **Image formats**: JPG, JPEG, PNG, GIF, WebP, BMP, TIFF, HEIC, HEIF
   - **Video formats**: MP4, MOV, WebM, M4V, AVI, MKV
   - Automatic file filtering

2. **Apple Photos Albums (macOS only)**
   - Direct integration with Apple Photos app
   - Access regular albums, folders, and shared albums
   - Automatic photo export and caching
   - Works with most album types including iCloud Shared Albums

### Media Display Modes

The plugin offers four fit modes:

1. **Cover** - Fills the screen, may crop edges (default)
2. **Contain** - Shows full media with black bars if needed
3. **Mosaic** - For portrait images: displays two portrait images side-by-side, each maintaining original aspect ratio
4. **Fill** - Stretches media to fill screen (may distort)

**Mosaic Mode**: When enabled and two consecutive portrait images are available, they're displayed side-by-side. Each image maintains its original aspect ratio with `object-contain`, ensuring no stretching. Perfect for portrait-heavy photo collections.

### Smart Crop (Face Detection)

When enabled with Cover mode, the plugin uses AI face detection to:
- Automatically detect faces in images
- Pan and zoom to keep all faces visible
- Use `contain` mode when faces span >65% of the image (ensures all faces visible)
- Use `cover` mode centered on faces when faces are concentrated
- Show upper portion of portrait images without faces

**Note**: Face detection requires loading TensorFlow.js models on first use. This happens automatically in the background.

### Video Support

- **Automatic playback**: Videos play automatically when encountered
- **Full playback**: Videos play to completion before advancing (no premature transitions)
- **Sound control**: Toggle video sound on/off via settings
- **Same fit modes**: Videos respect the same fit modes as images (Cover, Contain, Mosaic, Fill)
- **Smooth transitions**: Videos transition smoothly to next media item

### Transition Effects

The plugin includes 6 categories of smooth, symmetric transitions:

1. **Fade** - Classic crossfade between images
2. **Slide** - Images slide in from 4 directions (left, right, up, down) with symmetric enter/exit
3. **Zoom** - Images zoom in or out during transition
4. **3D Rotate** - Images rotate in 3D space (X and Y axis)
5. **Cube** - 3D cube rotation effect with perspective
6. **Flip** - Images flip over in 3D space

Each transition type can be individually enabled/disabled. The plugin randomly selects from enabled transitions for variety.

**Symmetric Transitions**: Slide transitions are symmetric - when an image slides out left, the next slides in from right. This creates smooth, professional transitions.

### Position Persistence

The plugin remembers your position in each slideshow:
- When switching away and back, resumes from the same image/video
- Each folder/album maintains its own position independently
- Position is saved automatically as you advance

## Configuration Options

### Media Source Settings
- **Media Source**: Choose between Local Folder or Apple Photos
- **Folder Path**: Path to media folder (with Browse button)
- **Photos Album Name**: Name of Apple Photos album (with Select Album button)

### Display Settings
- **Display Duration**: 1-60 seconds per image (default: 5s)
  - Note: Videos ignore this setting and play to completion
- **Transition Duration**: 0.2-3 seconds (default: 0.8s)
- **Random Order**: Shuffle media vs. alphabetical order
- **Media Fit**: Cover, Contain, Mosaic, or Fill

### Advanced Settings
- **Smart Crop (Face Detection)**: Automatically keep faces visible (default: enabled)
- **Play Video Sound**: Enable/disable audio for videos (default: enabled)

### Transition Toggles
- Enable/disable individual transition effects
- Mix and match for desired visual style

## Usage

### Setting Up Local Folder

1. Open Control Plane settings for Photo Slideshow visualization
2. Select "Local Folder" as Media Source
3. Click "Browse..." next to Folder Path
4. Select a folder containing images and/or videos
5. Configure display and transition settings as desired

### Setting Up Apple Photos (macOS only)

1. Open Control Plane settings for Photo Slideshow visualization
2. Select "Apple Photos (macOS only)" as Media Source
3. Click "Select Album" next to Photos Album Name
4. **Search for your album** - Type to filter (e.g., "family", "2024")
5. **Click the album** you want from the filtered list
6. Wait for initial export (first time may take a moment)
7. Configure display and transition settings

**Tip:** The search box filters 470+ albums in real-time, making it easy to find your album!

### Using Mosaic Mode

1. Set **Media Fit** to "Mosaic (2 portraits side-by-side)"
2. Ensure your folder/album contains portrait images (height > width)
3. The plugin will automatically display two portrait images side-by-side when available
4. Each image maintains its original aspect ratio with black bars as needed

**Best for**: Portrait-heavy collections, phone photos, vertical artwork

### Customizing Transitions

For a specific visual style:
- **Classic Slideshow**: Enable only Fade
- **Dynamic**: Enable Slide, Zoom, and Fade
- **3D Experience**: Enable 3D Rotate, Cube, and Flip
- **All Effects**: Enable all transitions for maximum variety

## Technical Details

### Image Preloading & Performance

The plugin implements advanced preloading:
- **Blob-based caching**: Images/videos are fetched as blobs and cached
- **Full decode**: Images are fully decoded before display (prevents banding/partial renders)
- **Proactive preloading**: Next 3-4 media items preloaded in background
- **Memory management**: Old media released from memory after use
- **No blank screens**: Media only displays when fully ready

### Video Handling

- Videos are preloaded and ready before display
- Videos play to completion (no timer-based advancement)
- Fallback mechanisms prevent hanging if video events don't fire
- Respects all fit modes (Cover, Contain, Mosaic, Fill)

### Apple Photos Integration

On macOS, the plugin uses AppleScript to:
1. Query available albums in Photos app (including shared albums)
2. Export photos to temporary directory
3. Cache exported paths using LRU cache for performance
4. Clean up when switching albums

### Error Handling

The plugin gracefully handles:
- Empty folders or albums
- Missing/corrupted media (skipped automatically)
- Apple Photos not available (non-macOS)
- Permission issues (shows user-friendly error)
- Video playback errors (advances to next item)

## Troubleshooting

### "No images found"
- Verify folder contains supported image/video formats
- Check folder permissions
- Try browsing to select folder again

### Apple Photos not working
- Ensure you're on macOS
- Grant Photos app permissions if prompted
- Verify album name is typed correctly
- Try the "Select Album" button

### Media not loading / blank screens
- Check if file paths are accessible
- For Apple Photos, try re-selecting the album
- Verify media files aren't corrupted
- Wait a moment - first load may take time for preloading

### Images stretched in Mosaic mode
- Mosaic mode uses `object-contain` - images should never stretch
- If you see stretching, report as a bug
- Ensure images are actually portrait (height > width)

### Videos hanging / not advancing
- Videos should advance automatically when finished
- If hanging occurs, the plugin includes fallback timers
- Check video file isn't corrupted
- Try a different video to isolate the issue

### Transitions stuttering
- Reduce transition duration
- Disable some transition effects
- Check system performance
- Ensure media is fully preloaded (wait a moment)

## Default Configuration

The plugin comes pre-configured with:
- Local folder source (requires setup)
- 5 second display duration (images only; videos play to completion)
- 0.8 second transitions
- Most transitions enabled (Cube disabled by default)
- Cover fit mode (fills screen)
- Sequential order (not random)
- Smart crop enabled
- Video sound enabled

## Adding to Presets

The plugin is included in the default configuration as "Photo Slideshow" preset (disabled by default). Enable it after configuring a valid media source.

To create custom presets:
1. Configure the slideshow as desired
2. Save the configuration
3. The preset will include all settings and media source
4. Position in slideshow is also saved per preset

## Tips

1. **For presentations**: Use longer display duration (15-30s) with fade only
2. **For events**: Enable all transitions with shorter duration (3-5s)
3. **For ambiance**: Use slow transitions (2-3s) with Cover fit mode
4. **For artwork**: Use Contain fit mode to show full images without cropping
5. **For portrait collections**: Use Mosaic mode to show two images at once
6. **Random Order**: Great for large photo collections to avoid predictability
7. **Mixed media**: Mix images and videos in the same folder for variety
8. **Video sound**: Disable if you want videos to play silently with background music
