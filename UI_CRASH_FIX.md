# UI Crash Fix - Too Many Albums

## Problem

The Control Plane was freezing and crashing when clicking "Select Album" because:
1. Your Photos library has **470+ albums** (mostly hundreds of nested "iPhoto Events" albums)
2. The UI tried to show ALL of them in a dialog
3. This overwhelmed the system and caused a crash

## Important Discovery

**"Inskannade bilder" and "Nyårsgänget genom åren" are NOT in the queried albums list!**

This means they're either:
- A different type of album (possibly truly shared albums that need special API access)
- System albums that aren't scriptable
- In a different Photos library

## Solution

Changed the UI to:
1. **Show only the first 10 albums** as examples (prevents UI overflow)
2. **Let you type ANY album name** (not just ones in the list)
3. **No validation** - if you know the album name, you can try it

### New Flow

When you click "Select Album":
1. Message dialog shows: "Found 470 albums" + first 10 as examples
2. Prompt asks you to type the album name
3. **You can type any album name**, even if it wasn't in the examples
4. The export function will try to find it

## How to Use Your Albums

### Option 1: Type the Exact Name

Even though "Inskannade bilder" and "Nyårsgänget genom åren" don't appear in the queried list, you can still try typing them:

1. Click "Select Album"
2. Note the first 10 albums shown
3. Click OK
4. Type: `Inskannade bilder` (or `Nyårsgänget genom åren`)
5. The plugin will try to find and export from that album

### Option 2: Use the Browse Button for Local Folder

If the album names don't work, you can:
1. Export the albums from Photos.app to a folder on your computer
2. Use "Browse..." to select that local folder instead
3. This always works and gives you full control

### Option 3: Check Photos.app

Open Photos.app and verify:
- Are these albums visible in the sidebar?
- Are they regular albums or shared albums?
- Are they in the "Shared Albums" section?
- What exactly is the album name? (case-sensitive, special characters?)

## Technical Details

The AppleScript query:
```applescript
repeat with anAlbum in albums
    set end of albumNames to name of anAlbum
end repeat
```

This returns 470 albums including:
- All your app-specific albums (Typ, Padgram, Instagram, etc.)
- All the "iPhoto Events" folder and its 460+ nested albums
- But NOT "Inskannade bilder" or "Nyårsgänget genom åren"

This suggests these two albums might be:
1. **iCloud Shared Albums** that require different API access
2. **Smart Albums** that aren't in the regular albums list
3. Albums from a different Photos library

## Next Steps

### Test It Now

```bash
npm run build && npm run tauri dev
```

1. Click "Select Album"
2. UI should show "Found 470 albums" with first 10 examples
3. UI should NOT freeze or crash
4. Type "Inskannade bilder" or "Nyårsgänget genom åren"
5. See if the export works

### If Album Not Found

If you get an error like "Album not found: Inskannade bilder", then we know for sure it's not accessible via the regular `album "Name"` syntax, and we'll need to:

1. Find the exact album type in Photos.app
2. Try alternative AppleScript commands
3. Or use the local folder export workaround

### Check Terminal Output

When you try to export, look for:
```
Exporting photos from album: Inskannade bilder
AppleScript error: ...
```

This will tell us exactly what's happening.

## Workaround: Manual Export

If all else fails:
1. Open Photos.app
2. Select "Inskannade bilder" album
3. Select All photos (Cmd+A)
4. File → Export → Export [number] Photos
5. Choose a folder (e.g., ~/Pictures/Inskannade)
6. In VibeCast, use "Browse..." to select that folder

This always works and you maintain full control over which photos to include.

