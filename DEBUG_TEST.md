# Debug Test Guide

## Testing Credits Text Style and File Loading

I've added extensive debug logging to help diagnose the issues. Here's how to test:

### 1. Check if Credits is Available

**Steps:**
1. Start the app: `npm run tauri dev`
2. Open the browser console (F12 or Cmd+Option+I)
3. Look for these log messages on startup:
   ```
   [Store] Text style registry length: 6
   [Store] Text style registry IDs: ["scrolling-capitals", "fade", "typewriter", "bounce", "dot-matrix", "credits"]
   [Store] Existing text style preset IDs: [...]
   [Store] Creating preset for missing text style: credits Credits
   [Store] Final text style presets: [...]
   ```

4. Check if "Credits" appears in the final presets list
5. In the UI, create a new message and expand it
6. Check the "Text Style" dropdown - Credits should be there

**If Credits is NOT in the dropdown:**
- Check the console logs to see if the registry includes "credits"
- Check if a preset was created for it
- Try resetting your config or starting fresh

### 2. Test Config Base Path

**Setup:**
1. Create a test directory: `/tmp/vibecast-test/`
2. Create a test file: `/tmp/vibecast-test/test.txt` with content: `Line 1\nLine 2\nLine 3`
3. Create a config: `/tmp/vibecast-test/config.json`

**Steps:**
1. In VibeCast, click "Load Configuration" and select `/tmp/vibecast-test/config.json`
2. Watch the console for:
   ```
   [ControlPlane] Loading config from: /tmp/vibecast-test/config.json
   [ControlPlane] Config directory: /tmp/vibecast-test
   [ControlPlane] Setting config base path to: /tmp/vibecast-test
   [Store] Setting config base path: /tmp/vibecast-test sync: true
   [Store] Syncing config base path to backend
   ```

3. Check the terminal running the Tauri app for:
   ```
   [Rust] Setting config base path to: Some("/tmp/vibecast-test")
   [Rust] Config base path successfully set
   ```

**If the base path is NOT being set:**
- Check if the console shows the setConfigBasePath call
- Check if the Rust backend receives the SET_CONFIG_BASE_PATH event
- Verify the path extraction logic is working

### 3. Test File Loading

**Steps:**
1. Create a message
2. Set "Load from File" to: `test.txt`
3. Select "Credits" as the text style
4. Trigger the message
5. Watch for these logs:

**In browser console:**
```
[messageLoader] Loading text from file: test.txt
[messageLoader] Successfully loaded text, length: 21
```

**In terminal (Rust logs):**
```
[Rust] load_message_text_file called
[Rust]   file_path: test.txt
[Rust]   base_path: Some("/tmp/vibecast-test")
[Rust]   resolved path: /tmp/vibecast-test/test.txt
[Rust]   Successfully read file, length: 21
```

**If file loading fails:**
- Check the error message in the logs
- Verify the base path is set correctly
- Try using an absolute path first: `/tmp/vibecast-test/test.txt`
- Check file permissions

### 4. Common Issues

**Issue: Credits not in dropdown**
- Solution: The app auto-creates presets on startup. If you have an old saved config, it might not include Credits. Try:
  1. Delete any saved state/config
  2. Restart the app
  3. Or manually create a Credits preset in the Text Style Presets manager

**Issue: Relative paths not working**
- Solution: Make sure you've loaded a configuration file first to establish the base path
- Check the console logs to verify the base path is being set
- Try an absolute path first to verify the file loading mechanism works

**Issue: File not found**
- Solution: Check the resolved path in the Rust logs
- Verify the file exists at that location
- Check file permissions (should be readable)

### 5. Test with Absolute Path First

To isolate whether the issue is with relative paths or file loading in general:

1. Create `/tmp/test-absolute.txt` with some content
2. In a message, set "Load from File" to: `/tmp/test-absolute.txt`
3. Trigger the message
4. If this works, the issue is specifically with relative path resolution
5. If this doesn't work, the issue is with file loading in general

### 6. Check the Logs

All logs are prefixed with their source:
- `[Store]` - Frontend Zustand store
- `[ControlPlane]` - Control plane UI
- `[messageLoader]` - Message text file loader
- `[Rust]` - Backend Rust code

Look for ERROR messages or unexpected values in the logs.

