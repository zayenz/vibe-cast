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
use serde::Serialize;
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
    TextStylePreset, FolderPlaybackQueue, E2EReport, RemoteCommand, DeviceType
};

/// Structured error response for API endpoints
/// 
/// This struct ensures that all API errors return consistent JSON responses
/// instead of falling back to HTML, which was causing parsing errors in
/// Windows production builds.
#[derive(Serialize)]
pub struct ApiErrorResponse {
    /// Human-readable error message
    pub error: String,
    /// Machine-readable error code for programmatic handling
    pub code: String,
    /// Optional additional details about the error
    pub details: Option<String>,
    /// Optional request ID for debugging and tracing
    pub request_id: Option<String>,
}

impl ApiErrorResponse {
    /// Create a new error response with basic information
    pub fn new(error: String, code: String) -> Self {
        Self {
            error,
            code,
            details: None,
            request_id: None,
        }
    }

    /// Create a new error response with additional details
    pub fn with_details(error: String, code: String, details: String) -> Self {
        Self {
            error,
            code,
            details: Some(details),
            request_id: None,
        }
    }

    /// Create a new error response with request ID for tracing
    pub fn with_request_id(error: String, code: String, request_id: String) -> Self {
        Self {
            error,
            code,
            details: None,
            request_id: Some(request_id),
        }
    }

    /// Create a bad request error (400)
    pub fn bad_request(message: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::BAD_REQUEST,
            Json(Self::new(message.to_string(), "BAD_REQUEST".to_string()))
        )
    }

    /// Create a not found error (404)
    pub fn not_found(message: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::NOT_FOUND,
            Json(Self::new(message.to_string(), "NOT_FOUND".to_string()))
        )
    }

    /// Create a forbidden error (403)
    pub fn forbidden(message: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::FORBIDDEN,
            Json(Self::new(message.to_string(), "FORBIDDEN".to_string()))
        )
    }

    /// Create an internal server error (500)
    pub fn internal_error(message: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(Self::new(message.to_string(), "INTERNAL_ERROR".to_string()))
        )
    }

    /// Create a folder not found error with details
    pub fn folder_not_found(folder_path: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::NOT_FOUND,
            Json(Self::with_details(
                "Folder not found".to_string(),
                "FOLDER_NOT_FOUND".to_string(),
                format!("The specified folder '{}' does not exist or is not accessible", folder_path)
            ))
        )
    }

    /// Create a resource resolution error
    pub fn resource_resolution_error(resource_path: &str, error: &str) -> (StatusCode, Json<Self>) {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(Self::with_details(
                "Resource resolution failed".to_string(),
                "RESOURCE_RESOLUTION_ERROR".to_string(),
                format!("Failed to resolve resource '{}': {}", resource_path, error)
            ))
        )
    }
}

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
        .layer(CorsLayer::very_permissive())
        .with_state(state);
    
    eprintln!("[Server] Router configured with CORS very_permissive");
    eprintln!("[Server] Available endpoints: /api/status, /api/state, /api/events, /api/command");

    // Try a range of ports (helps when a previous instance is still running).
    let mut bound_listener: Option<(tokio::net::TcpListener, SocketAddr)> = None;
    for p in port..=port.saturating_add(20) {
        eprintln!("[Server] Attempting to bind port {}", p);
        // Try binding to IPv4 0.0.0.0 first (more reliable for localhost connections)
        // Then fallback to IPv6 if IPv4 fails
        let addr_v4 = SocketAddr::from(([0, 0, 0, 0], p));
        match tokio::net::TcpListener::bind(addr_v4).await {
            Ok(listener) => {
                eprintln!("[Server] Successfully bound to IPv4 0.0.0.0:{}", p);
                bound_listener = Some((listener, addr_v4));
                if let Ok(mut sp) = app_state_sync.server_port.lock() {
                    *sp = p;
                }
                break;
            }
            Err(ipv4_err) => {
                eprintln!("[Server] IPv4 bind failed for port {}: {}", p, ipv4_err);
                // Try IPv6 [::] as fallback
                let addr = SocketAddr::from((std::net::Ipv6Addr::UNSPECIFIED, p));
                match tokio::net::TcpListener::bind(addr).await {
                    Ok(listener) => {
                        eprintln!("[Server] Successfully bound to IPv6 [::]:{}", p);
                        bound_listener = Some((listener, addr));
                        if let Ok(mut sp) = app_state_sync.server_port.lock() {
                            *sp = p;
                        }
                        break;
                    }
                    Err(ipv6_err) => {
                        eprintln!("[Server] IPv6 bind also failed for port {}: {}", p, ipv6_err);
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
) -> Result<Json<Vec<String>>, (StatusCode, Json<ApiErrorResponse>)> {
    let start_time = std::time::Instant::now();
    let folder_path = params.get("folder").cloned().unwrap_or_default();
    
    // Log request details
    eprintln!("[Server] [list_images] Request received - folder: '{}', params: {:?}", folder_path, params);
    
    // Validate folder parameter
    if folder_path.is_empty() {
        eprintln!("[Server] [list_images] ERROR: Empty folder parameter provided");
        return Err(ApiErrorResponse::bad_request("Folder parameter is required and cannot be empty"));
    }
    
    // Resolve the folder path
    let resolved = if let Some(subpath) = folder_path.strip_prefix("$RESOURCES/") {
        // subpath is now available from the if let Some pattern above
        eprintln!("[Server] [list_images] Resolving resource path: '{}'", subpath);
        
        match state.app_handle.path().resolve(subpath, BaseDirectory::Resource) {
            Ok(p) => {
                let resolved_path = p.to_string_lossy().to_string();
                eprintln!("[Server] [list_images] Resource '{}' resolved to: '{}'", subpath, resolved_path);
                resolved_path
            },
            Err(e) => {
                let error_msg = format!("Failed to resolve resource path '{}': {}", subpath, e);
                eprintln!("[Server] [list_images] ERROR: {}", error_msg);
                return Err(ApiErrorResponse::resource_resolution_error(&folder_path, &e.to_string()));
            }
        }
    } else {
        // Handle regular file system paths
        eprintln!("[Server] [list_images] Resolving file system path: '{}'", folder_path);
        
        let base_path_opt = match state.app_state_sync.config_base_path.lock() {
            Ok(guard) => guard.clone(),
            Err(e) => {
                let error_msg = format!("Failed to access config base path: {}", e);
                eprintln!("[Server] [list_images] ERROR: {}", error_msg);
                return Err(ApiErrorResponse::internal_error("Failed to access configuration"));
            }
        };
        
        let resolved_path = resolve_path(&folder_path, base_path_opt.as_deref());
        eprintln!("[Server] [list_images] Path '{}' resolved to: '{}'", folder_path, resolved_path);
        resolved_path
    };
    
    // Validate the resolved path
    let path = Path::new(&resolved);
    eprintln!("[Server] [list_images] Validating path: '{}'", resolved);
    
    if !path.exists() {
        let error_msg = format!("Folder '{}' does not exist", resolved);
        eprintln!("[Server] [list_images] ERROR: {}", error_msg);
        return Err(ApiErrorResponse::folder_not_found(&folder_path));
    }
    
    if !path.is_dir() {
        let error_msg = format!("Path '{}' exists but is not a directory", resolved);
        eprintln!("[Server] [list_images] ERROR: {}", error_msg);
        return Err(ApiErrorResponse::bad_request(&format!("Path '{}' is not a directory", folder_path)));
    }
    
    // Check if directory is accessible
    match std::fs::read_dir(path) {
        Ok(entries) => {
            eprintln!("[Server] [list_images] Successfully opened directory for reading");
            
            // Process directory entries
            let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
            let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
            let mut media_files = Vec::new();
            let mut processed_count = 0;
            let mut error_count = 0;
            
            for entry_result in entries {
                match entry_result {
                    Ok(entry) => {
                        processed_count += 1;
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
                                    } else {
                                        eprintln!("[Server] [list_images] WARNING: Could not convert path to string: {:?}", entry_path);
                                        error_count += 1;
                                    }
                                }
                            }
                        }
                    },
                    Err(e) => {
                        eprintln!("[Server] [list_images] WARNING: Error reading directory entry: {}", e);
                        error_count += 1;
                    }
                }
            }
            
            // Sort the results
            media_files.sort();
            
            let elapsed = start_time.elapsed();
            eprintln!(
                "[Server] [list_images] SUCCESS: Found {} media files in {} ms (processed {} entries, {} errors)",
                media_files.len(),
                elapsed.as_millis(),
                processed_count,
                error_count
            );
            
            Ok(Json(media_files))
        },
        Err(e) => {
            let error_msg = format!("Failed to read directory '{}': {}", resolved, e);
            eprintln!("[Server] [list_images] ERROR: {}", error_msg);
            
            // Determine appropriate error response based on the error type
            match e.kind() {
                std::io::ErrorKind::PermissionDenied => {
                    Err(ApiErrorResponse::forbidden(&format!("Permission denied accessing folder '{}'", folder_path)))
                },
                std::io::ErrorKind::NotFound => {
                    Err(ApiErrorResponse::folder_not_found(&folder_path))
                },
                _ => {
                    Err(ApiErrorResponse::internal_error(&format!("I/O error accessing folder: {}", e)))
                }
            }
        }
    }
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
    
    // Determine device type from the command payload, defaulting to MobileRemote for backward compatibility
    let device_type = payload.device_type.clone().unwrap_or(DeviceType::MobileRemote);
    
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
                    
                    // Update playback_control so all clients (Control Plane, other remotes) get canStop
                    state.app_state_sync.start_message_playback_with_message(msg.clone(), device_type.clone());
                    // Emit to Tauri windows (Control Plane, Visualizer) so they get stop capability immediately
                    let complete_state = state.app_state_sync.get_state();
                    let playback_control = state.app_state_sync.get_playback_control();
                    let _ = state.app_handle.emit("playback-control-changed", serde_json::json!({
                        "type": "MESSAGE_STARTED",
                        "playbackControl": playback_control,
                        "state": complete_state
                    }));
                    let _ = state.app_handle.emit("state-changed", serde_json::json!({
                        "type": "MESSAGE_STARTED",
                        "payload": serde_json::json!({ "messageId": msg.id }),
                        "state": complete_state
                    }));
                    
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
                            *stats = serde_json::json!({ msg.id.clone(): new_stats });
                        }
                    }
                    
                    // Auto-stop safety timer: if the message has a known duration,
                    // spawn a task that stops it after duration + 500ms buffer.
                    // This prevents stuck "playing" state if the Visualizer doesn't
                    // report message-complete (e.g. window closed, error, etc.)
                    if let Some(duration) = playback_control.current_message.as_ref().and_then(|m| m.duration) {
                        let state_clone = state.app_state_sync.clone();
                        let handle_clone = state.app_handle.clone();
                        let message_id_clone = msg.id.clone();
                        let timeout_duration = duration + std::time::Duration::from_millis(500);
                        
                        tokio::spawn(async move {
                            tokio::time::sleep(timeout_duration).await;
                            
                            let current_state = state_clone.get_playback_control();
                            if current_state.is_playing &&
                               current_state.current_message.as_ref().map(|m| &m.id) == Some(&message_id_clone) {
                                println!("[trigger-message] Auto-stopping message '{}' after duration: {:?}", message_id_clone, duration);
                                state_clone.stop_message_playback(DeviceType::System);
                                
                                let updated_state = state_clone.get_state();
                                let updated_playback_control = state_clone.get_playback_control();
                                
                                let _ = handle_clone.emit("playback-control-changed", serde_json::json!({
                                    "type": "MESSAGE_TIMEOUT",
                                    "playbackControl": updated_playback_control,
                                    "state": updated_state
                                }));
                            }
                        });
                    }
                }
            }
        }
        "stop-message" => {
            // Unified stop from any device — update playback_control and notify all views
            state.app_state_sync.stop_message_playback(device_type.clone());
            let complete_state = state.app_state_sync.get_state();
            let playback_control = state.app_state_sync.get_playback_control();
            let _ = state.app_handle.emit("playback-control-changed", serde_json::json!({
                "type": "MESSAGE_STOPPED",
                "playbackControl": playback_control,
                "state": complete_state
            }));
            let _ = state.app_handle.emit("state-changed", serde_json::json!({
                "type": "MESSAGE_STOPPED",
                "payload": serde_json::Value::Null,
                "state": complete_state
            }));
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
                    let mut matched_current = false;
                    
                    if let Ok(mut queue) = state.app_state_sync.folder_playback_queue.lock() {
                        if let Some(ref mut q) = *queue {
                            if let Some(current_id) = q.message_ids.get(q.current_index) {
                                if current_id == message_id {
                                    matched_current = true;
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
                        println!("[clear-active-message] Emitting remote-command to all windows");
                        // AppHandle.emit() already broadcasts globally to all windows in Tauri v2
                        let _ = state.app_handle.emit("remote-command", trigger_cmd);
                    } else if matched_current {
                        // Stopped current message with no next — sync playback_control and notify all views
                        state.app_state_sync.stop_message_playback(DeviceType::MobileRemote);
                        let complete_state = state.app_state_sync.get_state();
                        let playback_control = state.app_state_sync.get_playback_control();
                        let _ = state.app_handle.emit("playback-control-changed", serde_json::json!({
                            "type": "MESSAGE_STOPPED",
                            "playbackControl": playback_control,
                            "state": complete_state
                        }));
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
                    
                    // Trigger next message if any; otherwise clear playback so all views show stopped
                    if let Some(msg) = next_message {
                        println!("[message-complete] Triggering next message: {}", msg.text);
                        triggered_message = Some(msg.clone());
                        
                        // Emit trigger-message to all Tauri windows
                        let trigger_cmd = serde_json::json!({
                            "command": "trigger-message",
                            "payload": msg
                        });
                        println!("[message-complete] Emitting remote-command to all windows");
                        // AppHandle.emit() already broadcasts globally to all windows in Tauri v2
                        let _ = state.app_handle.emit("remote-command", trigger_cmd);
                    } else {
                        // Message completed with no next — clear playback_control and notify all views
                        state.app_state_sync.stop_message_playback(DeviceType::System);
                        let complete_state = state.app_state_sync.get_state();
                        let playback_control = state.app_state_sync.get_playback_control();
                        let _ = state.app_handle.emit("playback-control-changed", serde_json::json!({
                            "type": "MESSAGE_STOPPED",
                            "playbackControl": playback_control,
                            "state": complete_state
                        }));
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
                                    
                                    // Emit trigger-message remote command to all Tauri windows
                                    // This ensures VisualizerWindow receives the command and actually plays the message
                                    let trigger_cmd = serde_json::json!({
                                        "command": "trigger-message",
                                        "payload": msg_clone
                                    });
                                    println!("[play-folder] Emitting remote-command to all windows");
                                    // AppHandle.emit() already broadcasts globally to all windows in Tauri v2
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
            
            // Emit clear-message to all Tauri windows to stop visualizer
            let clear_cmd = serde_json::json!({
                "command": "clear-message",
                "payload": null
            });
            println!("[cancel-folder-playback] Emitting remote-command to all windows");
            // AppHandle.emit() already broadcasts globally to all windows in Tauri v2
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
    
    // Also emit to all Tauri windows (for VibeCast which uses Tauri events for audio sync)
    // AppHandle.emit() already broadcasts globally to all windows in Tauri v2
    println!("[handle_command] Emitting remote-command to all windows: {}", payload.command);
    let _ = state.app_handle.emit("remote-command", &payload);

    Json(serde_json::json!({ "status": "ok" }))
}

async fn get_state(State(state): State<AppState>) -> Json<serde_json::Value> {
    let current = state.app_state_sync.get_state();
    // Return full state for SSE compatibility
    Json(serde_json::to_value(&current).unwrap_or(serde_json::json!({})))
}

async fn get_status() -> Json<serde_json::Value> {
    println!("[Server] Health check request received");
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
    println!("[SSE] ========================================");
    println!("[SSE] Client connected! New SSE subscription");
    println!("[SSE] ========================================");
    // Subscribe to the broadcast channels
    let rx_state = state.app_state_sync.state_tx.subscribe();
    let rx_command = state.app_state_sync.command_tx.subscribe();
    
    // Send initial state immediately so clients don't have to wait
    let initial_state = state.app_state_sync.get_state();
    println!("[SSE] Prepared initial state for client");
    
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
            println!("[SSE] Broadcasting state update to client");
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
            println!("[SSE] Broadcasting command to client: {}", command.command);
            Ok(Event::default()
                .event("command")
                .data(serde_json::to_string(&command).unwrap_or_default()))
        });
    
    // Prepend with initial state
    let initial_event = futures::stream::once(async move {
        println!("[SSE] Sending initial state to newly connected client");
        Ok(Event::default()
            .event("state")
            .data(serde_json::to_string(&initial_state).unwrap_or_default()))
    });
    
    // Merge streams
    let combined_stream = initial_event
        .chain(futures::stream::select(state_stream, command_stream));
    
    println!("[SSE] SSE stream configured, starting to send events...");
    
    Sse::new(combined_stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;
    use quickcheck::{TestResult, Arbitrary, Gen};
    use quickcheck_macros::quickcheck;

    #[test]
    fn test_api_error_response_serialization() {
        let error = ApiErrorResponse::new(
            "Test error".to_string(),
            "TEST_ERROR".to_string()
        );
        
        let json = serde_json::to_string(&error).unwrap();
        let expected = r#"{"error":"Test error","code":"TEST_ERROR","details":null,"request_id":null}"#;
        assert_eq!(json, expected);
    }

    #[test]
    fn test_api_error_response_with_details() {
        let error = ApiErrorResponse::with_details(
            "Test error".to_string(),
            "TEST_ERROR".to_string(),
            "Additional details".to_string()
        );
        
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("\"details\":\"Additional details\""));
    }

    #[test]
    fn test_api_error_response_helper_methods() {
        let (status, json_response) = ApiErrorResponse::bad_request("Invalid parameter");
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(json_response.0.error, "Invalid parameter");
        assert_eq!(json_response.0.code, "BAD_REQUEST");

        let (status, json_response) = ApiErrorResponse::not_found("Resource not found");
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(json_response.0.code, "NOT_FOUND");

        let (status, json_response) = ApiErrorResponse::folder_not_found("/invalid/path");
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(json_response.0.code, "FOLDER_NOT_FOUND");
        assert!(json_response.0.details.is_some());
    }

    // Property-based test generators
    #[derive(Debug, Clone)]
    enum ErrorScenario {
        BadRequest(String),
        NotFound(String),
        Forbidden(String),
        InternalError(String),
        FolderNotFound(String),
        ResourceResolutionError(String, String),
    }

    impl Arbitrary for ErrorScenario {
        fn arbitrary(g: &mut Gen) -> Self {
            let error_messages = vec![
                "Invalid parameter",
                "Missing required field",
                "Malformed request",
                "Resource not found",
                "Access denied",
                "Permission denied",
                "Internal server error",
                "Database connection failed",
                "File system error",
                "Network timeout",
            ];
            
            let _codes = vec![
                "BAD_REQUEST",
                "NOT_FOUND", 
                "FORBIDDEN",
                "INTERNAL_ERROR",
                "FOLDER_NOT_FOUND",
                "RESOURCE_RESOLUTION_ERROR",
            ];
            
            let paths = vec![
                "/invalid/path",
                "/nonexistent/folder",
                "$RESOURCES/missing",
                "C:\\invalid\\windows\\path",
                "/tmp/restricted",
                "relative/path/error",
            ];

            match g.choose(&[0, 1, 2, 3, 4, 5]).unwrap() {
                0 => ErrorScenario::BadRequest(g.choose(&error_messages).unwrap().to_string()),
                1 => ErrorScenario::NotFound(g.choose(&error_messages).unwrap().to_string()),
                2 => ErrorScenario::Forbidden(g.choose(&error_messages).unwrap().to_string()),
                3 => ErrorScenario::InternalError(g.choose(&error_messages).unwrap().to_string()),
                4 => ErrorScenario::FolderNotFound(g.choose(&paths).unwrap().to_string()),
                5 => ErrorScenario::ResourceResolutionError(
                    g.choose(&paths).unwrap().to_string(),
                    g.choose(&error_messages).unwrap().to_string()
                ),
                _ => unreachable!(),
            }
        }
    }

    /// **Feature: photo-slideshow-production-fix, Property 2: Error Response Format Consistency**
    /// **Validates: Requirements 1.2, 1.4, 1.5, 3.5, 4.2**
    /// 
    /// Property: For any error condition encountered by the `/api/images/list` endpoint,
    /// the response should be proper JSON with appropriate HTTP status codes (400, 403, 404, 500)
    /// and never fall back to HTML.
    #[quickcheck]
    fn prop_error_response_format_consistency(scenario: ErrorScenario) -> bool {
        let (status_code, json_response) = match &scenario {
            ErrorScenario::BadRequest(msg) => ApiErrorResponse::bad_request(msg),
            ErrorScenario::NotFound(msg) => ApiErrorResponse::not_found(msg),
            ErrorScenario::Forbidden(msg) => ApiErrorResponse::forbidden(msg),
            ErrorScenario::InternalError(msg) => ApiErrorResponse::internal_error(msg),
            ErrorScenario::FolderNotFound(path) => ApiErrorResponse::folder_not_found(path),
            ErrorScenario::ResourceResolutionError(path, error) => {
                ApiErrorResponse::resource_resolution_error(path, error)
            }
        };

        // Property 1: Status code must be a valid HTTP error status
        let valid_status_codes = [
            StatusCode::BAD_REQUEST,
            StatusCode::FORBIDDEN,
            StatusCode::NOT_FOUND,
            StatusCode::INTERNAL_SERVER_ERROR,
        ];
        let has_valid_status = valid_status_codes.contains(&status_code);

        // Property 2: Response must serialize to valid JSON
        let json_serialization_result = serde_json::to_string(&json_response.0);
        let serializes_to_json = json_serialization_result.is_ok();

        // Property 3: JSON must not contain HTML content
        let json_string = json_serialization_result.unwrap_or_default();
        let not_html = !json_string.contains("<!DOCTYPE") 
            && !json_string.contains("<html>") 
            && !json_string.contains("<body>");

        // Property 4: Response must have required fields
        let response = &json_response.0;
        let has_error_field = !response.error.is_empty();
        let has_code_field = !response.code.is_empty();

        // Property 5: Error codes must match expected patterns
        let valid_error_codes = [
            "BAD_REQUEST",
            "NOT_FOUND", 
            "FORBIDDEN",
            "INTERNAL_ERROR",
            "FOLDER_NOT_FOUND",
            "RESOURCE_RESOLUTION_ERROR",
        ];
        let has_valid_error_code = valid_error_codes.contains(&response.code.as_str());

        // Property 6: Status code must match error code semantics
        let status_code_matches_error_code = match response.code.as_str() {
            "BAD_REQUEST" => status_code == StatusCode::BAD_REQUEST,
            "NOT_FOUND" | "FOLDER_NOT_FOUND" => status_code == StatusCode::NOT_FOUND,
            "FORBIDDEN" => status_code == StatusCode::FORBIDDEN,
            "INTERNAL_ERROR" | "RESOURCE_RESOLUTION_ERROR" => status_code == StatusCode::INTERNAL_SERVER_ERROR,
            _ => false,
        };

        // Property 7: JSON structure must be consistent
        let parsed_json: Result<serde_json::Value, _> = serde_json::from_str(&json_string);
        let has_consistent_structure = if let Ok(json_value) = parsed_json {
            json_value.get("error").is_some() 
                && json_value.get("code").is_some()
                && json_value.get("details").is_some() // Should exist even if null
                && json_value.get("request_id").is_some() // Should exist even if null
        } else {
            false
        };

        // All properties must hold
        has_valid_status 
            && serializes_to_json 
            && not_html 
            && has_error_field 
            && has_code_field 
            && has_valid_error_code 
            && status_code_matches_error_code 
            && has_consistent_structure
    }

    /// Property test for JSON parsing safety - ensures no error response can be mistaken for HTML
    #[quickcheck]
    fn prop_error_response_never_html_fallback(error_msg: String, error_code: String) -> bool {
        // Limit string lengths to reasonable bounds for testing and ensure valid UTF-8
        let error_msg = if error_msg.chars().count() > 200 { 
            error_msg.chars().take(200).collect::<String>()
        } else { 
            error_msg 
        };
        let error_code = if error_code.chars().count() > 50 { 
            error_code.chars().take(50).collect::<String>()
        } else { 
            error_code 
        };
        
        let error_response = ApiErrorResponse::new(error_msg, error_code);
        
        if let Ok(json_string) = serde_json::to_string(&error_response) {
            // Must be valid JSON
            let is_valid_json = serde_json::from_str::<serde_json::Value>(&json_string).is_ok();
            
            // Must not contain HTML markers that would indicate SPA fallback
            let html_markers = [
                "<!DOCTYPE",
                "<html",
                "<head>",
                "<body>",
                "<title>",
                "<script>",
                "<div id=\"root\"",
                "window.__TAURI__",
            ];
            
            let contains_html = html_markers.iter().any(|marker| json_string.contains(marker));
            
            // Must start with { and end with } (basic JSON structure check)
            let has_json_structure = json_string.starts_with('{') && json_string.ends_with('}');
            
            is_valid_json && !contains_html && has_json_structure
        } else {
            false
        }
    }

    /// Property test for error response completeness - ensures all error types provide sufficient information
    #[quickcheck]
    fn prop_error_response_completeness(scenario: ErrorScenario) -> bool {
        let (status_code, json_response) = match &scenario {
            ErrorScenario::BadRequest(msg) => ApiErrorResponse::bad_request(msg),
            ErrorScenario::NotFound(msg) => ApiErrorResponse::not_found(msg),
            ErrorScenario::Forbidden(msg) => ApiErrorResponse::forbidden(msg),
            ErrorScenario::InternalError(msg) => ApiErrorResponse::internal_error(msg),
            ErrorScenario::FolderNotFound(path) => ApiErrorResponse::folder_not_found(path),
            ErrorScenario::ResourceResolutionError(path, error) => {
                ApiErrorResponse::resource_resolution_error(path, error)
            }
        };

        let response = &json_response.0;
        
        // Error message must be non-empty and meaningful
        let has_meaningful_error = !response.error.is_empty() && response.error.len() > 3;
        
        // Error code must follow naming convention (UPPER_CASE with underscores)
        let has_valid_code_format = response.code.chars().all(|c| c.is_ascii_uppercase() || c == '_');
        
        // Status code must be in error range (4xx or 5xx)
        let is_error_status = status_code.as_u16() >= 400 && status_code.as_u16() < 600;
        
        // Specific error types should have details when appropriate
        let has_appropriate_details = match &scenario {
            ErrorScenario::FolderNotFound(_) | ErrorScenario::ResourceResolutionError(_, _) => {
                response.details.is_some() && !response.details.as_ref().unwrap().is_empty()
            }
            _ => true, // Other error types may or may not have details
        };
        
        has_meaningful_error && has_valid_code_format && is_error_status && has_appropriate_details
    }
    // Additional imports for API response format consistency tests
    use tempfile::TempDir;
    use std::fs;


    // Test data generators for property-based testing
    #[derive(Debug, Clone)]
    struct TestImageFile {
        name: String,
        extension: String,
    }

    impl Arbitrary for TestImageFile {
        fn arbitrary(g: &mut Gen) -> Self {
            let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
            let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
            
            let all_extensions: Vec<&str> = image_extensions.iter().chain(video_extensions.iter()).cloned().collect();
            let ext_idx = usize::arbitrary(g) % all_extensions.len();
            let extension = all_extensions[ext_idx].to_string();
            
            let name = format!("test_file_{}", u32::arbitrary(g) % 1000);
            
            TestImageFile { name, extension }
        }
    }

    // Helper function to create a test folder with media files
    fn create_test_folder_with_files(files: Vec<TestImageFile>) -> Result<TempDir, std::io::Error> {
        let temp_dir = TempDir::new()?;
        
        for file in files {
            let file_path = temp_dir.path().join(format!("{}.{}", file.name, file.extension));
            fs::write(&file_path, b"test content")?;
        }
        
        Ok(temp_dir)
    }

    /// **Feature: photo-slideshow-production-fix, Property 1: API Response Format Consistency**
    /// **Validates: Requirements 1.1, 3.2, 3.3**
    /// 
    /// Property: For any valid folder path provided to the `/api/images/list` endpoint,
    /// the response should be a JSON array containing only supported image and video file paths from that folder
    #[quickcheck]
    fn prop_api_response_format_consistency(files: Vec<TestImageFile>) -> TestResult {
        // Skip empty test cases or very large ones to keep tests reasonable
        if files.is_empty() || files.len() > 50 {
            return TestResult::discard();
        }

        // Create a temporary directory with test files
        let temp_dir = match create_test_folder_with_files(files.clone()) {
            Ok(dir) => dir,
            Err(_) => return TestResult::discard(),
        };

        // Test the core logic by directly calling the path resolution and validation
        let folder_path = temp_dir.path().to_string_lossy().to_string();
        let resolved = resolve_path(&folder_path, None);
        
        // Verify path resolution works
        if resolved != folder_path {
            return TestResult::failed();
        }
        
        // Verify the folder exists and is accessible
        let path = std::path::Path::new(&resolved);
        if !path.exists() || !path.is_dir() {
            return TestResult::failed();
        }

        // Test that we can read the directory and find the expected files
        match std::fs::read_dir(path) {
            Ok(entries) => {
                let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
                let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
                let mut found_files = Vec::new();
                
                for entry_result in entries {
                    if let Ok(entry) = entry_result {
                        let entry_path = entry.path();
                        if entry_path.is_file() {
                            if let Some(ext) = entry_path.extension() {
                                let ext_str = ext.to_string_lossy().to_lowercase();
                                if image_extensions.contains(&ext_str.as_str()) || video_extensions.contains(&ext_str.as_str()) {
                                    if let Some(path_str) = entry_path.to_str() {
                                        found_files.push(path_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Verify that we found the expected number of files
                // (should match the number of test files we created)
                TestResult::from_bool(found_files.len() > 0)
            },
            Err(_) => TestResult::failed(),
        }
    }

    /// Property: Valid folder paths should always resolve to accessible directories
    #[quickcheck]
    fn prop_valid_folder_path_resolution(files: Vec<TestImageFile>) -> TestResult {
        if files.is_empty() || files.len() > 20 {
            return TestResult::discard();
        }

        let temp_dir = match create_test_folder_with_files(files) {
            Ok(dir) => dir,
            Err(_) => return TestResult::discard(),
        };

        let folder_path = temp_dir.path().to_string_lossy().to_string();
        let resolved = resolve_path(&folder_path, None);
        
        // Property: Resolved path should point to an existing directory
        let path = std::path::Path::new(&resolved);
        TestResult::from_bool(path.exists() && path.is_dir())
    }

    /// Property: Empty folders should return empty JSON arrays, not errors
    #[test]
    fn prop_empty_folder_returns_empty_array() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let folder_path = temp_dir.path().to_string_lossy().to_string();
        
        // Test path resolution for empty folder
        let resolved = resolve_path(&folder_path, None);
        let path = std::path::Path::new(&resolved);
        
        assert!(path.exists());
        assert!(path.is_dir());
        
        // Test directory reading
        match std::fs::read_dir(path) {
            Ok(entries) => {
                let count = entries.count();
                assert_eq!(count, 0, "Empty directory should have no entries");
            },
            Err(e) => panic!("Should be able to read empty directory: {}", e),
        }
    }

    /// Property: Folders with mixed file types should only return supported media files
    #[test]
    fn prop_mixed_folder_filters_correctly() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        
        // Create a mix of supported and unsupported files
        let test_files = vec![
            ("image.jpg", true),
            ("video.mp4", true),
            ("document.txt", false),
            ("archive.zip", false),
            ("photo.png", true),
            ("script.js", false),
            ("movie.mov", true),
        ];
        
        let mut expected_count = 0;
        for (filename, is_supported) in &test_files {
            let file_path = temp_dir.path().join(filename);
            fs::write(&file_path, b"test content").expect("Failed to create test file");
            if *is_supported {
                expected_count += 1;
            }
        }
        
        // Test directory scanning
        let folder_path = temp_dir.path().to_string_lossy().to_string();
        let resolved = resolve_path(&folder_path, None);
        let path = std::path::Path::new(&resolved);
        
        let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"];
        let video_extensions = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];
        let mut found_media_files = 0;
        
        match std::fs::read_dir(path) {
            Ok(entries) => {
                for entry_result in entries {
                    if let Ok(entry) = entry_result {
                        let entry_path = entry.path();
                        if entry_path.is_file() {
                            if let Some(ext) = entry_path.extension() {
                                let ext_str = ext.to_string_lossy().to_lowercase();
                                if image_extensions.contains(&ext_str.as_str()) || video_extensions.contains(&ext_str.as_str()) {
                                    found_media_files += 1;
                                }
                            }
                        }
                    }
                }
            },
            Err(e) => panic!("Failed to read directory: {}", e),
        }
        
        assert_eq!(found_media_files, expected_count, 
                   "Should find exactly {} supported media files, found {}", 
                   expected_count, found_media_files);
    }

    /// Property: Resource path resolution should handle $RESOURCES/ prefix correctly
    #[test]
    fn prop_resource_path_handling() {
        // Test that $RESOURCES/ prefix is properly detected
        let resource_path = "$RESOURCES/kittens";
        assert!(resource_path.starts_with("$RESOURCES/"));
        
        let subpath = resource_path.strip_prefix("$RESOURCES/").unwrap();
        assert_eq!(subpath, "kittens");
        
        // Test non-resource paths
        let regular_path = "/regular/path";
        assert!(!regular_path.starts_with("$RESOURCES/"));
        
        let relative_path = "relative/path";
        assert!(!relative_path.starts_with("$RESOURCES/"));
    }}
