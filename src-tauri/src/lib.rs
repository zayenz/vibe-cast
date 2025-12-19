mod audio;
mod server;

use tauri::{Manager, Emitter};
use local_ip_address::local_ip;
use crate::audio::AudioState;

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
fn emit_state_change(handle: tauri::AppHandle, event_type: String, payload: serde_json::Value) {
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
            
            // Start audio capture and manage the state to keep the stream alive
            let audio_state = audio::start_audio_capture(handle);
            app.manage(audio_state);

            // Start LAN server
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                server::start_server(handle, 8080).await;
            });

            // Ensure we have the windows
            let _main_window = app.get_webview_window("main").unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
