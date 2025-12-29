use axum::{
    extract::State,
    response::{
        sse::{Event, KeepAlive, Sse},
        Html,
    },
    routing::{get, post},
    Json, Router,
};
use futures::{stream::Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio_stream::wrappers::BroadcastStream;
use tower_http::{cors::CorsLayer, services::ServeDir};

use crate::{AppStateSync, BroadcastState, MessageConfig, CommonSettings, VisualizationPreset, TextStylePreset, FolderPlaybackQueue};

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
}

#[derive(Deserialize, Serialize, Clone)]
struct RemoteCommand {
    command: String,
    payload: Option<serde_json::Value>,
}

pub async fn start_server(app_handle: AppHandle, app_state_sync: Arc<AppStateSync>, port: u16) {
    let state = AppState { 
        app_handle: app_handle.clone(),
        app_state_sync,
    };
    let app_state_sync = state.app_state_sync.clone();

    // Get the path to the frontend assets
    let dist_path = if cfg!(debug_assertions) {
        let mut path = std::env::current_dir().unwrap();
        if path.ends_with("src-tauri") {
            path = path.parent().unwrap().to_path_buf();
        }
        path.join("dist")
    } else {
        let resource_path = app_handle.path().resource_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        resource_path.join("dist")
    };

    let app = Router::new()
        .route("/api/command", post(handle_command))
        .route("/api/state", get(get_state))
        .route("/api/status", get(get_status))
        .route("/api/events", get(state_events))
        .fallback_service(
            ServeDir::new(dist_path)
                .append_index_html_on_directories(true)
                .fallback(get(handle_index))
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Try a range of ports (helps when a previous instance is still running).
    let mut bound_listener: Option<(tokio::net::TcpListener, SocketAddr)> = None;
    for p in port..=port.saturating_add(20) {
        let addr = SocketAddr::from(([0, 0, 0, 0], p));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                bound_listener = Some((listener, addr));
                if let Ok(mut sp) = app_state_sync.server_port.lock() {
                    *sp = p;
                }
                break;
            }
            Err(err) => {
                eprintln!("Failed to bind {} ({}), trying next port...", addr, err);
                continue;
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

async fn handle_index() -> Html<&'static str> {
    Html("<html><body><h1>VibeCast Remote</h1><p>If you see this, the static files are not yet built. Run <code>npm run build</code>.</p></body></html>")
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
                } else if let Ok(msg) = serde_json::from_value::<MessageConfig>(p.clone()) {
                    Some(msg)
                } else {
                    None
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
                            .unwrap_or_else(|| vec![]);
                        
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

/// SSE endpoint that streams state updates to clients
async fn state_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // Subscribe to the broadcast channel
    let rx = state.app_state_sync.state_tx.subscribe();
    
    // Send initial state immediately so clients don't have to wait
    let initial_state = state.app_state_sync.get_state();
    
    // Convert broadcast receiver to a stream, mapping directly to SSE events
    // filter_map skips lagged errors (when client is slower than broadcast rate)
    let broadcast_stream = BroadcastStream::new(rx)
        .filter_map(|result| async move { result.ok() })
        .map(|broadcast_state: BroadcastState| -> Result<Event, Infallible> {
            Ok(Event::default()
                .event("state")
                .data(serde_json::to_string(&broadcast_state).unwrap_or_default()))
        });
    
    // Prepend with initial state
    let initial_event = futures::stream::once(async move {
        Ok(Event::default()
            .event("state")
            .data(serde_json::to_string(&initial_state).unwrap_or_default()))
    });
    
    let combined_stream = initial_event.chain(broadcast_stream);
    
    Sse::new(combined_stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
