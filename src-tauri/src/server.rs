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

use crate::{AppStateSync, BroadcastState};

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
    Html("<html><body><h1>Visualizer Remote</h1><p>If you see this, the static files are not yet built. Run <code>npm run build</code>.</p></body></html>")
}

async fn handle_command(
    State(state): State<AppState>,
    Json(payload): Json<RemoteCommand>,
) -> Json<serde_json::Value> {
    println!("Received command: {}", payload.command);
    
    // Update the canonical state
    let triggered_message = match payload.command.as_str() {
        "set-mode" => {
            if let Some(mode) = payload.payload.as_ref().and_then(|p| p.as_str()) {
                if let Ok(mut m) = state.app_state_sync.mode.lock() {
                    *m = mode.to_string();
                }
            }
            None
        }
        "trigger-message" => {
            payload.payload.as_ref().and_then(|p| p.as_str()).map(|s| s.to_string())
        }
        "set-messages" => {
            if let Some(messages) = payload.payload.as_ref().and_then(|p| p.as_array()) {
                if let Ok(mut m) = state.app_state_sync.messages.lock() {
                    *m = messages.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
            None
        }
        _ => None
    };
    
    // Broadcast state update to all SSE subscribers
    state.app_state_sync.broadcast(triggered_message.clone());
    
    // Also emit to Tauri windows (for Visualizer which uses Tauri events for audio sync)
    let _ = state.app_handle.emit("remote-command", &payload);

    Json(serde_json::json!({ "status": "ok" }))
}

async fn get_state(State(state): State<AppState>) -> Json<serde_json::Value> {
    let current = state.app_state_sync.get_state();
    Json(serde_json::json!({
        "mode": current.mode,
        "messages": current.messages
    }))
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
