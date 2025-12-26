# YouTube Visualization Plugin

The YouTube visualization plugin allows you to loop YouTube videos as immersive backgrounds in the VibeCast app.

## Features

- **Video Looping**: Automatically loops the specified video for continuous playback
- **YouTube Premium Support**: If logged into YouTube Premium in your browser, videos play without ads
- **Customizable Controls**: Toggle video controls visibility
- **Volume Control**: Adjust playback volume or mute the video
- **Multiple URL Formats**: Supports various YouTube URL formats:
  - `https://youtu.be/VIDEO_ID`
  - `https://www.youtube.com/watch?v=VIDEO_ID`
  - `https://www.youtube.com/embed/VIDEO_ID`
  - Direct video ID (11 characters)

## Settings

### Video URL
The YouTube video URL to play. Accepts any standard YouTube URL format.

**Default**: `https://youtu.be/uNNk-V08J7k?si=0chlR1UB6XYRxPc3`

### Show Controls
Toggle visibility of YouTube player controls (play/pause, seek bar, etc).

**Default**: Off (false)

### Muted
Mute the video audio.

**Default**: On (true) - Videos play muted by default

### Volume
Control playback volume (0-100).

**Default**: 50

## YouTube Premium Integration

The plugin respects your YouTube login state:

- If you're logged into a YouTube Premium account in your system browser, the video will play **without ads**
- The plugin uses YouTube's iframe API, which shares cookies with your browser session
- No additional authentication is required

## Usage Tips

1. **Finding Video URLs**: Copy any YouTube video URL from your browser's address bar
2. **Loop-Friendly Content**: Choose videos designed for looping (e.g., ambient scenes, music visualizers)
3. **Performance**: The plugin uses YouTube's official iframe API for optimal performance
4. **Fullscreen Background**: Videos automatically scale to cover the entire visualizer window

## Error Handling

The plugin provides user-friendly error messages for common issues:

- **Invalid video ID**: The URL format is incorrect
- **Video not found**: The video doesn't exist or was removed
- **Cannot be embedded**: The video has embedding disabled by the uploader
- **HTML5 player error**: Browser or network issue preventing playback

## Technical Details

- Uses YouTube iframe player API
- Supports autoplay and looping
- Responsive video sizing with aspect ratio preservation
- No external dependencies beyond YouTube's official API
- Audio reactivity: Not currently implemented (video plays independently of audio data)

## Example Videos

Here are some YouTube video types that work well as visualizations:

- **Fireplace videos**: Cozy ambient backgrounds
- **Space/astronomy**: Hubble timelapses, star fields
- **Ocean waves**: Calming water scenes
- **Abstract art**: Generative or motion graphics
- **Music visualizers**: Audio-reactive animations
- **Nature scenes**: Rain, snow, forests

## Troubleshooting

**Video won't play**:
- Check that the URL is valid
- Ensure the video allows embedding
- Try a different video to rule out network issues

**Seeing ads despite YouTube Premium**:
- Make sure you're logged into YouTube in your browser
- Try opening YouTube.com in your browser to verify your login
- The plugin shares cookies with your browser session

**Performance issues**:
- Try lowering the video quality in YouTube's player controls
- Check your internet connection speed
- Reduce system load by closing other applications

