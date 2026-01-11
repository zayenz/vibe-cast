use std::sync::Arc;
use tauri::{Manager, Emitter};
use local_ip_address::local_ip;
use vibe_cast_audio::AudioState;
use vibe_cast_state::AppStateSync;
use vibe_cast_models::{
    MessageConfig, VisualizationPreset, TextStylePreset, 
    CommonSettings, flatten_message_tree_value
};

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

/// Helper function to resolve paths relative to config base path
fn resolve_path(path: &str, base_path: Option<&str>) -> String {
    use std::path::Path;
    let p = Path::new(path);
    
    // If absolute, return as-is
    if p.is_absolute() {
        return path.to_string();
    }
    
    // If relative and we have a base path, resolve it
    if let Some(base) = base_path {
        let base_path = Path::new(base);
        let resolved = base_path.join(path);
        return resolved.to_string_lossy().to_string();
    }
    
    // No base path, return as-is
    path.to_string()
}

#[tauri::command]
fn set_config_base_path(
    state: tauri::State<'_, Arc<AppStateSync>>,
    path: Option<String>
) -> Result<(), String> {
    eprintln!("[Rust] set_config_base_path command called with: {:?}", path);
    if let Ok(mut p) = state.config_base_path.lock() {
        *p = path.clone();
        eprintln!("[Rust] Config base path set successfully to: {:?}", path);
        Ok(())
    } else {
        eprintln!("[Rust] ERROR: Failed to lock config_base_path");
        Err("Failed to lock config_base_path".to_string())
    }
}

#[tauri::command]
fn get_config_base_path(
    state: tauri::State<'_, Arc<AppStateSync>>
) -> Result<Option<String>, String> {
    match state.config_base_path.lock() {
        Ok(p) => {
            let path = p.clone();
            eprintln!("[Rust] get_config_base_path returning: {:?}", path);
            Ok(path)
        }
        Err(_) => {
            eprintln!("[Rust] ERROR: Failed to lock config_base_path for reading");
            Err("Failed to lock config_base_path".to_string())
        }
    }
}

#[tauri::command]
fn load_message_text_file(
    state: tauri::State<'_, Arc<AppStateSync>>,
    file_path: String
) -> Result<String, String> {
    use std::fs;
    let base_path_opt = state.config_base_path.lock() 
        .ok()
        .and_then(|p| p.clone());
    
    eprintln!("[Rust] load_message_text_file called");
    eprintln!("[Rust]   file_path: {}", file_path);
    eprintln!("[Rust]   base_path: {:?}", base_path_opt);
    
    let resolved = resolve_path(&file_path, base_path_opt.as_deref());
    eprintln!("[Rust]   resolved path: {}", resolved);
    
    match fs::read_to_string(&resolved) {
        Ok(content) => {
            eprintln!("[Rust]   Successfully read file, length: {}", content.len());
            Ok(content)
        }
        Err(e) => {
            eprintln!("[Rust]   ERROR reading file: {}", e);
            Err(format!("Failed to read file '{}': {}", resolved, e))
        }
    }
}

#[tauri::command]
fn restart_viz_window(handle: tauri::AppHandle) -> Result<(), String> {
    // Close existing viz window (if any)
    let mut prev_pos: Option<tauri::PhysicalPosition<i32>> = None;
    let mut prev_size: Option<tauri::PhysicalSize<u32>> = None;
    if let Some(w) = handle.get_webview_window("viz") {
        prev_pos = w.outer_position().ok();
        prev_size = w.inner_size().ok();
        let _ = w.close();
    }

    // Recreate it pointing at the app index route. The App component will route by window label.
    let mut builder = tauri::WebviewWindowBuilder::new(&handle, "viz", tauri::WebviewUrl::App("index.html".into()))
        .title("VibeCast")
        .resizable(true)
        ;

    if let Some(size) = prev_size {
        builder = builder.inner_size(size.width as f64, size.height as f64);
    } else {
        builder = builder.inner_size(1280.0, 720.0);
    }

    if let Some(pos) = prev_pos {
        builder = builder.position(pos.x as f64, pos.y as f64);
    }

    builder.build().map_err(|e| e.to_string())?;

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
        "SET_CONFIG_BASE_PATH" => {
            let path_opt = if payload_value.is_null() {
                None
            } else {
                payload_value.as_str().map(|s| s.to_string())
            };
            eprintln!("[Rust] Setting config base path to: {:?}", path_opt);
            if let Ok(mut m) = state.config_base_path.lock() {
                *m = path_opt;
                eprintln!("[Rust] Config base path successfully set");
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
                // Message tree (folders) - canonical ordering/structure if present
                if let Some(tree) = obj.get("messageTree") {
                    if let Ok(mut t) = state.message_tree.lock() {
                        *t = tree.clone();
                    }
                    // Ensure flattened messages match tree
                    let flat = flatten_message_tree_value(tree);
                    if let Ok(mut m) = state.messages.lock() {
                        *m = flat;
                    }
                } else {
                    // If no tree was provided, keep a flat tree representation of messages
                    if let Ok(m) = state.messages.lock() {
                        if let Ok(mut t) = state.message_tree.lock() {
                            *t = serde_json::json!(
                                m.iter()
                                    .map(|msg| serde_json::json!({ 
                                        "type": "message", 
                                        "id": msg.id, 
                                        "message": msg 
                                    }))
                                    .collect::<Vec<serde_json::Value>>()
                            );
                        }
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
fn list_images_in_folder(
    state: tauri::State<'_, Arc<AppStateSync>>,
    folder_path: String
) -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;
    
    eprintln!("Listing media files in folder: {}", folder_path);
    
    // Resolve path relative to config base path
    let base_path_opt = state.config_base_path.lock() 
        .ok()
        .and_then(|p| p.clone());
    let resolved = resolve_path(&folder_path, base_path_opt.as_deref());
    
    eprintln!("Resolved path: {}", resolved);
    
    let path = Path::new(&resolved);
    if !path.exists() {
        eprintln!("ERROR: Folder does not exist: {}", resolved);
        return Err(format!("Folder does not exist: {}", resolved));
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
            for entry in entries.flatten() {
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
            set_config_base_path,
            get_config_base_path,
            load_message_text_file,
            list_images_in_folder
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            
            // Create shared app state for syncing
            let app_state_sync = Arc::new(AppStateSync::new());
            
            // Parse command-line arguments for config file
            // Note: We use --app-config to avoid conflict with Tauri's --config flag
            let args: Vec<String> = std::env::args().collect();
            eprintln!("Command-line arguments: {:?}", args);
            
            // Debug: Print all environment variables that start with VIBECAST
            eprintln!("Environment variables containing 'VIBECAST':");
            for (key, value) in std::env::vars() {
                if key.contains("VIBECAST") {
                    eprintln!("  {} = {}", key, value);
                }
            }
            
            let mut config_path: Option<String> = None;
            
            for i in 0..args.len() {
                // Use --app-config to avoid conflict with Tauri's --config
                if (args[i] == "--app-config" || args[i] == "--appconfig") && i + 1 < args.len() {
                    config_path = Some(args[i + 1].clone());
                    eprintln!("Found app config path argument: {}", args[i + 1]);
                }
            }
            
            // Also check for environment variable (primary method, more reliable)
            if config_path.is_none() {
                match std::env::var("VIBECAST_CONFIG") {
                    Ok(env_path) => {
                        config_path = Some(env_path);
                        eprintln!("Found config path from environment variable: {}", config_path.as_ref().unwrap());
                    }
                    Err(std::env::VarError::NotPresent) => {
                        eprintln!("VIBECAST_CONFIG environment variable not set");
                    }
                    Err(e) => {
                        eprintln!("Error reading VIBECAST_CONFIG: {:?}", e);
                    }
                }
            }
            
            // Load config if provided
            if let Some(path) = config_path {
                eprintln!("Attempting to load config from: {}", path);
                match app_state_sync.load_config_from_file(&path) {
                    Ok(_) => {
                        eprintln!("Successfully loaded config from: {}", path);
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to load config from {}: {}", path, e);
                    }
                }
            } else {
                eprintln!("No config file specified (use --app-config <path> or set VIBECAST_CONFIG env var)");
            }
            
            app.manage(app_state_sync.clone());
            
            // Start audio capture and manage the state to keep the stream alive
            let audio_state = vibe_cast_audio::start_audio_capture(handle);
            app.manage(audio_state);

            // Start LAN server with shared state
            let handle = app.handle().clone();
            let server_state = app_state_sync.clone();
            tauri::async_runtime::spawn(async move {
                vibe_cast_server::start_server(handle, server_state, 8080).await;
            });

            // In production, recreate windows to use HTTP URLs (for YouTube compatibility)
            // This ensures windows load from HTTP like in development
            if !cfg!(debug_assertions) {
                // Hide windows immediately to prevent visible close/reopen
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.hide();
                }
                if let Some(viz_window) = app.get_webview_window("viz") {
                    let _ = viz_window.hide();
                }
                
                let handle = app.handle().clone();
                let state_for_windows = app_state_sync.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait for server to start and bind (reduced from 1000ms)
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    
                    // Get the server port
                    let port = state_for_windows.server_port.lock() 
                        .map(|p| *p)
                        .unwrap_or(8080);
                    
                    let http_url = format!("http://localhost:{}", port);
                    eprintln!("[Setup] Recreating windows to use HTTP URL: {}", http_url);
                    
                    let mut main_window_handle = None;
                    let mut viz_window_handle = None;
                    
                    // Recreate main window
                    if let Some(main_window) = handle.get_webview_window("main") {
                        let prev_pos = main_window.outer_position().ok();
                        let prev_size = main_window.inner_size().ok();
                        let _ = main_window.close();
                        
                        // Small delay to ensure window closes
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        
                        let mut builder = tauri::WebviewWindowBuilder::new(
                            &handle,
                            "main",
                            tauri::WebviewUrl::External(http_url.parse().expect("Invalid HTTP URL"))
                        )
                        .title("Control Plane")
                        .resizable(true)
                        .visible(false); // Create hidden
                        
                        if let Some(size) = prev_size {
                            builder = builder.inner_size(size.width as f64, size.height as f64);
                        } else {
                            builder = builder.inner_size(800.0, 600.0);
                        }
                        
                        if let Some(pos) = prev_pos {
                            builder = builder.position(pos.x as f64, pos.y as f64);
                        }
                        
                        match builder.build() {
                            Ok(window) => {
                                main_window_handle = Some(window);
                            }
                            Err(e) => {
                                eprintln!("[Setup] Failed to recreate main window: {}", e);
                            }
                        }
                    }
                    
                    // Recreate viz window
                    if let Some(viz_window) = handle.get_webview_window("viz") {
                        let prev_pos = viz_window.outer_position().ok();
                        let prev_size = viz_window.inner_size().ok();
                        let _ = viz_window.close();
                        
                        // Small delay to ensure window closes
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        
                        let mut builder = tauri::WebviewWindowBuilder::new(
                            &handle,
                            "viz",
                            tauri::WebviewUrl::External(http_url.parse().expect("Invalid HTTP URL"))
                        )
                        .title("VibeCast")
                        .resizable(true)
                        .decorations(true)
                        .visible(false); // Create hidden
                        
                        if let Some(size) = prev_size {
                            builder = builder.inner_size(size.width as f64, size.height as f64);
                        } else {
                            builder = builder.inner_size(1280.0, 720.0);
                        }
                        
                        if let Some(pos) = prev_pos {
                            builder = builder.position(pos.x as f64, pos.y as f64);
                        }
                        
                        match builder.build() {
                            Ok(window) => {
                                viz_window_handle = Some(window);
                            }
                            Err(e) => {
                                eprintln!("[Setup] Failed to recreate viz window: {}", e);
                            }
                        }
                    }
                    
                    // Show both windows together once they're ready
                    if let Some(window) = main_window_handle {
                        let _ = window.show();
                    }
                    if let Some(window) = viz_window_handle {
                        let _ = window.show();
                    }
                });
            }

            // Ensure we have the windows
            let _main_window = app.get_webview_window("main").unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
