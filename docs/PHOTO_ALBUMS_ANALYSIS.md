# Photo Albums Integration - Detailed Analysis

## Current Issues

### Issue 1: Shared Albums Not Appearing in List

**Root Cause**: The AppleScript in `get_photos_albums` only queries:
- `albums` - regular albums created by the user
- `folders` and albums inside folders

Shared albums are a **completely separate category** in Apple Photos. They are NOT in the `albums` collection and require special handling.

**AppleScript Limitation**: Shared albums have limited AppleScript support on macOS:
- On macOS 12+, they might be accessible via different syntax
- The standard `albums` collection doesn't include shared albums
- Cloud-synced shared albums may not be scriptable at all

### Issue 2: Albums Inside Folders Don't Load

**Root Cause**: When the user selects "iPhoto Events / Nyår 2013", the code passes this string directly to `get_photos_from_album`. The AppleScript then tries:

```applescript
set theAlbum to album "iPhoto Events / Nyår 2013"
```

This fails because the album is named "Nyår 2013" inside a folder named "iPhoto Events". Correct syntax:

```applescript
set theAlbum to album "Nyår 2013" of folder "iPhoto Events"
```

### Issue 3: Loading Gets Stuck / Hangs

**Root Cause**: Multiple factors:
1. Photo export via AppleScript is inherently slow
2. For large albums, export can take 10+ minutes
3. The `export` command writes full image files to disk
4. No timeout or progress feedback
5. If Photos.app requires permission, it blocks silently

## Proposed Solutions

### Solution 1: Fix Folder Album Access

Parse the "Folder / Album" format and generate correct AppleScript:

```applescript
-- For "iPhoto Events / Nyår 2013"
set theAlbum to album "Nyår 2013" of folder "iPhoto Events"
```

### Solution 2: Use Original File Paths Instead of Export

Instead of exporting (which copies files), get the original file paths directly:

```applescript
tell application "Photos"
    set theAlbum to album "AlbumName"
    set photoList to {}
    repeat with aPhoto in media items of theAlbum
        set photoPath to filename of aPhoto
        -- Get the actual file path using the image's referenced file
        try
            set end of photoList to POSIX path of (get image file of aPhoto)
        end try
    end repeat
end tell
```

**Note**: This approach has limitations - Photos may not provide direct file paths for all media.

### Solution 3: Alternative Approach - Use Photos Library Directly

The Photos library is stored at `~/Pictures/Photos Library.photoslibrary`. We can:
1. Parse the database directly (complex, version-specific)
2. Use a helper tool that accesses PhotoKit

### Solution 4: Shared Albums - Document Limitation

For shared albums, the most reliable approach is:
1. Have user manually export the shared album to a local folder
2. Use VibeCast's "Local Folder" option
3. Document this limitation clearly

## Implementation Plan

### Phase 1: Fix Folder Albums (Critical)
- Parse "Folder / Album" format in `get_photos_from_album`
- Generate correct AppleScript syntax
- Add proper error handling

### Phase 2: Improve Photo Access (Critical)
- Try getting original file paths first (no export needed)
- Fall back to export only if necessary
- Add timeout mechanism

### Phase 3: Shared Albums (Best Effort)
- Try to query shared albums with various AppleScript syntaxes
- If not accessible, provide clear user feedback
- Recommend manual export workaround

### Phase 4: Improve User Experience
- Add progress indication
- Show meaningful error messages
- Cache successfully retrieved albums

## Technical Details

### AppleScript for Shared Albums

macOS has inconsistent support for shared albums. Possible queries:

```applescript
-- Attempt 1: Named collection (may not work)
tell application "Photos"
    set sharedAlbums to {}
    try
        set sharedAlbums to name of every shared album
    end try
    return sharedAlbums
end tell

-- Attempt 2: Container (may include shared albums)
tell application "Photos"
    set containers to {}
    try
        set containers to name of every container
    end try
    return containers
end tell
```

### Getting Original File Paths

```applescript
tell application "Photos"
    set theAlbum to album "Test"
    set photoPaths to {}
    repeat with aPhoto in media items of theAlbum
        try
            -- This gets the path to the original file in Photos library
            set thePath to POSIX path of (get image file of aPhoto)
            set end of photoPaths to thePath
        on error errMsg
            -- Fallback: get filename and library location
            set fname to filename of aPhoto
        end try
    end repeat
    return photoPaths
end tell
```

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| AppleScript hangs | Add timeout, run in background with cancellation |
| Large albums slow | Get paths only, don't export |
| Shared albums inaccessible | Document limitation, recommend manual export |
| macOS version differences | Test on multiple versions, graceful fallback |
| Photos library corruption | Read-only access, never modify |

## Conclusion

The current implementation has fundamental issues with:
1. Not handling folder path syntax
2. Using slow export instead of direct file access
3. No timeout/cancellation mechanism

Priority fixes:
1. Fix folder album access (parse "Folder / Album" syntax)
2. Get original file paths instead of exporting
3. Add proper error handling and timeouts

