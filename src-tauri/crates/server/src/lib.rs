use axum::{
    extract::{Query, State},
    response::{
        sse::{Event, KeepAlive, Sse},
        Html, IntoResponse, Response,
    },
    routing::{get, post},
    http::{header, StatusCode},
    Json, Router,
};
use futures::{stream::Stream, StreamExt};
use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, path::BaseDirectory};
use tokio_stream::wrappers::BroadcastStream;
use tower_http::{cors::CorsLayer, services::{ServeDir, ServeFile}};

use vibe_cast_state::AppStateSync;
use vibe_cast_models::{
    BroadcastState, MessageConfig, CommonSettings, VisualizationPreset, 
    TextStylePreset, FolderPlaybackQueue, E2EReport, RemoteCommand
};

fn resolve_path(path: &str, base_path: Option<&str>) -> String {
    let p = Path::new(path);
    if p.is_absolute() {
        return path.to_string();
    }
    if let Some(base) = base_path {
        let base_path = Path::new(base);
        let resolved = base_path.join(path);
        return resolved.to_string_lossy().to_string();
    }
    path.to_string()
}

// ... (keep existing helper functions flatten_message_tree, build_flat_message_tree, collect_messages_from_folder) ...

fn flatten_message_tree(tree: &serde_json::Value) -> Vec<MessageConfig> {
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

    let mut out: Vec<MessageConfig> = vec![];
    walk(tree, &mut out);
    out
}

fn build_flat_message_tree(messages: &[MessageConfig]) -> serde_json::Value {
    serde_json::Value::Array(
        messages
            .iter()
            .map(|m| serde_json::json!({
                "type": "message",
                "id": m.id,
                "message": m
            }))
            .collect(),
    )
}

/// Collect all message IDs from a folder in the message tree
fn collect_messages_from_folder(folder_id: &str, tree: &serde_json::Value) -> Vec<String> {
    // First, find the folder node
    fn find_folder<'a>(folder_id: &str, node: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
        match node {
            serde_json::Value::Array(arr) => {
                for n in arr {
                    if let Some(found) = find_folder(folder_id, n) {
                        return Some(found);
                    }
                }
                None
            }
            serde_json::Value::Object(obj) => {
                if let Some(t) = obj.get("type").and_then(|v| v.as_str()) {
                    if t == "folder" {
                        if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                            if id == folder_id {
                                return Some(node);
                            }
                        }
                        // Check nested folders
                        if let Some(children) = obj.get("children") {
                            if let Some(found) = find_folder(folder_id, children) {
                                return Some(found);
                            }
                        }
                    }
                }
                None
            }
            _ => None,
        }
    }
    
    // Then, collect all message IDs from the folder
    fn collect_ids(node: &serde_json::Value, ids: &mut Vec<String>) {
        match node {
            serde_json::Value::Array(arr) => {
                for n in arr {
                    collect_ids(n, ids);
                }
            }
            serde_json::Value::Object(obj) => {
                if let Some(t) = obj.get("type").and_then(|v| v.as_str()) {
                    match t {
                        "message" => {
                            if let Some(msg) = obj.get("message") {
                                if let Some(id) = msg.get("id").and_then(|v| v.as_str()) {
                                    ids.push(id.to_string());
                                }
                            }
                        }
                        "folder" => {
                            if let Some(children) = obj.get("children") {
                                collect_ids(children, ids);
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    
    let mut ids = Vec::new();
    if let Some(folder) = find_folder(folder_id, tree) {
        if let Some(children) = folder.get("children") {
            collect_ids(children, &mut ids);
        }
    }
    ids
}

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
    app_state_sync: Arc<AppStateSync>,
    dist_path: std::path::PathBuf,
}

pub async fn start_server(app_handle: AppHandle, app_state_sync: Arc<AppStateSync>, port: u16) {
    let dist_path = if cfg!(debug_assertions) {
        let mut path = std::env::current_dir().unwrap();
        // Climb up until we find the project root (where package.json and src-tauri exist)
        while path.parent().is_some() && !(path.join("package.json").exists() && path.join("src-tauri").exists()) {
            path = path.parent().unwrap().to_path_buf();
        }
        path.join("dist")
    } else {
        app_handle
            .path()
            .resolve("dist", tauri::path::BaseDirectory::Resource)
            .expect("failed to resolve remote UI resources")
    };

    let state = AppState { 
        app_handle: app_handle.clone(),
        app_state_sync: app_state_sync.clone(),
        dist_path: dist_path.clone(),
    };
    let app_state_sync = state.app_state_sync.clone();

    // Log the dist path for debugging
    eprintln!("[Server] Serving static files from: {:?}", dist_path);
    eprintln!("[Server] Path exists: {}", dist_path.exists());
    if dist_path.exists() {
        if let Ok(entries) = std::fs::read_dir(&dist_path) {
            let count = entries.count();
            eprintln!("[Server] Directory contains {} entries", count);
        }
    }

    let app = Router::new()
        .route("/api/command", post(handle_command))
        .route("/api/state", get(get_state))
        .route("/api/status", get(get_status))
        .route("/api/events", get(state_events))
        .route("/api/e2e/report", post(handle_e2e_report))
        .route("/api/e2e/last-report", get(get_last_e2e_report))
        .route("/api/images/list", get(list_images))
        .route("/api/images/serve", get(serve_image))
        .route_service("/youtube_player.html", ServeFile::new(dist_path.join("youtube_player.html")))
        .nest_service("/assets", ServeDir::new(dist_path.join("assets")))
        .fallback(get(serve_spa))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Try a range of ports (helps when a previous instance is still running).
    let mut bound_listener: Option<(tokio::net::TcpListener, SocketAddr)> = None;
    for p in port..=port.saturating_add(20) {
        // Try binding to IPv6 [::] (which often covers IPv4 as well on dual-stack systems)
        // If that fails or isn't desired, we could fallback to IPv4.
        // For local development on macOS, localhost often resolves to ::1, so IPv6 support is crucial.
        let addr = SocketAddr::from((std::net::Ipv6Addr::UNSPECIFIED, p));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                bound_listener = Some((listener, addr));
                if let Ok(mut sp) = app_state_sync.server_port.lock() {
                    *sp = p;
                }
                break;
            }
            Err(_) => {
                // Fallback to IPv4 0.0.0.0 if IPv6 fails
                let addr_v4 = SocketAddr::from(([0, 0, 0, 0], p));
                match tokio::net::TcpListener::bind(addr_v4).await {
                    Ok(listener) => {
                        bound_listener = Some((listener, addr_v4));
                        if let Ok(mut sp) = app_state_sync.server_port.lock() {
                            *sp = p;
                        }
                        break;
                    }
                    Err(err) => {
                        eprintln!("Failed to bind port {}: {}", p, err);
                        continue;
                    }
                }
            }
        }
    }

    let Some((listener, addr)) = bound_listener else {
        eprintln!("LAN server could not bind any port in range {}..{}", port, port.saturating_add(20));
        return;
    };

    println!("Server listening on http://{}", addr);
    if let Err(err) = axum::serve(listener, app).await {
        eprintln!("LAN server exited: {}", err);
    }
}

async fn list_images(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<Vec<String>> {
    let folder_path = params.get("folder").cloned().unwrap_or_default();
    eprintln!("[Server] Listing images in folder: {}", folder_path);
    
    if folder_path.is_empty() {
        return Json(vec![]);
    }
    
    let resolved = if folder_path.starts_with("$RESOURCES/") {
        let subpath = &folder_path["$RESOURCES/".len()..];
        match state.app_handle.path().resolve(subpath, BaseDirectory::Resource) {
            Ok(p) => {
                eprintln!("[Server] Resolved resource '{}' to: {:?}", subpath, p);
                p.to_string_lossy().to_string()
            },
            Err(e) => {
                eprintln!("[Server] ERROR: Failed to resolve resource '{}': {}", subpath, e);
                return Json(vec![]);
            }
        }
    } else {
        let base_path_opt = state.app_state_sync.config_base_path.lock()
            .ok()
            .and_then(|p| p.clone());
        resolve_path(&folder_path, base_path_opt.as_deref())
    };
    
    eprintln!("[Server] Final resolved path: {}", resolved);
    let path = Path::new(&resolved);
    
    if !path.exists() || !path.is_dir() {
        eprintln!("[Server] Path does not exist or is not a directory");
        return Json(vec![]);
    }
    
    let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
    let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
    let mut media_files = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if image_extensions.contains(&ext_str.as_str()) || video_extensions.contains(&ext_str.as_str()) {
                        if let Some(path_str) = entry_path.to_str() {
                            // Strip \\?\ prefix on Windows if present
                            let clean_path = if cfg!(windows) && path_str.starts_with(r"\\?\") {
                                &path_str[4..]
                            } else {
                                path_str
                            };
                            media_files.push(clean_path.to_string());
                        }
                    }
                }
            }
        }
    }
    
    media_files.sort();
    eprintln!("[Server] Found {} media files", media_files.len());
    Json(media_files)
}

async fn serve_image(
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let path_str = match params.get("path") {
        Some(p) => p,
        None => return (StatusCode::BAD_REQUEST, "Missing path parameter").into_response(),
    };
    
    // Basic validation/security check?
    // Since this is a local app intended for "vibe coding", we'll be permissive,
    // but in a real app we'd want to verify the path is within allowed directories.
    
    match tokio::fs::read(path_str).await {
        Ok(bytes) => {
            let mime_type = mime_guess::from_path(path_str).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime_type.as_ref())], bytes).into_response()
        },
        Err(e) => {
            eprintln!("[Server] Failed to read file '{}': {}", path_str, e);
            (StatusCode::NOT_FOUND, "File not found").into_response()
        }
    }
}

async fn serve_spa(State(state): State<AppState>) -> impl IntoResponse {
    let index_path = state.dist_path.join("index.html");

    eprintln!("[serve_spa] Attempting to read index.html from: {:?}", index_path);
    eprintln!("[serve_spa] Path exists: {}", index_path.exists());
    eprintln!("[serve_spa] Dist path: {:?}", state.dist_path);
    
    match tokio::fs::read_to_string(&index_path).await {
        Ok(content) => {
            eprintln!("[serve_spa] Successfully read index.html ({} bytes)", content.len());
            Html(content)
        },
        Err(e) => {
            eprintln!("[serve_spa] ERROR reading index.html: {}", e);
            eprintln!("[serve_spa] Path: {:?}", index_path);
            eprintln!("[serve_spa] Dist path exists: {}", state.dist_path.exists());
            Html(format!(
                "<html><body><h1>VibeCast</h1><p>Error: Could not load frontend: {}</p><p>Path: {:?}</p></body></html>",
                e, index_path
            ))
        },
    }
}

async fn handle_command(
    State(state): State<AppState>,
    Json(payload): Json<RemoteCommand>,
) -> Json<serde_json::Value> {
    println!("Received command: {}", payload.command);
    
    let mut triggered_message: Option<MessageConfig> = None;
    
    // Update the canonical state based on command
    match payload.command.as_str() {
        // Legacy support
        "set-mode" => {
            if let Some(mode) = payload.payload.as_ref().and_then(|p| p.as_str()) {
                if let Ok(mut m) = state.app_state_sync.active_visualization.lock() {
                    *m = mode.to_string();
                }
            }
        }
        // New visualization commands
        "set-active-visualization" => {
            if let Some(viz) = payload.payload.as_ref().and_then(|p| p.as_str()) {
                if let Ok(mut m) = state.app_state_sync.active_visualization.lock() {
                    *m = viz.to_string();
                }
            }
        }
        "set-enabled-visualizations" => {
            if let Some(vizs) = payload.payload.as_ref().and_then(|p| p.as_array()) {
                if let Ok(mut m) = state.app_state_sync.enabled_visualizations.lock() {
                    *m = vizs.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
        }
        "set-common-settings" => {
            if let Some(p) = &payload.payload {
                if let Ok(settings) = serde_json::from_value::<CommonSettings>(p.clone()) {
                    if let Ok(mut m) = state.app_state_sync.common_settings.lock() {
                        *m = settings;
                    }
                }
            }
        }
        "set-visualization-settings" => {
            if let Some(p) = &payload.payload {
                if let Ok(mut m) = state.app_state_sync.visualization_settings.lock() {
                    *m = p.clone();
                }
            }
        }
        // Message commands
        "trigger-message" => {
            if let Some(p) = &payload.payload {
                // Handle both legacy (string) and new (MessageConfig) formats
                let msg = if let Some(text) = p.as_str() {
                    // Legacy format - create a MessageConfig
                    Some(MessageConfig {
                        id: "triggered".to_string(),
                        text: text.to_string(),
                        text_file: None,
                        text_style: "scrolling-capitals".to_string(),
                        text_style_preset: None,
                        style_overrides: None,
                        repeat_count: None,
                        speed: None,
                        split_enabled: None,
                        split_separator: None,
                    })
                } else {
                    serde_json::from_value::<MessageConfig>(p.clone()).ok()
                };
                
                if let Some(msg) = msg {
                    triggered_message = Some(msg.clone());
                    
                    // Update message stats
                    if let Ok(mut stats) = state.app_state_sync.message_stats.lock() {
                        let timestamp = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        
                        let current_stats: serde_json::Value = stats.get(&msg.id)
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!({
                                "messageId": msg.id,
                                "triggerCount": 0,
                                "lastTriggered": 0,
                                "history": []
                            }));
                        
                        let trigger_count = current_stats.get("triggerCount")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) + 1;
                        
                        let mut history = current_stats.get("history")
                            .and_then(|v| v.as_array())
                            .cloned()
                            .unwrap_or_default();
                        
                        history.push(serde_json::json!({ "timestamp": timestamp }));
                        // Keep last 50 entries
                        if history.len() > 50 {
                            history = history.into_iter().rev().take(50).rev().collect();
                        }
                        
                        let new_stats = serde_json::json!({
                            "messageId": msg.id,
                            "triggerCount": trigger_count,
                            "lastTriggered": timestamp,
                            "history": history
                        });
                        
                        if let Some(obj) = stats.as_object_mut() {
                            obj.insert(msg.id.clone(), new_stats);
                        } else {
                            *stats = serde_json::json!({ msg.id: new_stats });
                        }
                    }
                }
            }
        }
        "set-messages" => {
            if let Some(p) = &payload.payload {
                // Handle both legacy (string array) and new (MessageConfig array) formats
                if let Ok(messages) = serde_json::from_value::<Vec<MessageConfig>>(p.clone()) {
                    if let Ok(mut m) = state.app_state_sync.messages.lock() {
                        *m = messages;
                    }
                    // Keep a flat tree representation in sync
                    if let Ok(m) = state.app_state_sync.messages.lock() {
                        if let Ok(mut t) = state.app_state_sync.message_tree.lock() {
                            *t = build_flat_message_tree(m.as_slice());
                        }
                    }
                } else if let Some(arr) = p.as_array() {
                    // Legacy format - array of strings
                    let messages: Vec<MessageConfig> = arr.iter()
                        .enumerate()
                        .filter_map(|(i, v)| {
                            v.as_str().map(|s| MessageConfig {
                                id: i.to_string(),
                                text: s.to_string(),
                                text_file: None,
                                text_style: "scrolling-capitals".to_string(),
                                text_style_preset: None,
                                style_overrides: None,
                                repeat_count: None,
                                speed: None,
                                split_enabled: None,
                                split_separator: None,
                            })
                        })
                        .collect();
                    if let Ok(mut m) = state.app_state_sync.messages.lock() {
                        *m = messages;
                    }
                    // Keep a flat tree representation in sync
                    if let Ok(m) = state.app_state_sync.messages.lock() {
                        if let Ok(mut t) = state.app_state_sync.message_tree.lock() {
                            *t = build_flat_message_tree(m.as_slice());
                        }
                    }
                }
            }
        }
        "set-message-tree" => {
            if let Some(p) = &payload.payload {
                if let Ok(mut t) = state.app_state_sync.message_tree.lock() {
                    *t = p.clone();
                }
                // Also update the flattened messages list for backward compatibility / remote UI.
                let flat = flatten_message_tree(p);
                if let Ok(mut m) = state.app_state_sync.messages.lock() {
                    *m = flat;
                }
            }
        }
        "set-default-text-style" => {
            if let Some(style) = payload.payload.as_ref().and_then(|p| p.as_str()) {
                if let Ok(mut m) = state.app_state_sync.default_text_style.lock() {
                    *m = style.to_string();
                }
            }
        }
        "set-text-style-settings" => {
            if let Some(p) = &payload.payload {
                if let Ok(mut m) = state.app_state_sync.text_style_settings.lock() {
                    *m = p.clone();
                }
            }
        }
        "set-visualization-presets" => {
            if let Some(p) = &payload.payload {
                if let Ok(presets) = serde_json::from_value::<Vec<VisualizationPreset>>(p.clone()) {
                    if let Ok(mut m) = state.app_state_sync.visualization_presets.lock() {
                        *m = presets;
                    }
                }
            }
        }
        "set-active-visualization-preset" => {
            if let Some(p) = &payload.payload {
                if p.is_null() {
                    if let Ok(mut m) = state.app_state_sync.active_visualization_preset.lock() {
                        *m = None;
                    }
                } else if let Some(preset_id) = p.as_str() {
                    if let Ok(mut m) = state.app_state_sync.active_visualization_preset.lock() {
                        *m = Some(preset_id.to_string());
                    }
                    // Also update active visualization based on preset
                    if let Ok(presets) = state.app_state_sync.visualization_presets.lock() {
                        if let Some(preset) = presets.iter().find(|p| p.id == preset_id) {
                            if let Ok(mut m) = state.app_state_sync.active_visualization.lock() {
                                *m = preset.visualization_id.clone();
                            }
                        }
                    }
                }
            }
        }
        "set-text-style-presets" => {
            if let Some(p) = &payload.payload {
                if let Ok(presets) = serde_json::from_value::<Vec<TextStylePreset>>(p.clone()) {
                    if let Ok(mut m) = state.app_state_sync.text_style_presets.lock() {
                        *m = presets;
                    }
                }
            }
        }
        "clear-active-message" => {
            // Manual stop of a message - clear triggered message and handle queue
            if let Some(p) = &payload.payload {
                if let Some(message_id) = p.get("messageId").and_then(|v| v.as_str()) {
                    // Check if this message is the current queue message
                    let mut should_clear_queue = false;
                    let mut next_message: Option<MessageConfig> = None;
                    
                    if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                        if let Some(ref mut q) = *queue {
                            if let Some(current_id) = q.message_ids.get(q.current_index) {
                                if current_id == message_id {
                                    // User manually stopped the current queue message
                                    // Advance to next or clear queue
                                    q.current_index += 1;
                                    if q.current_index < q.message_ids.len() {
                                        // Get next message
                                        if let Some(next_id) = q.message_ids.get(q.current_index) {
                                            if let Ok(messages) = state.app_state_sync.messages.lock() {
                                                next_message = messages.iter().find(|m| &m.id == next_id).cloned();
                                            }
                                        }
                                    } else {
                                        // Queue complete
                                        should_clear_queue = true;
                                    }
                                }
                            }
                        }
                    }
                    
                    if should_clear_queue {
                        if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                            *queue = None;
                        }
                    }
                    
                    // Trigger next message if any
                    if let Some(msg) = next_message {
                        triggered_message = Some(msg.clone());
                        let trigger_cmd = serde_json::json!({
                            "command": "trigger-message",
                            "payload": msg
                        });
                        let _ = state.app_handle.emit("remote-command", trigger_cmd);
                    }
                }
            }
        }
        "message-complete" => {
            // Message finished playing - handle queue advancement
            // This is the single source of truth for queue advancement
            if let Some(p) = &payload.payload {
                if let Some(message_id) = p.get("messageId").and_then(|v| v.as_str()) {
                    println!("[message-complete] Message {} completed", message_id);
                    
                    let mut should_clear_queue = false;
                    let mut next_message: Option<MessageConfig> = None;
                    
                    // Check if we have a folder queue and this message is the current one
                    if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                        if let Some(ref mut q) = *queue {
                            if let Some(current_id) = q.message_ids.get(q.current_index) {
                                if current_id == message_id {
                                    println!("[message-complete] Advancing queue from index {} to {}", q.current_index, q.current_index + 1);
                                    q.current_index += 1;
                                    
                                    if q.current_index < q.message_ids.len() {
                                        // Get next message
                                        if let Some(next_id) = q.message_ids.get(q.current_index) {
                                            println!("[message-complete] Next message ID: {}", next_id);
                                            if let Ok(messages) = state.app_state_sync.messages.lock() {
                                                next_message = messages.iter().find(|m| &m.id == next_id).cloned();
                                            }
                                        }
                                    } else {
                                        // Queue complete
                                        println!("[message-complete] Queue complete");
                                        should_clear_queue = true;
                                    }
                                }
                            }
                        }
                    }
                    
                    if should_clear_queue {
                        if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                            *queue = None;
                        }
                    }
                    
                    // Trigger next message if any
                    if let Some(msg) = next_message {
                        println!("[message-complete] Triggering next message: {}", msg.text);
                        triggered_message = Some(msg.clone());
                        
                        // Emit trigger-message to Tauri windows
                        let trigger_cmd = serde_json::json!({
                            "command": "trigger-message",
                            "payload": msg
                        });
                        let _ = state.app_handle.emit("remote-command", trigger_cmd);
                    }
                }
            }
        }
        "play-folder" => {
            if let Some(p) = &payload.payload {
                if let Some(folder_id) = p.get("folderId").and_then(|v| v.as_str()) {
                    // Get message tree and collect message IDs from the folder
                    let message_ids = if let Ok(tree) = state.app_state_sync.message_tree.lock() {
                        collect_messages_from_folder(folder_id, &tree)
                    } else {
                        vec![]
                    };
                    
                    if !message_ids.is_empty() {
                        // Set up the queue
                        if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                            *queue = Some(FolderPlaybackQueue {
                                folder_id: folder_id.to_string(),
                                message_ids: message_ids.clone(),
                                current_index: 0,
                            });
                        }
                        
                        // Trigger the first message
                        if let Some(first_id) = message_ids.first() {
                            if let Ok(messages) = state.app_state_sync.messages.lock() {
                                if let Some(msg) = messages.iter().find(|m| &m.id == first_id) {
                                    let msg_clone = msg.clone();
                                    triggered_message = Some(msg_clone.clone());
                                    
                                    // Emit trigger-message remote command to Tauri windows
                                    // This ensures VisualizerWindow receives the command and actually plays the message
                                    let trigger_cmd = serde_json::json!({
                                        "command": "trigger-message",
                                        "payload": msg_clone
                                    });
                                    let _ = state.app_handle.emit("remote-command", trigger_cmd);
                                }
                            }
                        }
                    }
                }
            }
        }
        "cancel-folder-playback" => {
            // Clear the folder playback queue and stop current message
            println!("[cancel-folder-playback] Cancelling folder playback");
            
            // Clear the queue
            if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                *queue = None;
            }
            
            // Emit clear-message to Tauri windows to stop visualizer
            let clear_cmd = serde_json::json!({
                "command": "clear-message",
                "payload": null
            });
            let _ = state.app_handle.emit("remote-command", clear_cmd);
        }
        "reset-message-stats" => {
            if let Ok(mut m) = state.app_state_sync.message_stats.lock() {
                *m = serde_json::json!({});
            }
        }
        "load-configuration" => {
            if let Some(obj) = payload.payload.as_ref().and_then(|p| p.as_object()) {
                // Full configuration load
                if let Some(viz) = obj.get("activeVisualization").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.app_state_sync.active_visualization.lock() {
                        *m = viz.to_string();
                    }
                }
                if let Some(vizs) = obj.get("enabledVisualizations").and_then(|v| v.as_array()) {
                    if let Ok(mut m) = state.app_state_sync.enabled_visualizations.lock() {
                        *m = vizs.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect();
                    }
                }
                if let Some(settings) = obj.get("commonSettings") {
                    if let Ok(s) = serde_json::from_value::<CommonSettings>(settings.clone()) {
                        if let Ok(mut m) = state.app_state_sync.common_settings.lock() {
                            *m = s;
                        }
                    }
                }
                if let Some(settings) = obj.get("visualizationSettings") {
                    if let Ok(mut m) = state.app_state_sync.visualization_settings.lock() {
                        *m = settings.clone();
                    }
                }
                if let Some(msgs) = obj.get("messages") {
                    if let Ok(messages) = serde_json::from_value::<Vec<MessageConfig>>(msgs.clone()) {
                        if let Ok(mut m) = state.app_state_sync.messages.lock() {
                            *m = messages;
                        }
                    }
                }
                // Message tree (folders) - canonical ordering/structure if present
                if let Some(tree) = obj.get("messageTree") {
                    if let Ok(mut t) = state.app_state_sync.message_tree.lock() {
                        *t = tree.clone();
                    }
                    // Ensure flattened messages match tree
                    let flat = flatten_message_tree(tree);
                    if let Ok(mut m) = state.app_state_sync.messages.lock() {
                        *m = flat;
                    }
                } else {
                    // If no tree was provided, keep a flat tree representation of messages
                    if let Ok(m) = state.app_state_sync.messages.lock() {
                        if let Ok(mut t) = state.app_state_sync.message_tree.lock() {
                            *t = build_flat_message_tree(m.as_slice());
                        }
                    }
                }
                if let Some(style) = obj.get("defaultTextStyle").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.app_state_sync.default_text_style.lock() {
                        *m = style.to_string();
                    }
                }
                if let Some(settings) = obj.get("textStyleSettings") {
                    if let Ok(mut m) = state.app_state_sync.text_style_settings.lock() {
                        *m = settings.clone();
                    }
                }
                if let Some(presets) = obj.get("visualizationPresets") {
                    if let Ok(p) = serde_json::from_value::<Vec<VisualizationPreset>>(presets.clone()) {
                        if let Ok(mut m) = state.app_state_sync.visualization_presets.lock() {
                            *m = p;
                        }
                    }
                }
                if let Some(preset_id) = obj.get("activeVisualizationPreset").and_then(|v| v.as_str()) {
                    if let Ok(mut m) = state.app_state_sync.active_visualization_preset.lock() {
                        *m = Some(preset_id.to_string());
                    }
                }
                if let Some(presets) = obj.get("textStylePresets") {
                    if let Ok(p) = serde_json::from_value::<Vec<TextStylePreset>>(presets.clone()) {
                        if let Ok(mut m) = state.app_state_sync.text_style_presets.lock() {
                            *m = p;
                        }
                    }
                }
                if let Some(stats) = obj.get("messageStats") {
                    if let Ok(mut m) = state.app_state_sync.message_stats.lock() {
                        *m = stats.clone();
                    }
                }
            }
        }
        _ => {}
    }
    
    // Broadcast state update to all SSE subscribers
    state.app_state_sync.broadcast(triggered_message.clone());

    // Also broadcast the command itself (for clients that don't rely on state or need specific signals)
    state.app_state_sync.broadcast_command(payload.clone());
    
    // Also emit to Tauri windows (for VibeCast which uses Tauri events for audio sync)
    let _ = state.app_handle.emit("remote-command", &payload);

    Json(serde_json::json!({ "status": "ok" }))
}

async fn get_state(State(state): State<AppState>) -> Json<serde_json::Value> {
    let current = state.app_state_sync.get_state();
    // Return full state for SSE compatibility
    Json(serde_json::to_value(&current).unwrap_or(serde_json::json!({})))
}

async fn get_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "online" }))
}

async fn handle_e2e_report(
    State(state): State<AppState>,
    Json(report): Json<E2EReport>,
) -> Json<serde_json::Value> {
    println!("[E2E] Received report: {:?}", report);
    if let Ok(mut m) = state.app_state_sync.last_e2e_report.lock() {
        *m = Some(report);
    }
    Json(serde_json::json!({ "status": "ok" }))
}

async fn get_last_e2e_report(State(state): State<AppState>) -> Json<Option<E2EReport>> {
    let report = state.app_state_sync.last_e2e_report.lock()
        .ok()
        .and_then(|r| r.clone());
    Json(report)
}

/// SSE endpoint that streams state updates to clients
async fn state_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    println!("[SSE] Client connected");
    // Subscribe to the broadcast channels
    let rx_state = state.app_state_sync.state_tx.subscribe();
    let rx_command = state.app_state_sync.command_tx.subscribe();
    
    // Send initial state immediately so clients don't have to wait
    let initial_state = state.app_state_sync.get_state();
    
    // Convert broadcast receiver to a stream, mapping directly to SSE events
    // filter_map skips lagged errors (when client is slower than broadcast rate)
    let state_stream = BroadcastStream::new(rx_state)
        .filter_map(|result| async move { 
            if result.is_err() {
                eprintln!("[SSE] State stream lagged");
            }
            result.ok() 
        })
        .map(|broadcast_state: BroadcastState| -> Result<Event, Infallible> {
            Ok(Event::default()
                .event("state")
                .data(serde_json::to_string(&broadcast_state).unwrap_or_default()))
        });
        
    let command_stream = BroadcastStream::new(rx_command)
        .filter_map(|result| async move { 
            if result.is_err() {
                eprintln!("[SSE] Command stream lagged");
            }
            result.ok() 
        })
        .map(|command: RemoteCommand| -> Result<Event, Infallible> {
            Ok(Event::default()
                .event("command")
                .data(serde_json::to_string(&command).unwrap_or_default()))
        });
    
    // Prepend with initial state
    let initial_event = futures::stream::once(async move {
        println!("[SSE] Sending initial state");
        Ok(Event::default()
            .event("state")
            .data(serde_json::to_string(&initial_state).unwrap_or_default()))
    });
    
    // Merge streams
    let combined_stream = initial_event
        .chain(futures::stream::select(state_stream, command_stream));
    
    Sse::new(combined_stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}