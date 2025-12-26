mod audio;
mod server;

use std::sync::{Arc, Mutex};
use tauri::{Manager, Emitter};
use local_ip_address::local_ip;
use tokio::sync::broadcast;
use crate::audio::AudioState;

fn flatten_message_tree_value(tree: &serde_json::Value) -> Vec<MessageConfig> {
    fn walk(node: &serde_json::Value, out: &mut Vec<MessageConfig>) {
        match node {
            serde_json::Value::Array(arr) => {
                for n in arr {
                    walk(n, out);
                }
            }
            serde_json::Value::Object(obj) => {
                if let Some(t) = obj.get("type").and_then(|v| v.as_str()) {
                    match t {
                        "message" => {
                            if let Some(msg_val) = obj.get("message") {
                                if let Ok(msg) = serde_json::from_value::<MessageConfig>(msg_val.clone()) {
                                    out.push(msg);
                                }
                            }
                        }
                        "folder" => {
                            if let Some(children) = obj.get("children") {
                                walk(children, out);
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    let mut out = vec![];
    walk(tree, &mut out);
    out
}

/// Message configuration matching the frontend MessageConfig type
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageConfig {
    pub id: String,
    pub text: String,
    pub text_style: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_style_preset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_overrides: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
}

/// Visualization preset matching the frontend VisualizationPreset type
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VisualizationPreset {
    pub id: String,
    pub name: String,
    pub visualization_id: String,
    pub settings: serde_json::Value,
}

/// Text style preset matching the frontend TextStylePreset type
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TextStylePreset {
    pub id: String,
    pub name: String,
    pub text_style_id: String,
    pub settings: serde_json::Value,
}

/// Message statistics matching the frontend MessageStats type
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageStats {
    pub message_id: String,
    pub trigger_count: u32,
    pub last_triggered: u64,
    pub history: Vec<TriggerHistory>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TriggerHistory {
    pub timestamp: u64,
}

/// Common visualization settings
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct CommonSettings {
    pub intensity: f64,
    pub dim: f64,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            intensity: 1.0,
            dim: 1.0,
        }
    }
}

/// Application state that gets broadcast via SSE
#[derive(Clone, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastState {
    pub active_visualization: String,
    pub enabled_visualizations: Vec<String>,
    pub common_settings: CommonSettings,
    pub visualization_settings: serde_json::Value,
    pub visualization_presets: Vec<VisualizationPreset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_visualization_preset: Option<String>,
    pub messages: Vec<MessageConfig>,
    /// Optional message tree (folders). When present, UI should use this as canonical ordering.
    pub message_tree: serde_json::Value,
    pub default_text_style: String,
    pub text_style_settings: serde_json::Value,
    pub text_style_presets: Vec<TextStylePreset>,
    pub message_stats: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub triggered_message: Option<MessageConfig>,
    // Legacy compatibility
    pub mode: String,
}

/// Shared application state for syncing between windows and the remote
pub struct AppStateSync {
    pub active_visualization: Mutex<String>,
    pub enabled_visualizations: Mutex<Vec<String>>,
    pub common_settings: Mutex<CommonSettings>,
    pub visualization_settings: Mutex<serde_json::Value>,
    pub visualization_presets: Mutex<Vec<VisualizationPreset>>,
    pub active_visualization_preset: Mutex<Option<String>>,
    pub messages: Mutex<Vec<MessageConfig>>,
    pub message_tree: Mutex<serde_json::Value>,
    pub default_text_style: Mutex<String>,
    pub text_style_settings: Mutex<serde_json::Value>,
    pub text_style_presets: Mutex<Vec<TextStylePreset>>,
    pub message_stats: Mutex<serde_json::Value>,
    pub server_port: Mutex<u16>,
    /// Broadcast channel for SSE - sends full state on every change
    pub state_tx: broadcast::Sender<BroadcastState>,
}

impl Default for AppStateSync {
    fn default() -> Self {
        Self::new()
    }
}

impl AppStateSync {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(64);
        
        // Default messages
        let default_messages = vec![
            MessageConfig {
                id: "1".to_string(),
                text: "Hello World!".to_string(),
                text_style: "scrolling-capitals".to_string(),
                text_style_preset: None,
                style_overrides: None,
                repeat_count: None,
                speed: None,
            },
            MessageConfig {
                id: "2".to_string(),
                text: "Keep it calm...".to_string(),
                text_style: "fade".to_string(),
                text_style_preset: None,
                style_overrides: None,
                repeat_count: None,
                speed: None,
            },
            MessageConfig {
                id: "3".to_string(),
                text: "TECHNO TIME".to_string(),
                text_style: "scrolling-capitals".to_string(),
                text_style_preset: None,
                style_overrides: None,
                repeat_count: None,
                speed: None,
            },
        ];

        // Default message tree: flat list of messages
        let default_message_tree = serde_json::json!(
            default_messages
                .iter()
                .map(|m| serde_json::json!({
                    "type": "message",
                    "id": m.id,
                    "message": m
                }))
                .collect::<Vec<serde_json::Value>>()
        );
        
        Self {
            active_visualization: Mutex::new("fireplace".to_string()),
            enabled_visualizations: Mutex::new(vec!["fireplace".to_string(), "techno".to_string()]),
            common_settings: Mutex::new(CommonSettings::default()),
            visualization_settings: Mutex::new(serde_json::json!({})),
            visualization_presets: Mutex::new(vec![]),
            active_visualization_preset: Mutex::new(None),
            messages: Mutex::new(default_messages),
            message_tree: Mutex::new(default_message_tree),
            default_text_style: Mutex::new("scrolling-capitals".to_string()),
            text_style_settings: Mutex::new(serde_json::json!({})),
            text_style_presets: Mutex::new(vec![]),
            message_stats: Mutex::new(serde_json::json!({})),
            server_port: Mutex::new(8080),
            state_tx,
        }
    }

    /// Get current state snapshot
    pub fn get_state(&self) -> BroadcastState {
        let active_visualization = self.active_visualization.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| "fireplace".to_string());
        let enabled_visualizations = self.enabled_visualizations.lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let common_settings = self.common_settings.lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let visualization_settings = self.visualization_settings.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        let visualization_presets = self.visualization_presets.lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let active_visualization_preset = self.active_visualization_preset.lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        let messages = self.messages.lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let message_tree = self.message_tree.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!([]));
        let default_text_style = self.default_text_style.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| "scrolling-capitals".to_string());
        let text_style_settings = self.text_style_settings.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        let text_style_presets = self.text_style_presets.lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let message_stats = self.message_stats.lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        
        // Legacy mode field
        let mode = active_visualization.clone();
        
        BroadcastState {
            active_visualization,
            enabled_visualizations,
            common_settings,
            visualization_settings,
            visualization_presets,
            active_visualization_preset,
            messages,
            message_tree,
            default_text_style,
            text_style_settings,
            text_style_presets,
            message_stats,
            triggered_message: None,
            mode,
        }
    }

    /// Broadcast current state to all SSE subscribers
    pub fn broadcast(&self, triggered_message: Option<MessageConfig>) {
        let mut state = self.get_state();
        state.triggered_message = triggered_message;
        // Ignore send errors (no subscribers)
        let _ = self.state_tx.send(state);
    }
}

#[tauri::command]
fn get_server_info(state: tauri::State<'_, Arc<AppStateSync>>) -> serde_json::Value {
    let my_local_ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = state.server_port.lock().map(|p| *p).unwrap_or(8080);
    serde_json::json!({
        "ip": my_local_ip,
        "port": port
    })
}

#[tauri::command]
fn get_audio_data(state: tauri::State<'_, AudioState>) -> Vec<f32> {
    match state.fft_data.lock() {
        Ok(data) => data.clone(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn restart_viz_window(handle: tauri::AppHandle) -> Result<(), String> {
    // Close existing viz window (if any)
    if let Some(w) = handle.get_webview_window("viz") {
        let _ = w.close();
    }

    // Recreate it pointing at the app index route. The App component will route by window label.
    tauri::WebviewWindowBuilder::new(&handle, "viz", tauri::WebviewUrl::App("index.html".into()))
        .title("VibeCast")
        .inner_size(1280.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn emit_state_change(
    handle: tauri::AppHandle, 
    state: tauri::State<'_, Arc<AppStateSync>>,
    event_type: String, 
    payload: String  // JSON string from frontend
) {
    let mut triggered_message: Option<MessageConfig> = None;
    
    // Parse the payload
    let payload_value: serde_json::Value = serde_json::from_str(&payload)
        .unwrap_or(serde_json::Value::Null);
    
    // Update local state based on event type
    match event_type.as_str() {
        "SET_ACTIVE_VISUALIZATION" => {
            if let Some(viz) = payload_value.as_str() {
                if let Ok(mut m) = state.active_visualization.lock() {
                    *m = viz.to_string();
                }
            }
        }
        "SET_ENABLED_VISUALIZATIONS" => {
            if let Some(vizs) = payload_value.as_array() {
                if let Ok(mut m) = state.enabled_visualizations.lock() {
                    *m = vizs.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
        }
        "SET_COMMON_SETTINGS" => {
            if let Ok(settings) = serde_json::from_value::<CommonSettings>(payload_value.clone()) {
                if let Ok(mut m) = state.common_settings.lock() {
                    *m = settings;
                }
            }
        }
        "SET_VISUALIZATION_SETTINGS" => {
            if let Ok(mut m) = state.visualization_settings.lock() {
                *m = payload_value.clone();
            }
        }
        "SET_MESSAGES" => {
            if let Ok(messages) = serde_json::from_value::<Vec<MessageConfig>>(payload_value.clone()) {
                if let Ok(mut m) = state.messages.lock() {
                    *m = messages;
                }
            }
        }
        "SET_MESSAGE_TREE" => {
            if let Ok(mut t) = state.message_tree.lock() {
                *t = payload_value.clone();
            }
            // Keep flat messages in sync for legacy consumers
            let flat = flatten_message_tree_value(&payload_value);
            if let Ok(mut m) = state.messages.lock() {
                *m = flat;
            }
        }
        "RESET_MESSAGE_STATS" => {
            if let Ok(mut m) = state.message_stats.lock() {
                *m = serde_json::json!({});
            }
        }
        "TRIGGER_MESSAGE" => {
            if let Ok(msg) = serde_json::from_value::<MessageConfig>(payload_value.clone()) {
                triggered_message = Some(msg);
            }
        }
        "SET_DEFAULT_TEXT_STYLE" => {
            if let Some(style) = payload_value.as_str() {
                if let Ok(mut m) = state.default_text_style.lock() {
                    *m = style.to_string();
                }
            }
        }
        "SET_TEXT_STYLE_SETTINGS" => {
            if let Ok(mut m) = state.text_style_settings.lock() {
                *m = payload_value.clone();
            }
        }
        "SET_VISUALIZATION_PRESETS" => {
            if let Ok(presets) = serde_json::from_value::<Vec<VisualizationPreset>>(payload_value.clone()) {
                if let Ok(mut m) = state.visualization_presets.lock() {
                    *m = presets;
                }
            }
        }
        "SET_ACTIVE_VISUALIZATION_PRESET" => {
            if payload_value.is_null() {
                if let Ok(mut m) = state.active_visualization_preset.lock() {
                    *m = None;
                }
            } else if let Some(preset_id) = payload_value.as_str() {
                if let Ok(mut m) = state.active_visualization_preset.lock() {
                    *m = Some(preset_id.to_string());
                }
                // Also update active visualization based on preset
                if let Ok(presets) = state.visualization_presets.lock() {
                    if let Some(preset) = presets.iter().find(|p| p.id == preset_id) {
                        if let Ok(mut m) = state.active_visualization.lock() {
                            *m = preset.visualization_id.clone();
                        }
                    }
                }
            }
        }
        "SET_TEXT_STYLE_PRESETS" => {
            if let Ok(presets) = serde_json::from_value::<Vec<TextStylePreset>>(payload_value.clone()) {
                if let Ok(mut m) = state.text_style_presets.lock() {
                    *m = presets;
                }
            }
        }
        "CLEAR_ACTIVE_MESSAGE" => {
            // This is handled on the frontend, but we can acknowledge it
            // The actual clearing happens in the VisualizerWindow
        }
        "LOAD_CONFIGURATION" => {
            // Full configuration load
            if let Some(obj) = payload_value.as_object() {
                if let Some(viz) = obj.get("activeVisualization").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.active_visualization.lock() {
                        *m = viz.to_string();
                    }
                }
                if let Some(vizs) = obj.get("enabledVisualizations").and_then(|v| v.as_array()) {
                    if let Ok(mut m) = state.enabled_visualizations.lock() {
                        *m = vizs.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect();
                    }
                }
                if let Some(settings) = obj.get("commonSettings") {
                    if let Ok(s) = serde_json::from_value::<CommonSettings>(settings.clone()) {
                        if let Ok(mut m) = state.common_settings.lock() {
                            *m = s;
                        }
                    }
                }
                if let Some(settings) = obj.get("visualizationSettings") {
                    if let Ok(mut m) = state.visualization_settings.lock() {
                        *m = settings.clone();
                    }
                }
                if let Some(msgs) = obj.get("messages") {
                    if let Ok(messages) = serde_json::from_value::<Vec<MessageConfig>>(msgs.clone()) {
                        if let Ok(mut m) = state.messages.lock() {
                            *m = messages;
                        }
                    }
                }
                if let Some(tree) = obj.get("messageTree") {
                    if let Ok(mut t) = state.message_tree.lock() {
                        *t = tree.clone();
                    }
                }
                if let Some(style) = obj.get("defaultTextStyle").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.default_text_style.lock() {
                        *m = style.to_string();
                    }
                }
                if let Some(settings) = obj.get("textStyleSettings") {
                    if let Ok(mut m) = state.text_style_settings.lock() {
                        *m = settings.clone();
                    }
                }
                if let Some(presets) = obj.get("visualizationPresets") {
                    if let Ok(p) = serde_json::from_value::<Vec<VisualizationPreset>>(presets.clone()) {
                        if let Ok(mut m) = state.visualization_presets.lock() {
                            *m = p;
                        }
                    }
                }
                if let Some(preset_id) = obj.get("activeVisualizationPreset").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.active_visualization_preset.lock() {
                        *m = Some(preset_id.to_string());
                    }
                }
                if let Some(presets) = obj.get("textStylePresets") {
                    if let Ok(p) = serde_json::from_value::<Vec<TextStylePreset>>(presets.clone()) {
                        if let Ok(mut m) = state.text_style_presets.lock() {
                            *m = p;
                        }
                    }
                }
                if let Some(stats) = obj.get("messageStats") {
                    if let Ok(mut m) = state.message_stats.lock() {
                        *m = stats.clone();
                    }
                }
            }
        }
        // Legacy support for old event types
        "SET_MODE" => {
            if let Some(mode) = payload_value.as_str() {
                if let Ok(mut m) = state.active_visualization.lock() {
                    *m = mode.to_string();
                }
            }
        }
        _ => {}
    }
    
    // Broadcast state change to all SSE subscribers
    state.broadcast(triggered_message.clone());
    
    // Also emit to all Tauri windows (for VibeCast which uses Tauri events for audio sync)
    let _ = handle.emit("state-changed", serde_json::json!({
        "type": event_type,
        "payload": payload_value
    }));
}

#[tauri::command]
fn list_images_in_folder(folder_path: String) -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;
    
    eprintln!("Listing media files in folder: {}", folder_path);
    
    let path = Path::new(&folder_path);
    if !path.exists() {
        eprintln!("ERROR: Folder does not exist: {}", folder_path);
        return Err(format!("Folder does not exist: {}", folder_path));
    }
    
    if !path.is_dir() {
        eprintln!("ERROR: Path is not a directory: {}", folder_path);
        return Err(format!("Path is not a directory: {}", folder_path));
    }
    
    let mut media_files = Vec::new();
    let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
    let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
    
    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        if let Some(ext) = entry_path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            if image_extensions.contains(&ext_str.as_str()) || video_extensions.contains(&ext_str.as_str()) {
                                if let Some(path_str) = entry_path.to_str() {
                                    media_files.push(path_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
            media_files.sort();
            eprintln!("Found {} media files in folder", media_files.len());
            if media_files.is_empty() {
                eprintln!("WARNING: No media files found in folder");
            } else {
                eprintln!("First file: {}", media_files[0]);
            }
            Ok(media_files)
        }
        Err(e) => {
            eprintln!("ERROR: Failed to read directory: {}", e);
            Err(format!("Failed to read directory: {}", e))
        }
    }
}

#[tauri::command]
async fn get_photos_albums(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_shell::ShellExt;
        
        eprintln!("=== get_photos_albums CALLED ===");
        
        // First, get regular albums and folder albums
        let script = r#"
tell application "Photos"
    set albumNames to {}
    
    -- Get regular albums (top-level)
    repeat with anAlbum in albums
        set end of albumNames to name of anAlbum
    end repeat
    
    -- Get folders and albums inside folders
    -- We use "FOLDER:albumname" format to identify folder albums
    repeat with aFolder in folders
        try
            repeat with anAlbum in albums of aFolder
                set end of albumNames to ("FOLDER:" & (name of aFolder) & ":" & (name of anAlbum))
            end repeat
        end try
    end repeat
    
    set AppleScript's text item delimiters to "|"
    set albumString to albumNames as text
    set AppleScript's text item delimiters to ""
    return albumString
end tell
        "#;
        
        let shell = app.shell();
        let output = shell.command("osascript")
            .args(["-e", script])
            .output()
            .await
            .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;
        
        let mut all_albums: Vec<String> = Vec::new();
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            for album in stdout.trim().split('|').filter(|s| !s.is_empty()) {
                let album = album.trim();
                if album.starts_with("FOLDER:") {
                    // Parse "FOLDER:foldername:albumname" format
                    let parts: Vec<&str> = album.splitn(3, ':').collect();
                    if parts.len() == 3 {
                        // Display as "foldername / albumname" but keep the FOLDER: prefix internally
                        all_albums.push(format!("{} / {}", parts[1], parts[2]));
                    }
                } else {
                    all_albums.push(album.to_string());
                }
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("AppleScript stderr for albums: {}", stderr);
        }
        
        // Try to get shared albums (may not work on all macOS versions)
        let shared_script = r#"
tell application "Photos"
    set sharedNames to {}
    try
        -- Try to access containers which might include shared albums
        repeat with c in containers
            try
                set cName to name of c
                if cName is not in {"Photos", "People", "Places", "Imports", "Recently Deleted"} then
                    set end of sharedNames to ("SHARED:" & cName)
                end if
            end try
        end repeat
    end try
    
    set AppleScript's text item delimiters to "|"
    set sharedString to sharedNames as text
    set AppleScript's text item delimiters to ""
    return sharedString
end tell
        "#;
        
        let shared_output = shell.command("osascript")
            .args(["-e", shared_script])
            .output()
            .await;
        
        if let Ok(output) = shared_output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for album in stdout.trim().split('|').filter(|s| !s.is_empty()) {
                    let album = album.trim();
                    if album.starts_with("SHARED:") {
                        let name = &album[7..];
                        if !all_albums.contains(&name.to_string()) {
                            all_albums.push(format!("[Shared] {}", name));
                        }
                    }
                }
            }
        }
        
        eprintln!("Found {} albums total", all_albums.len());
        Ok(all_albums)
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err("Apple Photos is only available on macOS".to_string())
    }
}

#[tauri::command]
async fn get_photos_from_album(app: tauri::AppHandle, album_name: String) -> Result<Vec<String>, String> {
    eprintln!("=== get_photos_from_album CALLED with album: {} ===", album_name);
    
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_shell::ShellExt;
        
        // Create temp directory for exports
        let temp_dir = std::env::temp_dir().join("vibecast_photos");
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
        let temp_path = temp_dir.to_string_lossy().to_string();
        
        // Generate cache key
        let cache_key: String = album_name.chars()
            .filter(|c| c.is_alphanumeric() || *c == ' ')
            .collect::<String>()
            .replace(' ', "_");
        let cache_file = temp_dir.join(format!("cache_{}.txt", cache_key));
        
        eprintln!("Album: {}, Cache: {:?}", album_name, cache_file);
        
        // Check cache (valid for 1 hour)
        if cache_file.exists() {
            if let Ok(metadata) = std::fs::metadata(&cache_file) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() < 3600 {
                            if let Ok(content) = std::fs::read_to_string(&cache_file) {
                                let photos: Vec<String> = content.split('|')
                                    .filter(|s| !s.is_empty())
                                    .map(|s| s.to_string())
                                    .collect();
                                if !photos.is_empty() {
                                    eprintln!("Using cached {} photos", photos.len());
                                    return Ok(photos);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Parse album name to determine type and generate correct AppleScript
        let (is_shared, is_folder_album, folder_name, actual_album_name) = if album_name.starts_with("[Shared] ") {
            (true, false, String::new(), album_name[9..].to_string())
        } else if album_name.contains(" / ") {
            // Format: "FolderName / AlbumName"
            let parts: Vec<&str> = album_name.splitn(2, " / ").collect();
            if parts.len() == 2 {
                (false, true, parts[0].to_string(), parts[1].to_string())
            } else {
                (false, false, String::new(), album_name.clone())
            }
        } else {
            (false, false, String::new(), album_name.clone())
        };
        
        eprintln!("Parsed: is_shared={}, is_folder={}, folder={:?}, album={:?}", 
                  is_shared, is_folder_album, folder_name, actual_album_name);
        
        // Build the AppleScript to get and export photos
        let album_accessor = if is_folder_album {
            format!(r#"album "{}" of folder "{}""#, 
                    actual_album_name.replace("\"", "\\\""),
                    folder_name.replace("\"", "\\\""))
        } else if is_shared {
            // Shared albums might need different access
            format!(r#"container "{}""#, actual_album_name.replace("\"", "\\\""))
        } else {
            format!(r#"album "{}""#, actual_album_name.replace("\"", "\\\""))
        };
        
        eprintln!("Album accessor: {}", album_accessor);
        
        // First, try to get photo count to verify album exists
        let count_script = format!(r#"
tell application "Photos"
    try
        set theAlbum to {}
        set photoCount to count of media items of theAlbum
        return photoCount
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell
        "#, album_accessor);
        
        let shell = app.shell();
        let count_output = shell.command("osascript")
            .args(["-e", &count_script])
            .output()
            .await
            .map_err(|e| format!("Failed to check album: {}", e))?;
        
        let count_str = String::from_utf8_lossy(&count_output.stdout).trim().to_string();
        eprintln!("Album photo count result: {}", count_str);
        
        if count_str.starts_with("ERROR:") {
            return Err(format!("Album not found or inaccessible: {}", &count_str[6..]));
        }
        
        let photo_count: usize = count_str.parse().unwrap_or(0);
        if photo_count == 0 {
            return Err("Album is empty or not found".to_string());
        }
        
        eprintln!("Album has {} photos, starting export...", photo_count);
        
        // Now export the photos
        let export_script = format!(r#"
tell application "Photos"
    set theAlbum to {}
    set photoList to {{}}
    set exportFolder to POSIX file "{}" as alias
    
    repeat with aPhoto in media items of theAlbum
        try
            set exportedFiles to export {{aPhoto}} to exportFolder with using originals
            repeat with exportedFile in exportedFiles
                set end of photoList to POSIX path of exportedFile
            end repeat
        on error errMsg
            -- Log but continue
        end try
    end repeat
    
    set AppleScript's text item delimiters to "|"
    set photoString to photoList as text
    set AppleScript's text item delimiters to ""
    return photoString
end tell
        "#, album_accessor, temp_path.replace("\"", "\\\""));
        
        eprintln!("Executing export script ({} photos)...", photo_count);
        
        let output = shell.command("osascript")
            .args(["-e", &export_script])
            .output()
            .await
            .map_err(|e| format!("Export failed: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("Export error: {}", stderr);
            return Err(format!("Export error: {}", stderr));
        }
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let photos: Vec<String> = stdout.trim()
            .split('|')
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect();
        
        eprintln!("Exported {} photos successfully", photos.len());
        
        // Cache the result
        if !photos.is_empty() {
            let _ = std::fs::write(&cache_file, stdout.as_ref());
        }
        
        Ok(photos)
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err("Apple Photos is only available on macOS".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            get_audio_data,
            restart_viz_window,
            emit_state_change,
            list_images_in_folder,
            get_photos_albums,
            get_photos_from_album
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            
            // Create shared app state for syncing
            let app_state_sync = Arc::new(AppStateSync::new());
            app.manage(app_state_sync.clone());
            
            // Start audio capture and manage the state to keep the stream alive
            let audio_state = audio::start_audio_capture(handle);
            app.manage(audio_state);

            // Start LAN server with shared state
            let handle = app.handle().clone();
            let server_state = app_state_sync.clone();
            tauri::async_runtime::spawn(async move {
                server::start_server(handle, server_state, 8080).await;
            });

            // Ensure we have the windows
            let _main_window = app.get_webview_window("main").unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
