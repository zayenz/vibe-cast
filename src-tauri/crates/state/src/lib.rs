use std::sync::Mutex;
use std::fs;
use std::path::Path;
use tokio::sync::broadcast;
use vibe_cast_models::{
    MessageConfig, VisualizationPreset, TextStylePreset, 
    CommonSettings, FolderPlaybackQueue, BroadcastState, E2EReport, RemoteCommand
};

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
    pub folder_playback_queue: Mutex<Option<FolderPlaybackQueue>>,
    pub config_base_path: Mutex<Option<String>>,
    pub server_port: Mutex<u16>,
    /// Last triggered message - persists until cleared
    pub triggered_message: Mutex<Option<MessageConfig>>,
    /// Last E2E report received from frontend
    pub last_e2e_report: Mutex<Option<E2EReport>>,
    /// Broadcast channel for SSE - sends full state on every change
    pub state_tx: broadcast::Sender<BroadcastState>,
    /// Broadcast channel for commands - sends transient commands (like report-status)
    pub command_tx: broadcast::Sender<RemoteCommand>,
}

impl Default for AppStateSync {
    fn default() -> Self {
        Self::new()
    }
}

impl AppStateSync {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(64);
        let (command_tx, _) = broadcast::channel(64);
        
        // Default messages
        let default_messages = vec![
            MessageConfig {
                id: "msg-1".to_string(),
                text: "Countdown initiated...".to_string(),
                text_file: None,
                text_style: "typewriter".to_string(),
                text_style_preset: None,
                style_overrides: None,
                repeat_count: None,
                speed: None,
                split_enabled: None,
                split_separator: None,
            },
            MessageConfig {
                id: "msg-2".to_string(),
                text: "3, 2, 1".to_string(),
                text_file: None,
                text_style: "bounce".to_string(),
                text_style_preset: None,
                style_overrides: None,
                repeat_count: None,
                speed: Some(1.0),
                split_enabled: Some(true),
                split_separator: Some(",".to_string()),
            },
            MessageConfig {
                id: "msg-3".to_string(),
                text: "It's time to party 🥳".to_string(),
                text_file: None,
                text_style: "scrolling-capitals".to_string(),
                text_style_preset: Some("scrolling-capitals-centered".to_string()),
                style_overrides: None,
                repeat_count: None,
                speed: None,
                split_enabled: None,
                split_separator: None,
            },
        ];

        // Default message tree
        let default_message_tree = serde_json::json!([
            {
                "type": "folder",
                "id": "party-countdown",
                "name": "Party Countdown",
                "children": [
                    {
                        "type": "message",
                        "id": "msg-1",
                        "message": {
                            "id": "msg-1",
                            "text": "Countdown initiated...",
                            "textStyle": "typewriter"
                        }
                    },
                    {
                        "type": "message",
                        "id": "msg-2",
                        "message": {
                            "id": "msg-2",
                            "text": "3, 2, 1",
                            "textStyle": "bounce",
                            "splitEnabled": true,
                            "splitSeparator": ",",
                            "speed": 1.0
                        }
                    },
                    {
                        "type": "message",
                        "id": "msg-3",
                        "message": {
                            "id": "msg-3",
                            "text": "It's time to party 🥳",
                            "textStyle": "scrolling-capitals",
                            "textStylePreset": "scrolling-capitals-centered"
                        }
                    }
                ]
            }
        ]);
        
        let default_viz_presets = vec![
            VisualizationPreset {
                id: "fireplace-default".to_string(),
                name: "Fireplace".to_string(),
                visualization_id: "fireplace".to_string(),
                settings: serde_json::json!({
                    "emberCount": 15,
                    "flameCount": 12,
                    "flameHeight": 1.0,
                    "glowColor": "#ea580c",
                    "showLogs": true
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            },
            VisualizationPreset {
                id: "fireplace-blue-glow".to_string(),
                name: "Blue Glow".to_string(),
                visualization_id: "fireplace".to_string(),
                settings: serde_json::json!({
                    "emberCount": 0,
                    "flameCount": 0,
                    "flameHeight": 0,
                    "glowColor": "#1e3a8a",
                    "showLogs": false
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            },
            VisualizationPreset {
                id: "photo-slideshow-default".to_string(),
                name: "Photo Slideshow".to_string(),
                visualization_id: "photo-slideshow".to_string(),
                settings: serde_json::json!({
                    "sourceType": "local",
                    "folderPath": "",
                    "photosAlbumName": "",
                    "displayDuration": 5,
                    "transitionDuration": 0.8,
                    "randomOrder": false,
                    "enableFade": true,
                    "enableSlide": true,
                    "enableZoom": true,
                    "enable3DRotate": true,
                    "enableCube": false,
                    "enableFlip": true,
                    "fitMode": "cover",
                    "smartCrop": true,
                    "videoSound": true,
                    "videoVolume": 50
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            },
            VisualizationPreset {
                id: "particles-default".to_string(),
                name: "Particles".to_string(),
                visualization_id: "particles".to_string(),
                settings: serde_json::json!({
                    "particleCount": 80,
                    "particleSize": 5,
                    "speed": 0.5,
                    "particleColor": "#f59e0b",
                    "colorful": true,
                    "spread": 1.5
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            },
            VisualizationPreset {
                id: "youtube-default".to_string(),
                name: "YouTube".to_string(),
                visualization_id: "youtube".to_string(),
                settings: serde_json::json!({
                    "videoUrl": "https://youtu.be/uNNk-V08J7k?si=0chlR1UB6XYRxPc3",
                    "showControls": false,
                    "muted": true,
                    "volume": 50
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            },
            VisualizationPreset {
                id: "techno-default".to_string(),
                name: "Techno".to_string(),
                visualization_id: "techno".to_string(),
                settings: serde_json::json!({
                    "barCount": 48,
                    "sphereScale": 1.0,
                    "sphereDistort": 0.5,
                    "colorScheme": "rainbow",
                    "showSphere": false,
                    "showBars": true
                }),
                enabled: Some(true),
                order: None,
                icon: None,
            }
        ];

        let default_text_style_presets = vec![
            TextStylePreset {
                id: "scrolling-capitals-centered".to_string(),
                name: "Scrolling Capitals Centered".to_string(),
                text_style_id: "scrolling-capitals".to_string(),
                settings: serde_json::json!({
                    "position": "center",
                    "fontSize": 12,
                    "glowIntensity": 0.5,
                    "color": "#ffffff"
                }),
            }
        ];
        
        Self {
            active_visualization: Mutex::new("fireplace".to_string()),
            enabled_visualizations: Mutex::new(vec!["fireplace".to_string(), "techno".to_string()]),
            common_settings: Mutex::new(CommonSettings::default()),
            visualization_settings: Mutex::new(serde_json::json!({})),
            visualization_presets: Mutex::new(default_viz_presets),
            active_visualization_preset: Mutex::new(Some("fireplace-blue-glow".to_string())),
            messages: Mutex::new(default_messages),
            message_tree: Mutex::new(default_message_tree),
            default_text_style: Mutex::new("scrolling-capitals".to_string()),
            text_style_settings: Mutex::new(serde_json::json!({})),
            text_style_presets: Mutex::new(default_text_style_presets),
            message_stats: Mutex::new(serde_json::json!({})),
            folder_playback_queue: Mutex::new(None),
            config_base_path: Mutex::new(None),
            server_port: Mutex::new(8080),
            triggered_message: Mutex::new(None),
            last_e2e_report: Mutex::new(None),
            state_tx,
            command_tx,
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
        let folder_playback_queue = self.folder_playback_queue.lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        let triggered_message = self.triggered_message.lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        
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
            triggered_message,
            folder_playback_queue,
            mode,
        }
    }

    /// Broadcast current state to all SSE subscribers
    pub fn broadcast(&self, triggered_message: Option<MessageConfig>) {
        // Store triggered_message in state so it persists across broadcasts
        if let Ok(mut tm) = self.triggered_message.lock() {
            *tm = triggered_message.clone();
        }
        let state = self.get_state();
        // Ignore send errors (no subscribers)
        let _ = self.state_tx.send(state);
    }
    
    /// Broadcast a transient command to all SSE subscribers
    pub fn broadcast_command(&self, command: RemoteCommand) {
        let _ = self.command_tx.send(command);
    }
    
    /// Clear the triggered message (called when message completes)
    pub fn clear_triggered_message(&self) {
        if let Ok(mut tm) = self.triggered_message.lock() {
            *tm = None;
        }
        // Broadcast the cleared state
        let state = self.get_state();
        let _ = self.state_tx.send(state);
    }

    /// Load configuration from a JSON file
    pub fn load_config_from_file(&self, config_path: &str) -> Result<(), String> {
        let path = Path::new(config_path);
        if !path.exists() {
            return Err(format!("Config file does not exist: {}", config_path));
        }
        
        // Extract and set the config base path (directory containing the config file)
        if let Some(parent) = path.parent() {
            let base_path = parent.to_string_lossy().to_string();
            eprintln!("[Rust] Setting config base path from file: {}", base_path);
            if let Ok(mut m) = self.config_base_path.lock() {
                *m = Some(base_path);
            }
        }
        
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        
        let config: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
        
        // Apply configuration similar to the "load-configuration" command handler
        if let Some(obj) = config.as_object() {
            if let Some(viz) = obj.get("activeVisualization").and_then(|v| v.as_str()) {
                if let Ok(mut m) = self.active_visualization.lock() {
                    *m = viz.to_string();
                }
            }
            if let Some(vizs) = obj.get("enabledVisualizations").and_then(|v| v.as_array()) {
                if let Ok(mut m) = self.enabled_visualizations.lock() {
                    *m = vizs.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
            if let Some(settings) = obj.get("commonSettings") {
                if let Ok(s) = serde_json::from_value::<CommonSettings>(settings.clone()) {
                    if let Ok(mut m) = self.common_settings.lock() {
                        *m = s;
                    }
                }
            }
            if let Some(settings) = obj.get("visualizationSettings") {
                if let Ok(mut m) = self.visualization_settings.lock() {
                    *m = settings.clone();
                }
            }
            if let Some(msgs) = obj.get("messages") {
                if let Ok(messages) = serde_json::from_value::<Vec<MessageConfig>>(msgs.clone()) {
                    if let Ok(mut m) = self.messages.lock() {
                        *m = messages;
                    }
                }
            }
            if let Some(tree) = obj.get("messageTree") {
                if let Ok(mut t) = self.message_tree.lock() {
                    *t = tree.clone();
                }
                // Ensure flattened messages match tree
                let flat = flatten_message_tree_value(&tree);
                if let Ok(mut m) = self.messages.lock() {
                    *m = flat;
                }
            } else {
                // If no tree was provided, build a flat tree from messages
                if let Ok(m) = self.messages.lock() {
                    if let Ok(mut t) = self.message_tree.lock() {
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
                if let Ok(mut m) = self.default_text_style.lock() {
                    *m = style.to_string();
                }
            }
            if let Some(settings) = obj.get("textStyleSettings") {
                if let Ok(mut m) = self.text_style_settings.lock() {
                    *m = settings.clone();
                }
            }
            if let Some(presets) = obj.get("visualizationPresets") {
                if let Ok(p) = serde_json::from_value::<Vec<VisualizationPreset>>(presets.clone()) {
                    if let Ok(mut m) = self.visualization_presets.lock() {
                        *m = p;
                    }
                }
            }
            if let Some(preset_id) = obj.get("activeVisualizationPreset").and_then(|v| v.as_str()) {
                if let Ok(mut m) = self.active_visualization_preset.lock() {
                    *m = Some(preset_id.to_string());
                }
            }
            if let Some(presets) = obj.get("textStylePresets") {
                if let Ok(p) = serde_json::from_value::<Vec<TextStylePreset>>(presets.clone()) {
                    if let Ok(mut m) = self.text_style_presets.lock() {
                        *m = p;
                    }
                }
            }
            if let Some(stats) = obj.get("messageStats") {
                if let Ok(mut m) = self.message_stats.lock() {
                    *m = stats.clone();
                }
            }
        }
        
        // Broadcast the updated state
        self.broadcast(None);
        
        Ok(())
    }
}
