# Photo Slideshow Visualization Plugin

## Overview

The Photo Slideshow plugin displays a smooth, transitioning slideshow of images from local folders or Apple Photos shared albums (macOS only). It features multiple professional transition effects and comprehensive configuration options.

## Features

### Image Sources

1. **Local Folder (Cross-platform)**
   - Browse and select any folder containing images
   - Supports: JPG, JPEG, PNG, GIF, WebP, BMP, TIFF
   - Automatic file filtering

2. **Apple Photos Albums (macOS only)**
   - Direct integration with Apple Photos app
   - Access regular albums, folders, and shared albums
   - Automatic photo export and caching
   - Works with most album types including iCloud Shared Albums

### Transition Effects

The plugin includes 6 categories of smooth transitions:

1. **Fade** - Classic crossfade between images
2. **Slide** - Images slide in from 4 directions (left, right, up, down)
3. **Zoom** - Images zoom in or out during transition
4. **3D Rotate** - Images rotate in 3D space (X and Y axis)
5. **Cube** - 3D cube rotation effect with perspective
6. **Flip** - Images flip over in 3D space

Each transition type can be individually enabled/disabled. The plugin randomly selects from enabled transitions for variety.

### Configuration Options

#### Image Source Settings
- **Image Source**: Choose between Local Folder or Apple Photos
- **Folder Path**: Path to image folder (with Browse button)
- **Photos Album Name**: Name of Apple Photos album (with Select Album button)

#### Display Settings
- **Display Duration**: 1-60 seconds per image (default: 5s)
- **Transition Duration**: 0.2-3 seconds (default: 0.8s)
- **Random Order**: Shuffle images vs. alphabetical order
- **Image Fit**: Cover (fill screen), Contain (show full image), or Fill (stretch)

#### Transition Toggles
- Enable/disable individual transition effects
- Mix and match for desired visual style

## Usage

### Setting Up Local Folder

1. Open Control Plane settings for Photo Slideshow visualization
2. Select "Local Folder" as Image Source
3. Click "Browse..." next to Folder Path
4. Select a folder containing images
5. Configure display and transition settings as desired

### Setting Up Apple Photos (macOS only)

1. Open Control Plane settings for Photo Slideshow visualization
2. Select "Apple Photos (macOS only)" as Image Source
3. Click "Select Album" next to Photos Album Name
4. **Search for your album** - Type to filter (e.g., "family", "2024")
5. **Click the album** you want from the filtered list
6. Wait for initial export (first time may take a moment)
7. Configure display and transition settings

**Tip:** The search box filters 470+ albums in real-time, making it easy to find your album!

### Customizing Transitions

For a specific visual style:
- **Classic Slideshow**: Enable only Fade
- **Dynamic**: Enable Slide, Zoom, and Fade
- **3D Experience**: Enable 3D Rotate, Cube, and Flip
- **All Effects**: Enable all transitions for maximum variety

## Technical Details

### Image Preloading

The plugin implements smart preloading:
- Preloads next 2-3 images in advance
- Releases images from memory after use
- Prevents memory buildup on long slideshows

### Performance

- Uses CSS hardware acceleration (`transform`, `opacity`)
- Efficient memory management
- Smooth 60 FPS transitions
- Works with high-resolution images

### Apple Photos Integration

On macOS, the plugin uses AppleScript to:
1. Query available albums in Photos app
2. Export photos to temporary directory
3. Cache exported paths for performance
4. Clean up when switching albums

### Error Handling

The plugin gracefully handles:
- Empty folders or albums
- Missing/corrupted images (skipped automatically)
- Apple Photos not available (non-macOS)
- Permission issues (shows user-friendly error)

## Troubleshooting

### "No images found"
- Verify folder contains supported image formats
- Check folder permissions
- Try browsing to select folder again

### Apple Photos not working
- Ensure you're on macOS
- Grant Photos app permissions if prompted
- Verify album name is typed correctly
- Try the "Select Album" button

### Images not loading
- Check if file paths are accessible
- For Apple Photos, try re-selecting the album
- Verify image files aren't corrupted

### Transitions stuttering
- Reduce transition duration
- Disable some transition effects
- Check system performance

## Default Configuration

The plugin comes pre-configured with:
- Local folder source (requires setup)
- 5 second display duration
- 0.8 second transitions
- Most transitions enabled (Cube disabled by default)
- Cover fit mode (fills screen)
- Sequential order (not random)

## Adding to Presets

The plugin is included in the default configuration as "Photo Slideshow" preset (disabled by default). Enable it after configuring a valid image source.

To create custom presets:
1. Configure the slideshow as desired
2. Save the configuration
3. The preset will include all settings and image source

## Tips

1. **For presentations**: Use longer display duration (15-30s) with fade only
2. **For events**: Enable all transitions with shorter duration (3-5s)
3. **For ambiance**: Use slow transitions (2-3s) with Cover fit mode
4. **For artwork**: Use Contain fit mode to show full images without cropping
5. **Random Order**: Great for large photo collections to avoid predictability

