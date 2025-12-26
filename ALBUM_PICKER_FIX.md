# Album Picker Fix

## Issues Identified

1. **UI Not Responding**: The `prompt()` dialog wasn't showing when clicking "Select Album"
2. **Missing Albums**: Some albums like "Inskannade bilder" and "Nyårsgänget genom åren" weren't in the list
3. **Double Execution**: Backend was being called twice for each click

## Root Causes

### Issue #1: Dialog Not Showing
The browser's `prompt()` function can be blocked in Tauri windows due to Content Security Policy or window focus issues. The prompt might have been shown but not visible.

### Issue #2: Missing Albums
The original AppleScript only queried `albums` in Photos.app, but Photos has different types of containers:
- Regular albums
- Smart albums  
- **Folders** (which contain albums)
- **Shared albums** (iCloud Shared Albums - accessed via `cloud shared albums`)

The missing albums were likely **shared albums**, which are a separate category in Photos.app.

### Issue #3: Double Execution
React component was likely being called/rendered twice, causing duplicate backend calls.

## Solutions Implemented

### 1. Improved AppleScript (src-tauri/src/lib.rs)
```applescript
-- Get regular albums
repeat with anAlbum in albums
    set end of albumNames to name of anAlbum
end repeat

-- Get folders and their contents
repeat with aFolder in folders
    set end of albumNames to name of aFolder
    -- Get albums inside folders
    try
        repeat with anAlbum in albums of aFolder
            set end of albumNames to ((name of aFolder) & " / " & (name of anAlbum))
        end repeat
    end try
end repeat

-- Get shared albums (iCloud Shared Albums)
try
    repeat with sharedAlbum in cloud shared albums
        set end of albumNames to "[Shared] " & (name of sharedAlbum)
    end repeat
end try
```

This now finds:
- All top-level albums
- All folders
- All albums nested inside folders (with path notation like "Folder / Album")
- **All shared albums** (iCloud Shared Albums, prefixed with "[Shared] ")

### 2. Better UI Flow (SettingsRenderer.tsx)

**Old approach:**
```typescript
const selected = prompt(`Available albums:\n${albumList}\n\nEnter album name:`);
```

**New approach:**
```typescript
// Step 1: Show all albums in a native Tauri message dialog
await message(`Found ${albums.length} albums:\n\n${albumList}\n\n...`, {
  title: 'Available Albums',
  kind: 'info'
});

// Step 2: Use window.prompt() for input
const userInput = window.prompt(`Enter the album name...`);

// Step 3: Validate the input
if (albums.includes(trimmed)) {
  onChange(trimmed);
} else {
  await message(`Album "${trimmed}" not found...`, {
    title: 'Album Not Found',
    kind: 'error'
  });
}
```

Benefits:
- Tauri's native `message()` dialog **always shows** (not subject to CSP blocking)
- Shows numbered list for easy reference
- Validates user input against actual album list
- Better error messages with proper dialogs

### 3. Loading State
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleAction = async () => {
  if (isLoading) return; // Prevent double-clicks
  
  setIsLoading(true);
  try {
    await handleActionInternal();
  } finally {
    setIsLoading(false);
  }
};
```

Button shows "Loading..." while fetching albums, preventing multiple calls.

### 4. Enhanced Debugging
Added console logs at every step:
```
[Album Picker] Button clicked, requesting albums...
[Album Picker] Received albums: [...]
[Album Picker] Showing albums to user
[Album Picker] User entered: ...
[Album Picker] Valid album selected: ...
```

## Testing

To test the fix:

1. Run `npm run tauri dev`
2. Open Control Plane
3. Create new Photo Slideshow visualization preset
4. Change "Image Source" to "Apple Photos (macOS only)"
5. Click "Select Album"
6. **Expected behavior:**
   - Button changes to "Loading..."
   - Native dialog shows with numbered list of ALL albums (including folders)
   - Second prompt asks for album name
   - If valid, album name is saved
   - If invalid, error dialog shows

## Expected Albums Now Visible

With the folder and shared album support, you should now see:
- All regular albums (Typ, Padgram, Layout, etc.)
- All folder names
- Nested albums with notation like "Folder / Album Name"
- **All shared albums prefixed with "[Shared] "**

If "Inskannade bilder" and "Nyårsgänget genom åren" are:
- **Shared albums**: They'll appear as "[Shared] Inskannade bilder" and "[Shared] Nyårsgänget genom åren"
- Folders: They'll appear without prefix
- Albums inside folders: They'll appear with the full path like "Parent / Inskannade bilder"

## Console Output

Check browser console (Developer Tools) for detailed logs:
```
[Album Picker] Button clicked, requesting albums from Photos app...
[Album Picker] Received albums: ["Folder1", "Folder1 / Album1", "Album2", ...]
[Album Picker] Album count: 25
[Album Picker] Showing albums to user
```

Check terminal for backend logs:
```
AppleScript stdout: Album1|Album2|Folder / SubAlbum|...
Parsed albums: ["Album1", "Album2", "Folder / SubAlbum", ...]
```

## Future Improvements

1. **Custom Modal**: Replace `window.prompt()` with a proper React modal with search/filter
2. **Autocomplete**: Show suggestions as user types
3. **Visual Preview**: Show album thumbnails
4. **Recent Albums**: Remember recently used albums
5. **Smart Albums**: Include Smart Albums in the query

## Files Modified

- `src-tauri/src/lib.rs` - Enhanced AppleScript to query folders
- `src/components/settings/SettingsRenderer.tsx` - Better dialog flow, loading state, validation

