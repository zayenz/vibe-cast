use axum::{
    extract::State,
    response::Html,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tauri::{AppHandle, Emitter, Manager};
use tower_http::{cors::CorsLayer, services::ServeDir};

#[derive(Clone)]
struct AppState {
    app_handle: AppHandle,
}

#[derive(Deserialize, Serialize, Clone)]
struct RemoteCommand {
    command: String,
    payload: Option<serde_json::Value>,
}

pub async fn start_server(app_handle: AppHandle, port: u16) {
    let state = AppState { app_handle: app_handle.clone() };

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
        .route("/api/status", get(get_status))
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
    // In a real app, you'd read the index.html from dist
    // For now, we'll assume ServeDir handles it if we point to the right place
    Html("<html><body><h1>Visualizer Remote</h1><p>If you see this, the static files are not yet built. Run <code>npm run build</code>.</p></body></html>")
}

async fn handle_command(
    State(state): State<AppState>,
    Json(payload): Json<RemoteCommand>,
) -> Json<serde_json::Value> {
    println!("Received command: {}", payload.command);
    
    // Emit the command to the Tauri app
    let _ = state.app_handle.emit("remote-command", payload);

    Json(serde_json::json!({ "status": "ok" }))
}

async fn get_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "online" }))
}

