# Shared Albums Support - Update

## Issue
User reported that important albums "Inskannade bilder" and "Nyårsgänget genom åren" were missing from the album list. These turned out to be **iCloud Shared Albums**, which are a separate category in Apple Photos.

## Solution

### Updated AppleScript Query
Added attempt to query shared albums in Photos.app:

```applescript
-- Try to get shared albums using various possible syntax
-- Different macOS/Photos versions may use different terminology
try
    repeat with sharedAlbum in (get every shared album)
        set end of albumNames to "[Shared] " & (name of sharedAlbum)
    end repeat
on error
    -- If shared albums syntax not supported, skip silently
end try
```

**Note:** The AppleScript syntax for accessing shared albums varies by macOS/Photos version. If shared albums don't appear with the `[Shared]` prefix, they may still be accessible as regular albums by their name.

### Album Name Prefix
Shared albums are prefixed with `[Shared] ` to distinguish them from regular albums:
- Regular album: `"Nyårsgänget genom åren"`
- Shared album: `"[Shared] Nyårsgänget genom åren"`

### Smart Photo Export
The photo export function strips the `[Shared]` prefix and tries multiple methods to find the album:

```applescript
-- Try to find album by name (works for most album types)
set theAlbum to missing value

-- First try as regular album
try
    set theAlbum to album "Album Name"
on error
    -- If not found as regular album, try as shared album
    try
        set theAlbum to shared album "Album Name"
    on error
        error "Album not found: Album Name"
    end try
end try
```

This approach tries:
1. Regular album lookup (works for most albums)
2. Shared album lookup (fallback for iCloud Shared Albums)
3. Clear error message if album not found

## What's Now Supported

The album picker now returns:
1. **Regular albums** - Top-level albums in your library
2. **Folders** - Album folders (can contain albums)
3. **Nested albums** - Albums inside folders (shown as "Folder / Album")
4. **Shared albums** - iCloud Shared Albums (shown as "[Shared] Album")

## Testing

When you run the app and click "Select Album", you should now see all four types of albums in the list.

Expected output in terminal:
```
AppleScript stdout: RegularAlbum|Folder|Folder / NestedAlbum|[Shared] SharedAlbum|...
Parsed albums: ["RegularAlbum", "Folder", "Folder / NestedAlbum", "[Shared] SharedAlbum", ...]
```

Your missing albums should now appear as:
```
[Shared] Inskannade bilder
[Shared] Nyårsgänget genom åren
```

## Usage

1. Click "Select Album"
2. Look for albums prefixed with `[Shared]`
3. Enter the full name including the prefix: `[Shared] Nyårsgänget genom åren`
4. The plugin will automatically handle the export from the shared album

## Technical Notes

- **iCloud Shared Albums** are a special Photos.app feature for collaborative photo sharing
- They're accessed via the `cloud shared albums` AppleScript property, not the regular `albums` property
- Photos from shared albums are exported to the same temp directory as regular albums
- The `[Shared]` prefix is purely for UI clarity and is stripped before querying the actual album

## Files Modified

- `src-tauri/src/lib.rs`:
  - Added shared albums to `get_photos_albums` query
  - Added shared album detection in `get_photos_from_album`
  - Added logging for debugging
- `ALBUM_PICKER_FIX.md`: Updated with shared album information
- `docs/PHOTO_SLIDESHOW_PLUGIN.md`: Updated feature list
- `PHOTO_SLIDESHOW_IMPLEMENTATION_SUMMARY.md`: Updated technical details

