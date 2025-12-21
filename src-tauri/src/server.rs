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

use crate::{AppStateSync, BroadcastState, MessageConfig, CommonSettings, VisualizationPreset, TextStylePreset};

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

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
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
                if let Some(text) = p.as_str() {
                    // Legacy format - create a MessageConfig
                    triggered_message = Some(MessageConfig {
                        id: "triggered".to_string(),
                        text: text.to_string(),
                        text_style: "scrolling-capitals".to_string(),
                        text_style_preset: None,
                        style_overrides: None,
                        repeat_count: None,
                        speed: None,
                    });
                } else if let Ok(msg) = serde_json::from_value::<MessageConfig>(p.clone()) {
                    triggered_message = Some(msg);
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
                } else if let Some(arr) = p.as_array() {
                    // Legacy format - array of strings
                    let messages: Vec<MessageConfig> = arr.iter()
                        .enumerate()
                        .filter_map(|(i, v)| {
                            v.as_str().map(|s| MessageConfig {
                                id: i.to_string(),
                                text: s.to_string(),
                                text_style: "scrolling-capitals".to_string(),
                                text_style_preset: None,
                                style_overrides: None,
                                repeat_count: None,
                                speed: None,
                            })
                        })
                        .collect();
                    if let Ok(mut m) = state.app_state_sync.messages.lock() {
                        *m = messages;
                    }
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
            // This is handled on the frontend, but we acknowledge it
            // The actual clearing happens in the VisualizerWindow
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
