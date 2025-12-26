# Debug & Stability Fixes

## Issues Fixed

### 1. Shared Albums Not Showing
**Problem:** AppleScript syntax error with `every container`
**Fix:** Removed invalid syntax. Shared albums should appear in the regular `albums` list on most macOS versions.

### 2. Loading Screen Stuck
**Problems:**
- Silent AppleScript errors
- Invalid container query syntax
- No error feedback to user

**Fixes:**
- Removed invalid AppleScript syntax
- Added comprehensive logging at every step
- Better error messages to user

### 3. Local Folder Black Screen
**Problems:**
- Silent failures
- Special characters in path (å)
- No error feedback

**Fixes:**
- Added detailed logging
- Better path validation
- Clear error messages

## Debugging

### Check Terminal Output

When you run the app, look for these log messages:

#### Frontend Logs (Browser Console)
```
[Photo Slideshow] Loading images... {sourceType: "local", folderPath: "..."}
[Photo Slideshow] Listing images in folder: /path/to/folder
[Photo Slideshow] Found X images in folder
[Photo Slideshow] Successfully loaded X images from local
[Photo Slideshow] Preloading first 3 images
[Photo Slideshow] Preloaded image 1
```

#### Backend Logs (Terminal)
```
Listing images in folder: /Users/zayenz/Desktop/nyårsgängetgenomåren
Found 25 images in folder
First image: /Users/zayenz/Desktop/nyårsgängetgenomåren/photo1.jpg
```

OR if there's an error:
```
ERROR: Folder does not exist: /path/to/folder
```

### Common Issues & Solutions

#### Issue: "Folder does not exist"
**Cause:** Invalid path or typo
**Solution:** 
1. Remove any `@` prefix from paths
2. Use the "Browse..." button instead of typing
3. Check the path actually exists: `ls /path/to/folder`

#### Issue: "No images found in folder"
**Cause:** Folder is empty or contains no supported formats
**Solution:**
1. Check folder has images: `ls /path/to/folder`
2. Verify image formats (jpg, png, gif, webp)
3. Try a different folder

#### Issue: Loading screen stuck (Albums)
**Check logs for:**
```
AppleScript stderr: ...
```

**Common causes:**
- Album doesn't exist
- Photos app not responding
- Permissions issue

**Solution:**
1. Try a different album
2. Restart Photos app
3. Check macOS privacy settings for Photos access

## Testing Steps

### Test 1: Local Folder

```bash
npm run build && npm run tauri dev
```

1. **Open Developer Tools** (View → Developer → Toggle Developer Tools)
2. Go to Console tab
3. In VibeCast:
   - Create Photo Slideshow preset
   - Select "Local Folder"
   - Click "Browse..." and select `/Users/zayenz/Desktop/nyårsgängetgenomåren`
4. **Watch logs** in both:
   - Browser console (frontend logs)
   - Terminal (backend logs)

Expected logs:
```
[Photo Slideshow] Loading images...
Listing images in folder: /Users/zayenz/Desktop/nyårsgängetgenomåren
Found X images in folder
[Photo Slideshow] Successfully loaded X images from local
```

If you see an error, it will tell you exactly what's wrong.

### Test 2: Apple Photos Album

1. Open album selector
2. Search for a regular album (e.g., "Typ" or "Instagram")
3. Select it
4. **Watch logs**

Expected logs:
```
[Photo Slideshow] Getting photos from album: Typ
Exporting photos from album: Typ
Using cached photo list... (if cached)
OR
No valid cache found, exporting photos...
Exported X photos from album
```

### Test 3: Find Missing Albums

1. Open album selector
2. Search for `inskannade`
3. Search for `nyår`

If albums still don't appear:
- They might be in a special category not accessible via AppleScript
- Try the manual export workaround (see below)

## Workarounds

### If Albums Not Found

**Manual Export Method:**
1. Open Photos.app
2. Find "Inskannade bilder" album
3. Select All (Cmd+A)
4. File → Export → Export X Photos
5. Choose destination: `/Users/zayenz/Desktop/inskannade`
6. In VibeCast:
   - Select "Local Folder"
   - Browse to `/Users/zayenz/Desktop/inskannade`

This always works!

### If Local Folder Has Issues

**Check the path:**
```bash
# List the folder
ls -la /Users/zayenz/Desktop/nyårsgängetgenomåren

# Count images
ls /Users/zayenz/Desktop/nyårsgängetgenomåren/*.{jpg,png,JPG,PNG} 2>/dev/null | wc -l
```

**If folder name has special characters:**
- macOS should handle å, ä, ö fine
- But use Browse button, don't type the path
- Or rename folder to ASCII-only: `nyarsganget`

## What to Report

If you still have issues, please provide:

1. **Browser console logs** (everything with `[Photo Slideshow]`)
2. **Terminal output** (everything with `Listing images` or `Exporting photos`)
3. **Screenshot** of the error state
4. **Which test failed** (local folder or album)
5. **Path you're trying to use**

This will help diagnose the exact issue.

## Known Limitations

1. **Shared Albums via AppleScript**
   - May not be accessible depending on macOS version
   - Manual export workaround always works

2. **First-time Album Export**
   - Can take several minutes for large albums
   - Shows loading screen with progress
   - Subsequent loads are fast (cached)

3. **Special Characters**
   - Should work but use Browse button
   - macOS handles UTF-8 paths correctly
   - If issues, try ASCII-only folder names

## Next Steps

Run the tests above and check the logs. The detailed logging will show exactly where it's failing, then we can fix the specific issue.

