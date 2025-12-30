# File-Based Message Text & Relative Paths Feature

## Overview

This feature allows loading message text from external files and using relative paths in configuration.

## New Features

### 1. **Load Message Text from File**

Messages can now load their text content from external files instead of inline text.

**Benefits:**
- Manage long text (like credits) in separate files
- Edit text without modifying JSON
- Automatically splits by newlines (perfect for credits)

**Usage in UI:**
1. Open any message's settings (click the dropdown arrow)
2. Find the "Load from File" field
3. Enter a file path (e.g., `credits.txt` or `/path/to/text.txt`)
4. The message text will be loaded from that file when triggered

**Usage in JSON Config:**
```json
{
  "messages": [{
    "id": "end-credits",
    "textFile": "credits.txt",
    "textStyle": "credits",
    "text": ""
  }]
}
```

### 2. **Relative Paths**

Paths can now be relative to the loaded configuration file.

**Example:**
```
Your project structure:
/Users/you/shows/
  ├── show.json          (configuration file)
  ├── credits.txt        (text file)
  └── media/
      └── photos/        (slideshow folder)

In show.json:
{
  "messages": [{
    "textFile": "credits.txt"  // Relative to show.json
  }],
  "visualizationPresets": [{
    "settings": {
      "folderPath": "media/photos"  // Relative to show.json
    }
  }]
}
```

### 3. **Credits Text Style**

A new "Credits" text style is available for movie-style vertical scrolling text.

**Features:**
- Scrolls from bottom to top
- Similar visual style to Scrolling Capitals but not uppercase by default
- Displays all split lines simultaneously (perfect for multi-line credits)
- GPU-accelerated for smooth 60fps scrolling

## How to Use

### Verify Credits is Available

1. **Start the app** (or restart if it was already running)
2. **Check the Text Style dropdown** in any message's settings
   - You should see "Credits" in the list
3. If Credits doesn't appear:
   - The app auto-creates presets for all registered text styles on first load
   - If you have a saved config that predates Credits, it might not be included
   - Solution: Start fresh or manually add a Credits preset via the Text Style Presets manager

### Create a Credits Message from File

1. **Create a text file** (e.g., `credits.txt`) with your credits:
```
Producer
John Doe

Director
Jane Smith

Special Thanks
Everyone who helped make this possible
```

2. **Save your configuration** to establish a base path
3. **Add a new message**
4. **Expand the message settings**
5. **Set "Load from File"** to `credits.txt` (or the full path)
6. **Select "Credits"** from the Text Style dropdown
7. **Trigger the message** to see the credits roll!

### Create a Slideshow with Relative Paths

1. **Save your configuration file** to `/path/to/config.json`
2. **Place your photos** in `/path/to/photos/`
3. **In Photo Slideshow settings**, set Folder Path to `photos/`
4. The slideshow will now load from the correct folder relative to your config

## Technical Details

### Path Resolution
- **Absolute paths** (starting with `/` or `C:\`) are used as-is
- **Relative paths** are resolved relative to the directory containing the loaded configuration file
- If no config is loaded, relative paths remain unchanged

### Automatic Splitting
When `textFile` is specified:
- `splitEnabled` is automatically set to `true`
- `splitSeparator` is automatically set to `\n` (newline)
- Each line becomes a separate part for sequential text styles
- For Credits style, all lines are displayed simultaneously as a credits roll

### Performance
- Text files are loaded on-demand when messages are triggered
- Failed file loads show an error message in place of the text
- Relative path resolution happens at the Rust backend level for efficiency

## Troubleshooting

### Credits doesn't appear in dropdown
- Restart the app to ensure the registry is loaded
- Check that CreditsPlugin is properly exported in `src/plugins/textStyles/index.ts`
- The app should auto-create a Credits preset on startup

### File not found error
- Check that the path is correct
- If using a relative path, ensure you've loaded a configuration file first
- Try using an absolute path to verify the file is accessible

### Text not loading
- Check the browser console (F12) for error messages
- Verify the file has read permissions
- Ensure the file contains valid text (UTF-8 encoding)

## Example Configuration

Complete example with file-based credits and relative slideshow:

```json
{
  "version": 1,
  "messages": [
    {
      "id": "opening",
      "text": "Welcome to the Show!",
      "textStyle": "scrolling-capitals"
    },
    {
      "id": "credits",
      "textFile": "credits.txt",
      "textStyle": "credits",
      "text": "",
      "repeatCount": 1,
      "speed": 1.0
    }
  ],
  "visualizationPresets": [
    {
      "id": "photos-preset",
      "name": "Show Photos",
      "visualizationId": "photo-slideshow",
      "settings": {
        "folderPath": "photos",
        "displayDuration": 5,
        "transitionDuration": 1.0
      }
    }
  ]
}
```

Save this as `/path/to/show/show.json`, place `credits.txt` and a `photos/` folder in the same directory, and you're ready to go!

