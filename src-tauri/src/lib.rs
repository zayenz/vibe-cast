mod audio;
mod server;

use std::sync::{Arc, Mutex};
use tauri::{Manager, Emitter};
use local_ip_address::local_ip;
use crate::audio::AudioState;

/// Shared application state for syncing between windows and the remote
pub struct AppStateSync {
    pub mode: Mutex<String>,
    pub messages: Mutex<Vec<String>>,
}

impl AppStateSync {
    pub fn new() -> Self {
        Self {
            mode: Mutex::new("fireplace".to_string()),
            messages: Mutex::new(vec![
                "Hello World!".to_string(),
                "Keep it calm...".to_string(),
                "TECHNO TIME".to_string(),
            ]),
        }
    }
}

#[tauri::command]
fn get_server_info() -> serde_json::Value {
    let my_local_ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    serde_json::json!({
        "ip": my_local_ip,
        "port": 8080
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
fn emit_state_change(
    handle: tauri::AppHandle, 
    state: tauri::State<'_, Arc<AppStateSync>>,
    event_type: String, 
    payload: serde_json::Value
) {
    // Update local state so the API can return current values
    match event_type.as_str() {
        "SET_MODE" => {
            if let Some(mode) = payload.as_str() {
                if let Ok(mut m) = state.mode.lock() {
                    *m = mode.to_string();
                }
            }
        }
        "SET_MESSAGES" => {
            if let Some(messages) = payload.as_array() {
                if let Ok(mut m) = state.messages.lock() {
                    *m = messages.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
        }
        "TRIGGER_MESSAGE" => {
            // No state update needed for trigger - it's a one-time event
        }
        _ => {}
    }
    
    // Emit to all windows
    let _ = handle.emit("state-changed", serde_json::json!({
        "type": event_type,
        "payload": payload
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_server_info, get_audio_data, emit_state_change])
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
