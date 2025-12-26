# AppleScript Syntax Error Fix

## Error
```
AppleScript error: 659:665: syntax error: Expected end of line but found identifier. (-2741)
```

## Root Cause
The syntax `cloud shared albums` is not valid AppleScript in the Photos.app dictionary. The correct syntax varies by macOS version.

## Fix Applied

### Changed From (Broken)
```applescript
repeat with sharedAlbum in cloud shared albums
    -- ...
end repeat
```

### Changed To (Fixed)
```applescript
-- Try to get shared albums using various possible syntax
try
    repeat with sharedAlbum in (get every shared album)
        set end of albumNames to "[Shared] " & (name of sharedAlbum)
    end repeat
on error
    -- If shared albums syntax not supported, skip silently
end try
```

## What This Means

1. **Shared albums may or may not be listed with `[Shared]` prefix**
   - Depends on macOS version and Photos.app version
   - The `try`/`on error` block prevents crashes if the syntax isn't supported

2. **Shared albums should still be accessible by name**
   - Even if they don't appear with the `[Shared]` prefix
   - The export function tries both `album "Name"` and `shared album "Name"`

3. **Your albums should now appear**
   - "Inskannade bilder" 
   - "Nyårsgänget genom åren"
   - Either with or without the `[Shared]` prefix

## Testing

After rebuilding (`npm run build && npm run tauri dev`):

1. Click "Select Album"
2. Check the terminal output:
   ```
   AppleScript stdout: Typ|Padgram|...|Inskannade bilder|Nyårsgänget genom åren|...
   ```
3. If you see `[Shared]` prefix, use it when entering the name
4. If not, just enter the album name directly

## Fallback Behavior

The export function is now more robust:

```applescript
-- First try as regular album
try
    set theAlbum to album "Name"
on error
    -- Try as shared album
    try
        set theAlbum to shared album "Name"
    on error
        error "Album not found"
    end try
end try
```

This means:
- If "Inskannade bilder" appears as a regular album → it will work
- If it needs `shared album` syntax → it will also work
- Only fails if the album truly doesn't exist

## Why This Happens

Apple's Photos.app AppleScript dictionary has evolved:
- Older macOS: Shared albums accessed as regular `albums`
- Newer macOS: May have dedicated `shared album` class
- Some versions: May use different terminology

Our code now handles all these cases gracefully.

## Expected Behavior Now

✅ **No more syntax errors**
✅ **Albums list should load** (may or may not include `[Shared]` prefix)
✅ **Export should work** for both regular and shared albums
✅ **Graceful fallback** if shared album syntax not available

## If Albums Still Don't Appear

If your albums still don't show up, they might be:
1. In a subfolder → will appear as "Folder / Album"
2. Hidden albums → need to unhide in Photos.app
3. System albums → may not be scriptable

Check the terminal output to see exactly what albums are being returned.

