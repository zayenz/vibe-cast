use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;
use tokio::sync::broadcast;
use vibe_cast_models::{
    BroadcastState, CommonSettings, DeviceType, E2EClientKind, E2EClientSnapshot,
    E2EConfigResponse, E2EProbeEvent, E2EReport, E2ESessionStartResponse, E2ESessionSummary,
    E2EStateSnapshot, FolderPlaybackQueue, MessageConfig, MessageInfo, PlaybackCommand,
    PlaybackControlState, RemoteCommand, RemoteMessageStats, RemoteStateV2,
    RemoteVisualizationPreset, TextStylePreset, VisualizationPreset,
};

const MAX_E2E_SESSIONS: usize = 8;
const MAX_E2E_EVENTS_PER_SESSION: usize = 4_000;

#[derive(Clone)]
struct E2ESessionRecord {
    session_id: String,
    scenario_name: Option<String>,
    started_at: u64,
    ended_at: Option<u64>,
    app_pid: u32,
    server_port: u16,
    status: String,
    events: VecDeque<E2EProbeEvent>,
    client_snapshots: HashMap<String, E2EClientSnapshot>,
    server_snapshot: Option<E2EStateSnapshot>,
    perf_counters: HashMap<String, u64>,
    failure_annotations: Vec<String>,
}

impl E2ESessionRecord {
    fn to_summary(&self) -> E2ESessionSummary {
        E2ESessionSummary {
            session_id: self.session_id.clone(),
            scenario_name: self.scenario_name.clone(),
            started_at: self.started_at,
            ended_at: self.ended_at,
            app_pid: self.app_pid,
            server_port: self.server_port,
            status: self.status.clone(),
            event_count: self.events.len(),
            client_snapshots: self.client_snapshots.clone(),
            server_snapshot: self.server_snapshot.clone(),
            perf_counters: self.perf_counters.clone(),
            failure_annotations: self.failure_annotations.clone(),
        }
    }
}

#[derive(Default)]
struct E2ESessionRegistry {
    active_session_id: Option<String>,
    session_order: VecDeque<String>,
    sessions: HashMap<String, E2ESessionRecord>,
}

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
                                if let Ok(msg) =
                                    serde_json::from_value::<MessageConfig>(msg_val.clone())
                                {
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

fn build_flat_message_tree_value(messages: &[MessageConfig]) -> serde_json::Value {
    serde_json::Value::Array(
        messages
            .iter()
            .map(|message| {
                serde_json::json!({
                    "type": "message",
                    "id": message.id,
                    "message": message,
                })
            })
            .collect(),
    )
}

fn compact_message_stats_map(
    message_stats: &serde_json::Value,
) -> std::collections::HashMap<String, RemoteMessageStats> {
    let Some(stats_object) = message_stats.as_object() else {
        return std::collections::HashMap::new();
    };

    stats_object
        .iter()
        .map(|(message_id, raw_stats)| {
            let trigger_count = raw_stats
                .get("triggerCount")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            let last_triggered = raw_stats
                .get("lastTriggered")
                .and_then(|value| value.as_u64())
                .unwrap_or(0);

            (
                message_id.clone(),
                RemoteMessageStats {
                    message_id: message_id.clone(),
                    trigger_count,
                    last_triggered,
                },
            )
        })
        .collect()
}

/// Shared application state for syncing between windows and the remote
pub struct AppStateSync {
    pub config_revision: Mutex<u64>,
    pub runtime_revision: Mutex<u64>,
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
    e2e_enabled: bool,
    e2e_sessions: Mutex<E2ESessionRegistry>,
    /// Playback control state for message synchronization
    pub playback_control: Mutex<PlaybackControlState>,
    /// Broadcast channel for SSE - sends full state on every change
    pub state_tx: broadcast::Sender<BroadcastState>,
    /// Broadcast channel for the lightweight remote contract.
    pub remote_state_tx: broadcast::Sender<RemoteStateV2>,
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
        let (remote_state_tx, _) = broadcast::channel(64);
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
                style_overrides: Some(serde_json::json!({
                    "displayDuration": 1.5
                })),
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
                            "styleOverrides": {
                                "displayDuration": 1.5
                            },
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
                    "folderPath": "",
                    "photosAlbumName": "",
                    "displayDuration": 5,
                    "transitionDuration": 0.8,
                    "randomOrder": false,
                    "enableFade": true,
                    "enableSlide": true,
                    "enableZoom": true,
                    "enable3DRotate": true,
                    "enableCube": true,
                    "enableFlipX": true,
                    "enableFlipY": true,
                    "fitMode": "contain",
                    "smartCrop": false,
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
            },
        ];

        let default_text_style_presets = vec![TextStylePreset {
            id: "scrolling-capitals-centered".to_string(),
            name: "Scrolling Capitals Centered".to_string(),
            text_style_id: "scrolling-capitals".to_string(),
            settings: serde_json::json!({
                "position": "center",
                "fontSize": 12,
                "glowIntensity": 0.5,
                "color": "#ffffff"
            }),
        }];

        Self {
            config_revision: Mutex::new(0),
            runtime_revision: Mutex::new(0),
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
            server_port: Mutex::new(0), // 0 indicates not yet bound
            triggered_message: Mutex::new(None),
            last_e2e_report: Mutex::new(None),
            e2e_enabled: std::env::var("VIBECAST_E2E")
                .map(|value| {
                    let normalized = value.trim().to_ascii_lowercase();
                    matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
                })
                .unwrap_or(false),
            e2e_sessions: Mutex::new(E2ESessionRegistry::default()),
            playback_control: Mutex::new(PlaybackControlState::default()),
            state_tx,
            remote_state_tx,
            command_tx,
        }
    }

    fn set_triggered_message_value(&self, message: Option<MessageConfig>) {
        if let Ok(mut triggered_message) = self.triggered_message.lock() {
            *triggered_message = message;
        }
    }

    fn bump_revision(revision: &Mutex<u64>) -> u64 {
        revision
            .lock()
            .map(|mut current| {
                *current += 1;
                *current
            })
            .unwrap_or(0)
    }

    pub fn mark_config_changed(&self) -> u64 {
        Self::bump_revision(&self.config_revision)
    }

    pub fn mark_runtime_changed(&self) -> u64 {
        Self::bump_revision(&self.runtime_revision)
    }

    pub fn is_e2e_enabled(&self) -> bool {
        self.e2e_enabled
    }

    pub fn get_e2e_config(&self) -> E2EConfigResponse {
        E2EConfigResponse {
            enabled: self.e2e_enabled,
            active_session_id: self.get_active_e2e_session_id(),
            server_port: self
                .server_port
                .lock()
                .ok()
                .map(|port| *port)
                .filter(|port| *port != 0),
        }
    }

    pub fn get_active_e2e_session_id(&self) -> Option<String> {
        self.e2e_sessions
            .lock()
            .ok()
            .and_then(|registry| registry.active_session_id.clone())
    }

    pub fn start_e2e_session(&self, scenario_name: Option<String>) -> E2ESessionStartResponse {
        let started_at = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let session_id = format!("e2e-{}", started_at);
        let server_port = self.server_port.lock().ok().map(|port| *port).unwrap_or(0);
        let initial_snapshot = self.get_e2e_state_snapshot(None);
        let record = E2ESessionRecord {
            session_id: session_id.clone(),
            scenario_name,
            started_at,
            ended_at: None,
            app_pid: std::process::id(),
            server_port,
            status: "active".to_string(),
            events: VecDeque::new(),
            client_snapshots: HashMap::new(),
            server_snapshot: Some(initial_snapshot),
            perf_counters: HashMap::new(),
            failure_annotations: Vec::new(),
        };

        if let Ok(mut registry) = self.e2e_sessions.lock() {
            registry.active_session_id = Some(session_id.clone());
            registry.session_order.push_back(session_id.clone());
            registry.sessions.insert(session_id.clone(), record);
            while registry.session_order.len() > MAX_E2E_SESSIONS {
                if let Some(expired_session_id) = registry.session_order.pop_front() {
                    registry.sessions.remove(&expired_session_id);
                    if registry.active_session_id.as_deref() == Some(expired_session_id.as_str()) {
                        registry.active_session_id = None;
                    }
                }
            }
        }

        E2ESessionStartResponse {
            session_id,
            server_port,
        }
    }

    pub fn end_e2e_session(
        &self,
        session_id: &str,
        status: Option<String>,
        failure_reason: Option<String>,
    ) -> Result<(), String> {
        let ended_at = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let final_status = status.unwrap_or_else(|| "completed".to_string());

        let mut registry = self
            .e2e_sessions
            .lock()
            .map_err(|_| "Failed to lock E2E session registry".to_string())?;
        let record = registry
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Unknown E2E session: {}", session_id))?;

        record.ended_at = Some(ended_at);
        record.status = final_status;
        record.server_snapshot = Some(self.get_e2e_state_snapshot(None));
        if let Some(reason) = failure_reason {
            record.failure_annotations.push(reason);
        }
        if registry.active_session_id.as_deref() == Some(session_id) {
            registry.active_session_id = None;
        }
        Ok(())
    }

    pub fn get_e2e_session_events(&self, session_id: &str) -> Option<Vec<E2EProbeEvent>> {
        self.e2e_sessions.lock().ok().and_then(|registry| {
            registry
                .sessions
                .get(session_id)
                .map(|record| record.events.iter().cloned().collect())
        })
    }

    pub fn get_e2e_session_summary(&self, session_id: &str) -> Option<E2ESessionSummary> {
        self.e2e_sessions.lock().ok().and_then(|registry| {
            registry
                .sessions
                .get(session_id)
                .map(E2ESessionRecord::to_summary)
        })
    }

    pub fn record_e2e_probe(&self, event: E2EProbeEvent) {
        if !self.e2e_enabled {
            return;
        }

        let mut registry = match self.e2e_sessions.lock() {
            Ok(registry) => registry,
            Err(_) => return,
        };
        let Some(record) = registry.sessions.get_mut(&event.session_id) else {
            return;
        };

        *record
            .perf_counters
            .entry(event.event_type.clone())
            .or_insert(0) += 1;

        if let Some(snapshot) = event
            .payload
            .get("snapshot")
            .and_then(|value| serde_json::from_value::<E2EStateSnapshot>(value.clone()).ok())
        {
            if event.client_kind == E2EClientKind::Server {
                record.server_snapshot = Some(snapshot);
            } else {
                record.client_snapshots.insert(
                    event.client_id.clone(),
                    E2EClientSnapshot {
                        client_id: event.client_id.clone(),
                        client_label: event.client_label.clone(),
                        client_kind: event.client_kind.clone(),
                        updated_at: event.ts,
                        snapshot,
                    },
                );
            }
        }

        if record.events.len() >= MAX_E2E_EVENTS_PER_SESSION {
            record.events.pop_front();
        }
        record.events.push_back(event);
    }

    pub fn record_server_e2e_event(
        &self,
        event_type: &str,
        payload: serde_json::Value,
        session_id: Option<&str>,
        client_id: Option<&str>,
        client_label: Option<&str>,
        client_kind: Option<E2EClientKind>,
    ) {
        if !self.e2e_enabled {
            return;
        }

        let Some(session_id) = session_id
            .map(|id| id.to_string())
            .or_else(|| self.get_active_e2e_session_id())
        else {
            return;
        };

        let ts = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.record_e2e_probe(E2EProbeEvent {
            session_id,
            client_id: client_id.unwrap_or("server").to_string(),
            client_label: client_label.unwrap_or("server").to_string(),
            client_kind: client_kind.unwrap_or(E2EClientKind::Server),
            event_type: event_type.to_string(),
            ts,
            payload,
        });
    }

    pub fn get_e2e_state_snapshot(&self, connection_phase: Option<String>) -> E2EStateSnapshot {
        let config_revision = self.config_revision.lock().map(|value| *value).unwrap_or(0);
        let runtime_revision = self
            .runtime_revision
            .lock()
            .map(|value| *value)
            .unwrap_or(0);
        let active_visualization = self
            .active_visualization
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "fireplace".to_string());
        let active_visualization_preset = self
            .active_visualization_preset
            .lock()
            .ok()
            .and_then(|value| value.clone());
        let triggered_message_id = self
            .triggered_message
            .lock()
            .ok()
            .and_then(|message| message.clone().map(|value| value.id));
        let playback_control = self
            .playback_control
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let folder_playback_queue = self
            .folder_playback_queue
            .lock()
            .ok()
            .and_then(|queue| queue.clone());
        let message_trigger_counts = self
            .message_stats
            .lock()
            .map(|value| compact_message_stats_map(&value))
            .unwrap_or_default()
            .into_iter()
            .map(|(message_id, stats)| (message_id, stats.trigger_count))
            .collect();
        let queue_current_message_id = folder_playback_queue
            .as_ref()
            .and_then(|queue| queue.message_ids.get(queue.current_index).cloned());

        E2EStateSnapshot {
            config_revision,
            runtime_revision,
            active_visualization,
            active_visualization_preset,
            triggered_message_id,
            playback_session_id: playback_control.session_id.clone(),
            playback_is_playing: playback_control.is_playing,
            playback_current_message_id: playback_control
                .current_message
                .as_ref()
                .map(|message| message.id.clone()),
            queue_folder_id: folder_playback_queue
                .as_ref()
                .map(|queue| queue.folder_id.clone()),
            queue_current_index: folder_playback_queue
                .as_ref()
                .map(|queue| queue.current_index),
            queue_current_message_id,
            message_trigger_counts,
            connection_phase,
        }
    }

    /// Get current state snapshot
    pub fn get_state(&self) -> BroadcastState {
        let config_revision = self
            .config_revision
            .lock()
            .map(|revision| *revision)
            .unwrap_or(0);
        let runtime_revision = self
            .runtime_revision
            .lock()
            .map(|revision| *revision)
            .unwrap_or(0);
        let active_visualization = self
            .active_visualization
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| "fireplace".to_string());
        let enabled_visualizations = self
            .enabled_visualizations
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let common_settings = self
            .common_settings
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let visualization_settings = self
            .visualization_settings
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        let visualization_presets = self
            .visualization_presets
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let active_visualization_preset = self
            .active_visualization_preset
            .lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        let messages = self.messages.lock().map(|m| m.clone()).unwrap_or_default();
        let message_tree = self
            .message_tree
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!([]));
        let default_text_style = self
            .default_text_style
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| "scrolling-capitals".to_string());
        let text_style_settings = self
            .text_style_settings
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        let text_style_presets = self
            .text_style_presets
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        let message_stats = self
            .message_stats
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| serde_json::json!({}));
        let folder_playback_queue = self
            .folder_playback_queue
            .lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        let triggered_message = self
            .triggered_message
            .lock()
            .map(|m| m.clone())
            .unwrap_or(None);
        let playback_control = self
            .playback_control
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();

        // Legacy mode field
        let mode = active_visualization.clone();

        BroadcastState {
            config_revision,
            runtime_revision,
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
            playback_control,
            mode,
        }
    }

    /// Get the compact remote-only state snapshot without cloning desktop-only fields.
    pub fn get_remote_state(&self) -> RemoteStateV2 {
        let config_revision = self
            .config_revision
            .lock()
            .map(|revision| *revision)
            .unwrap_or(0);
        let runtime_revision = self
            .runtime_revision
            .lock()
            .map(|revision| *revision)
            .unwrap_or(0);
        let active_visualization = self
            .active_visualization
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "fireplace".to_string());
        let active_visualization_preset = self
            .active_visualization_preset
            .lock()
            .map(|value| value.clone())
            .unwrap_or(None);
        let common_settings = self
            .common_settings
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let visualization_presets = self
            .visualization_presets
            .lock()
            .map(|presets| {
                presets
                    .iter()
                    .map(|preset| RemoteVisualizationPreset {
                        id: preset.id.clone(),
                        name: preset.name.clone(),
                        visualization_id: preset.visualization_id.clone(),
                        enabled: preset.enabled,
                        icon: preset.icon.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let message_tree = {
            let message_tree = self
                .message_tree
                .lock()
                .map(|value| value.clone())
                .unwrap_or_else(|_| serde_json::json!([]));
            let has_tree_entries =
                matches!(&message_tree, serde_json::Value::Array(nodes) if !nodes.is_empty());
            if has_tree_entries {
                message_tree
            } else {
                let messages = self
                    .messages
                    .lock()
                    .map(|value| value.clone())
                    .unwrap_or_default();
                build_flat_message_tree_value(&messages)
            }
        };
        let message_stats = self
            .message_stats
            .lock()
            .map(|value| compact_message_stats_map(&value))
            .unwrap_or_default();
        let triggered_message = self
            .triggered_message
            .lock()
            .map(|value| value.clone())
            .unwrap_or(None);
        let playback_control = self
            .playback_control
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let folder_playback_queue = self
            .folder_playback_queue
            .lock()
            .map(|value| value.clone())
            .unwrap_or(None);

        RemoteStateV2 {
            schema_version: 2,
            config_revision,
            runtime_revision,
            active_visualization,
            active_visualization_preset,
            common_settings,
            visualization_presets,
            message_tree,
            message_stats,
            triggered_message,
            playback_control,
            folder_playback_queue,
        }
    }

    /// Broadcast current state to all SSE subscribers
    pub fn broadcast(&self, triggered_message: Option<MessageConfig>) {
        self.set_triggered_message_value(triggered_message);
        self.broadcast_current_state();
    }

    /// Broadcast the current desktop and remote snapshots.
    pub fn broadcast_current_state(&self) {
        let state = self.get_state();
        let remote_state = self.get_remote_state();
        let snapshot_value = serde_json::to_value(self.get_e2e_state_snapshot(None))
            .unwrap_or_else(|_| serde_json::json!({}));
        let _ = self.state_tx.send(state);
        let _ = self.remote_state_tx.send(remote_state);
        self.record_server_e2e_event(
            "server_desktop_state_broadcast",
            serde_json::json!({ "snapshot": snapshot_value.clone() }),
            None,
            None,
            None,
            Some(E2EClientKind::Server),
        );
        self.record_server_e2e_event(
            "server_remote_state_broadcast",
            serde_json::json!({ "snapshot": snapshot_value }),
            None,
            None,
            None,
            Some(E2EClientKind::Server),
        );
    }

    /// Broadcast a transient command to all SSE subscribers
    pub fn broadcast_command(&self, command: RemoteCommand) {
        let _ = self.command_tx.send(command);
    }

    /// Clear the triggered message (called when message completes)
    pub fn clear_triggered_message(&self) {
        self.set_triggered_message_value(None);
        self.mark_runtime_changed();
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

        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read config file: {}", e))?;

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
                    *m = vizs
                        .iter()
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
                let flat = flatten_message_tree_value(tree);
                if let Ok(mut m) = self.messages.lock() {
                    *m = flat;
                }
            } else {
                // If no tree was provided, build a flat tree from messages
                if let Ok(m) = self.messages.lock() {
                    if let Ok(mut t) = self.message_tree.lock() {
                        *t = serde_json::json!(m
                            .iter()
                            .map(|msg| serde_json::json!({
                                "type": "message",
                                "id": msg.id,
                                "message": msg
                            }))
                            .collect::<Vec<serde_json::Value>>());
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
            if let Some(preset_id) = obj
                .get("activeVisualizationPreset")
                .and_then(|v| v.as_str())
            {
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

        self.mark_config_changed();
        self.broadcast_current_state();

        Ok(())
    }

    /// Update playback control state without broadcasting.
    pub fn update_playback_control(&self, new_state: PlaybackControlState) {
        {
            if let Ok(mut state) = self.playback_control.lock() {
                *state = new_state;
            }
        }
        self.mark_runtime_changed();
    }

    /// Get current playback control state
    pub fn get_playback_control(&self) -> PlaybackControlState {
        self.playback_control
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default()
    }

    /// Start message playback and update control state
    pub fn start_message_playback(
        &self,
        message_id: &str,
        device_type: DeviceType,
    ) -> Result<(), String> {
        // Find the message
        let message = {
            let messages = self
                .messages
                .lock()
                .map_err(|_| "Failed to lock messages")?;
            messages
                .iter()
                .find(|msg| msg.id == message_id)
                .cloned()
                .ok_or_else(|| format!("Message not found: {}", message_id))?
        };

        // Create message info
        let message_info = MessageInfo {
            id: message.id.clone(),
            title: message.text.clone(),
            duration: self.calculate_message_duration(&message),
            folder_path: self.get_message_folder_path(&message.id),
        };

        // Generate session ID
        let session_id = format!(
            "session_{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        // Update playback control state
        let new_state = PlaybackControlState {
            session_id: Some(session_id),
            current_message: Some(message_info),
            is_playing: true,
            playback_position: std::time::Duration::from_secs(0),
            can_stop: true,
            can_start: false,
            initiated_by: device_type,
            last_updated: SystemTime::now(),
        };

        self.update_playback_control(new_state);
        self.set_triggered_message_value(Some(message));

        Ok(())
    }

    /// Start message playback using a provided message (no lookup).
    /// Use when the frontend sends the full message and it may not yet be in state.messages.
    pub fn start_message_playback_with_message(
        &self,
        message: MessageConfig,
        device_type: DeviceType,
    ) {
        let message_info = MessageInfo {
            id: message.id.clone(),
            title: message.text.clone(),
            duration: self.calculate_message_duration(&message),
            folder_path: self.get_message_folder_path(&message.id),
        };

        let session_id = format!(
            "session_{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let new_state = PlaybackControlState {
            session_id: Some(session_id),
            current_message: Some(message_info),
            is_playing: true,
            playback_position: std::time::Duration::from_secs(0),
            can_stop: true,
            can_start: false,
            initiated_by: device_type,
            last_updated: SystemTime::now(),
        };

        self.update_playback_control(new_state);
        self.set_triggered_message_value(Some(message));
    }

    /// Stop message playback and update control state
    pub fn stop_message_playback(&self, device_type: DeviceType) {
        let new_state = PlaybackControlState {
            session_id: None,
            current_message: None,
            is_playing: false,
            playback_position: std::time::Duration::from_secs(0),
            can_stop: false,
            can_start: true,
            initiated_by: device_type,
            last_updated: SystemTime::now(),
        };

        self.update_playback_control(new_state);
        self.set_triggered_message_value(None);
    }

    /// Process a playback command with validation and error handling
    /// This is the main entry point for all playback control commands
    pub fn process_playback_command(
        &self,
        command: PlaybackCommand,
    ) -> Result<PlaybackControlState, PlaybackError> {
        match command {
            PlaybackCommand::Start {
                message_id,
                device_id,
                timestamp,
            } => self.process_start_command(&message_id, &device_id, timestamp),
            PlaybackCommand::Stop {
                device_id,
                timestamp,
            } => self.process_stop_command(&device_id, timestamp),
            PlaybackCommand::Pause {
                device_id,
                timestamp,
            } => self.process_pause_command(&device_id, timestamp),
            PlaybackCommand::Resume {
                device_id,
                timestamp,
            } => self.process_resume_command(&device_id, timestamp),
        }
    }

    /// Process a start command with validation
    fn process_start_command(
        &self,
        message_id: &str,
        device_id: &str,
        timestamp: SystemTime,
    ) -> Result<PlaybackControlState, PlaybackError> {
        // Validate message exists
        let message = {
            let messages = self.messages.lock().map_err(|_| {
                PlaybackError::StateCorruption("Failed to lock messages".to_string())
            })?;
            messages
                .iter()
                .find(|msg| msg.id == message_id)
                .cloned()
                .ok_or_else(|| PlaybackError::MessageNotFound(message_id.to_string()))?
        };

        // Check current state to ensure we can start
        let current_state = self.get_playback_control();
        if current_state.is_playing {
            return Err(PlaybackError::InvalidCommand(
                "Cannot start playback: another message is already playing".to_string(),
            ));
        }

        // Determine device type from device_id
        let device_type = self.parse_device_type(device_id)?;

        // Create message info
        let message_info = MessageInfo {
            id: message.id.clone(),
            title: message.text.clone(),
            duration: self.calculate_message_duration(&message),
            folder_path: self.get_message_folder_path(&message.id),
        };

        // Generate session ID
        let session_id = format!(
            "session_{}_{}",
            timestamp
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            device_id
        );

        // Create new playback state
        let new_state = PlaybackControlState {
            session_id: Some(session_id),
            current_message: Some(message_info),
            is_playing: true,
            playback_position: std::time::Duration::from_secs(0),
            can_stop: true,
            can_start: false,
            initiated_by: device_type,
            last_updated: timestamp,
        };

        // Update state and broadcast once after all mutations are applied.
        self.update_playback_control(new_state.clone());
        self.set_triggered_message_value(Some(message));
        self.broadcast_current_state();

        Ok(new_state)
    }

    /// Process a stop command
    fn process_stop_command(
        &self,
        device_id: &str,
        timestamp: SystemTime,
    ) -> Result<PlaybackControlState, PlaybackError> {
        let current_state = self.get_playback_control();

        // Validate that we can stop (must be playing or paused)
        if !current_state.is_playing && current_state.current_message.is_none() {
            return Err(PlaybackError::InvalidCommand(
                "Cannot stop playback: no active playback session".to_string(),
            ));
        }

        let device_type = self.parse_device_type(device_id)?;

        // Create stopped state
        let new_state = PlaybackControlState {
            session_id: None,
            current_message: None,
            is_playing: false,
            playback_position: std::time::Duration::from_secs(0),
            can_stop: false,
            can_start: true,
            initiated_by: device_type,
            last_updated: timestamp,
        };

        // Update state and broadcast once after all mutations are applied.
        self.update_playback_control(new_state.clone());
        self.set_triggered_message_value(None);
        self.broadcast_current_state();

        Ok(new_state)
    }

    /// Process a pause command
    fn process_pause_command(
        &self,
        device_id: &str,
        timestamp: SystemTime,
    ) -> Result<PlaybackControlState, PlaybackError> {
        let current_state = self.get_playback_control();

        // Validate that we can pause (must be playing)
        if !current_state.is_playing {
            return Err(PlaybackError::InvalidCommand(
                "Cannot pause playback: no active playback".to_string(),
            ));
        }

        let device_type = self.parse_device_type(device_id)?;

        // Create paused state (keep message and session, but not playing)
        let new_state = PlaybackControlState {
            session_id: current_state.session_id,
            current_message: current_state.current_message,
            is_playing: false,
            playback_position: current_state.playback_position, // Preserve position
            can_stop: true,                                     // Can still stop when paused
            can_start: true,                                    // Can resume when paused
            initiated_by: device_type,
            last_updated: timestamp,
        };

        // Update state and broadcast once after all mutations are applied.
        self.update_playback_control(new_state.clone());
        self.broadcast_current_state();

        Ok(new_state)
    }

    /// Process a resume command
    fn process_resume_command(
        &self,
        device_id: &str,
        timestamp: SystemTime,
    ) -> Result<PlaybackControlState, PlaybackError> {
        let current_state = self.get_playback_control();

        // Validate that we can resume (must be paused - has message but not playing)
        if current_state.is_playing {
            return Err(PlaybackError::InvalidCommand(
                "Cannot resume playback: already playing".to_string(),
            ));
        }

        if current_state.current_message.is_none() {
            return Err(PlaybackError::InvalidCommand(
                "Cannot resume playback: no paused session".to_string(),
            ));
        }

        let device_type = self.parse_device_type(device_id)?;

        // Find the full message config for backward compatibility BEFORE updating state
        let message_to_broadcast = if let Some(ref message_info) = current_state.current_message {
            if let Ok(messages) = self.messages.lock() {
                messages
                    .iter()
                    .find(|msg| msg.id == message_info.id)
                    .cloned()
            } else {
                None
            }
        } else {
            None
        };

        // Create resumed state
        let new_state = PlaybackControlState {
            session_id: current_state.session_id,
            current_message: current_state.current_message,
            is_playing: true,
            playback_position: current_state.playback_position, // Resume from where we paused
            can_stop: true,
            can_start: false,
            initiated_by: device_type,
            last_updated: timestamp,
        };

        // Update state and broadcast once after all mutations are applied.
        self.update_playback_control(new_state.clone());

        if let Some(message) = message_to_broadcast {
            self.set_triggered_message_value(Some(message));
        }
        self.broadcast_current_state();

        Ok(new_state)
    }

    /// Parse device type from device ID string
    fn parse_device_type(&self, device_id: &str) -> Result<DeviceType, PlaybackError> {
        match device_id {
            id if id.starts_with("control_plane") || id.starts_with("control-plane") => {
                Ok(DeviceType::ControlPlane)
            }
            id if id.starts_with("mobile_remote") || id.starts_with("mobile-remote") => {
                Ok(DeviceType::MobileRemote)
            }
            id if id.starts_with("system") => Ok(DeviceType::System),
            _ => {
                // Default to mobile remote for unknown device IDs (most likely from web interface)
                Ok(DeviceType::MobileRemote)
            }
        }
    }

    fn resolve_message_style_id(&self, message: &MessageConfig) -> String {
        if let Some(preset_id) = &message.text_style_preset {
            if let Ok(presets) = self.text_style_presets.lock() {
                if let Some(preset) = presets.iter().find(|preset| &preset.id == preset_id) {
                    return preset.text_style_id.clone();
                }
            }
        }

        message.text_style.clone()
    }

    fn uses_visualizer_split_sequence(&self, message: &MessageConfig) -> bool {
        let split_active = message.split_enabled.unwrap_or(false)
            && message
                .split_separator
                .as_ref()
                .map(|separator| !separator.is_empty())
                .unwrap_or(false);

        if !split_active {
            return false;
        }

        self.resolve_message_style_id(message) != "credits"
    }

    fn merged_text_style_settings(
        &self,
        message: &MessageConfig,
        style_id: &str,
    ) -> serde_json::Map<String, serde_json::Value> {
        let mut settings = if let Some(preset_id) = &message.text_style_preset {
            self.text_style_presets
                .lock()
                .ok()
                .and_then(|presets| {
                    presets
                        .iter()
                        .find(|preset| &preset.id == preset_id)
                        .and_then(|preset| preset.settings.as_object().cloned())
                })
                .unwrap_or_default()
        } else {
            self.text_style_settings
                .lock()
                .ok()
                .and_then(|all_settings| {
                    all_settings
                        .get(style_id)
                        .and_then(|value| value.as_object().cloned())
                })
                .unwrap_or_default()
        };

        if let Some(overrides) = message
            .style_overrides
            .as_ref()
            .and_then(|value| value.as_object())
        {
            for (key, value) in overrides {
                settings.insert(key.clone(), value.clone());
            }
        }

        let speed = message.speed.unwrap_or(1.0);
        if speed != 1.0 && speed.is_finite() && speed > 0.0 {
            for key in [
                "duration",
                "displayDuration",
                "fadeInDuration",
                "fadeOutDuration",
                "typingSpeed",
            ] {
                if let Some(value) = settings.get_mut(key) {
                    if let Some(number) = value.as_f64() {
                        *value = serde_json::json!(number / speed);
                    }
                }
            }
        }

        settings
    }

    fn number_setting(
        settings: &serde_json::Map<String, serde_json::Value>,
        key: &str,
        default: f64,
    ) -> f64 {
        settings
            .get(key)
            .and_then(|value| value.as_f64())
            .filter(|value| value.is_finite())
            .unwrap_or(default)
    }

    fn effective_repeat_count(message: &MessageConfig) -> u32 {
        message.repeat_count.unwrap_or(1).max(1)
    }

    fn estimated_viewport_char_count(style_id: &str) -> f64 {
        match style_id {
            "dot-matrix" => 18.0,
            "scrolling-capitals" => 24.0,
            "credits" => 24.0,
            _ => 24.0,
        }
    }

    fn estimate_single_pass_duration_seconds(
        &self,
        style_id: &str,
        text: &str,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> f64 {
        match style_id {
            "typewriter" => {
                let typing_speed_ms = Self::number_setting(settings, "typingSpeed", 80.0);
                let hold_duration = Self::number_setting(settings, "holdDuration", 1.0);
                ((text.chars().count() as f64) * typing_speed_ms / 1000.0) + hold_duration
            }
            "bounce" => {
                let display_duration = Self::number_setting(settings, "displayDuration", 4.0);
                let fade_out_duration = Self::number_setting(settings, "fadeOutDuration", 0.8);
                1.0 + display_duration + fade_out_duration
            }
            "fade" => {
                let fade_in_duration = Self::number_setting(settings, "fadeInDuration", 0.5);
                let display_duration = Self::number_setting(settings, "displayDuration", 5.0);
                let fade_out_duration = Self::number_setting(settings, "fadeOutDuration", 0.5);
                fade_in_duration + display_duration + fade_out_duration
            }
            "scrolling-capitals" => {
                let char_duration = Self::number_setting(settings, "charDuration", 0.3);
                let total_chars =
                    Self::estimated_viewport_char_count(style_id) + text.chars().count() as f64;
                (total_chars * char_duration) + 0.3
            }
            "dot-matrix" => {
                let fade_in_duration = Self::number_setting(settings, "fadeInDuration", 1.0);
                let scroll_speed = Self::number_setting(settings, "scrollSpeed", 3.0).max(0.1);
                let total_chars =
                    Self::estimated_viewport_char_count(style_id) + text.chars().count() as f64;
                fade_in_duration + (total_chars / scroll_speed)
            }
            "credits" => {
                let scroll_speed = Self::number_setting(settings, "scrollSpeed", 100.0).max(1.0);
                let font_size_rem = Self::number_setting(settings, "fontSize", 8.0);
                let line_spacing = Self::number_setting(settings, "lineSpacing", 1.5);
                let line_count = text.lines().count().max(1) as f64;
                let font_size_px = font_size_rem * 16.0;
                let line_height_px = font_size_px;
                let spacing_px = font_size_px * line_spacing;
                let total_text_height = if line_count <= 0.0 {
                    0.0
                } else {
                    (line_count * line_height_px) + (spacing_px * (line_count - 1.0))
                };
                let viewport_height = 1080.0;
                let edge_padding = font_size_px.max(24.0);
                let travel_distance = viewport_height + total_text_height + (2.0 * edge_padding);
                (travel_distance / scroll_speed) + 0.3
            }
            _ => {
                let text_length = text.chars().count() as f64;
                text_length / 5.0
            }
        }
    }

    fn estimate_message_duration_seconds(&self, message: &MessageConfig) -> f64 {
        let style_id = self.resolve_message_style_id(message);
        let settings = self.merged_text_style_settings(message, &style_id);

        if self.uses_visualizer_split_sequence(message) {
            let separator = message.split_separator.as_deref().unwrap_or("");
            let raw_parts: Vec<String> = message
                .text
                .split(separator)
                .map(|part| part.trim().to_string())
                .filter(|part| !part.is_empty())
                .collect();
            let normalized_parts = if raw_parts.is_empty() {
                vec![message.text.trim().to_string()]
            } else {
                raw_parts
            };
            let repeat_count = Self::effective_repeat_count(message) as f64;

            normalized_parts
                .iter()
                .map(|part| self.estimate_single_pass_duration_seconds(&style_id, part, &settings))
                .sum::<f64>()
                * repeat_count
        } else {
            let repeat_count = Self::effective_repeat_count(message) as f64;
            self.estimate_single_pass_duration_seconds(&style_id, &message.text, &settings)
                * repeat_count
        }
    }

    pub fn calculate_safety_timeout_duration(
        &self,
        message: &MessageConfig,
    ) -> Option<std::time::Duration> {
        if self.uses_visualizer_split_sequence(message) {
            None
        } else {
            self.calculate_message_duration(message)
        }
    }

    /// Calculate estimated duration for a message based on text length and speed
    fn calculate_message_duration(&self, message: &MessageConfig) -> Option<std::time::Duration> {
        let duration_seconds = self.estimate_message_duration_seconds(message);
        if duration_seconds.is_finite() && duration_seconds > 0.0 {
            Some(std::time::Duration::from_secs_f64(duration_seconds))
        } else {
            None
        }
    }

    /// Get folder path for a message from the message tree
    fn get_message_folder_path(&self, message_id: &str) -> Option<String> {
        if let Ok(tree) = self.message_tree.lock() {
            self.find_message_folder_path(&tree, message_id, None)
        } else {
            None
        }
    }

    /// Recursively search for a message in the tree and return its folder path
    fn find_message_folder_path(
        &self,
        node: &serde_json::Value,
        message_id: &str,
        current_path: Option<String>,
    ) -> Option<String> {
        match node {
            serde_json::Value::Array(arr) => {
                for item in arr {
                    if let Some(path) =
                        self.find_message_folder_path(item, message_id, current_path.clone())
                    {
                        return Some(path);
                    }
                }
            }
            serde_json::Value::Object(obj) => {
                if let Some(node_type) = obj.get("type").and_then(|v| v.as_str()) {
                    match node_type {
                        "folder" => {
                            let folder_name = obj
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown");
                            let new_path = match current_path {
                                Some(path) => format!("{}/{}", path, folder_name),
                                None => folder_name.to_string(),
                            };

                            if let Some(children) = obj.get("children") {
                                if let Some(path) = self.find_message_folder_path(
                                    children,
                                    message_id,
                                    Some(new_path),
                                ) {
                                    return Some(path);
                                }
                            }
                        }
                        "message" => {
                            if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                                if id == message_id {
                                    return current_path;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
        None
    }

    /// Validate command idempotency - returns true if command should be processed
    pub fn should_process_command(&self, command: &PlaybackCommand) -> bool {
        let current_state = self.get_playback_control();

        match command {
            PlaybackCommand::Start { message_id, .. } => {
                // Don't process if the same message is already playing
                if let Some(ref current_message) = current_state.current_message {
                    if current_state.is_playing && current_message.id == *message_id {
                        return false; // Idempotent - already playing this message
                    }
                }
                true
            }
            PlaybackCommand::Stop { .. } => {
                // Process if there's something to stop (playing or paused)
                current_state.is_playing || current_state.current_message.is_some()
            }
            PlaybackCommand::Pause { .. } => {
                // Process if currently playing (can pause)
                current_state.is_playing
            }
            PlaybackCommand::Resume { .. } => {
                // Process if paused (not playing but has message)
                !current_state.is_playing && current_state.current_message.is_some()
            }
        }
    }
}

/// Error types for playback command processing
#[derive(Debug, Clone)]
pub enum PlaybackError {
    MessageNotFound(String),
    InvalidCommand(String),
    StateCorruption(String),
    SyncFailure {
        device_id: String,
        error: String,
        retry_count: u32,
    },
    ConcurrentModification {
        expected_version: u64,
        actual_version: u64,
    },
    NetworkError(String),
    DeviceDisconnected(String),
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod remote_state_tests {
    use super::*;

    #[test]
    fn test_remote_state_uses_compact_contract() {
        let app_state = AppStateSync::new();

        if let Ok(mut message_tree) = app_state.message_tree.lock() {
            *message_tree = serde_json::json!([]);
        }

        if let Ok(mut message_stats) = app_state.message_stats.lock() {
            *message_stats = serde_json::json!({
                "msg-1": {
                    "messageId": "msg-1",
                    "triggerCount": 3,
                    "lastTriggered": 12345,
                    "history": [{ "timestamp": 12000 }]
                }
            });
        }

        let remote_state = app_state.get_remote_state();
        let remote_json = serde_json::to_value(&remote_state).unwrap();

        assert_eq!(remote_state.schema_version, 2);
        assert!(remote_json.get("messages").is_none());
        assert!(remote_json.get("visualizationSettings").is_none());
        assert!(remote_json.get("textStyleSettings").is_none());
        assert!(remote_json["messageTree"].as_array().is_some());
        assert_eq!(remote_json["messageStats"]["msg-1"]["triggerCount"], 3);
        assert!(remote_json["messageStats"]["msg-1"]
            .get("history")
            .is_none());
        assert!(
            remote_json["visualizationPresets"][0]
                .get("settings")
                .is_none(),
            "remote presets should only include summary metadata"
        );
    }

    #[test]
    fn test_revision_counters_advance_by_scope() {
        let app_state = AppStateSync::new();

        let initial_state = app_state.get_state();
        assert_eq!(initial_state.config_revision, 0);
        assert_eq!(initial_state.runtime_revision, 0);

        app_state.mark_config_changed();
        let after_config = app_state.get_state();
        assert_eq!(after_config.config_revision, 1);
        assert_eq!(after_config.runtime_revision, 0);

        app_state.mark_runtime_changed();
        let after_runtime = app_state.get_state();
        assert_eq!(after_runtime.config_revision, 1);
        assert_eq!(after_runtime.runtime_revision, 1);
    }
}

#[cfg(test)]
mod legacy_tests {
    use super::*;
    use quickcheck::TestResult;
    use quickcheck_macros::quickcheck;
    use std::time::SystemTime;

    #[test]
    fn test_process_start_command_success() {
        let app_state = AppStateSync::new();

        let command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };

        let result = app_state.process_playback_command(command);
        assert!(result.is_ok());

        let state = result.unwrap();
        assert!(state.is_playing);
        assert!(state.can_stop);
        assert!(!state.can_start);
        assert_eq!(state.initiated_by, DeviceType::ControlPlane);
        assert!(state.session_id.is_some());
        assert!(state.current_message.is_some());
    }

    #[test]
    fn test_process_start_command_message_not_found() {
        let app_state = AppStateSync::new();

        let command = PlaybackCommand::Start {
            message_id: "nonexistent".to_string(),
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };

        let result = app_state.process_playback_command(command);
        assert!(result.is_err());

        match result.unwrap_err() {
            PlaybackError::MessageNotFound(id) => assert_eq!(id, "nonexistent"),
            _ => panic!("Expected MessageNotFound error"),
        }
    }

    #[test]
    fn test_process_stop_command_success() {
        let app_state = AppStateSync::new();

        // First start a message
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "mobile_remote_1".to_string(),
            timestamp: SystemTime::now(),
        };
        app_state.process_playback_command(start_command).unwrap();

        // Then stop it
        let stop_command = PlaybackCommand::Stop {
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };

        let result = app_state.process_playback_command(stop_command);
        assert!(result.is_ok());

        let state = result.unwrap();
        assert!(!state.is_playing);
        assert!(!state.can_stop);
        assert!(state.can_start);
        assert_eq!(state.initiated_by, DeviceType::ControlPlane);
        assert!(state.session_id.is_none());
        assert!(state.current_message.is_none());
    }

    #[test]
    fn test_process_stop_command_no_active_session() {
        let app_state = AppStateSync::new();

        let command = PlaybackCommand::Stop {
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };

        let result = app_state.process_playback_command(command);
        assert!(result.is_err());

        match result.unwrap_err() {
            PlaybackError::InvalidCommand(msg) => {
                assert!(msg.contains("no active playback session"));
            }
            _ => panic!("Expected InvalidCommand error"),
        }
    }

    #[test]
    fn test_process_pause_and_resume_commands() {
        let app_state = AppStateSync::new();

        // Start a message
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };
        app_state.process_playback_command(start_command).unwrap();

        // Pause it
        let pause_command = PlaybackCommand::Pause {
            device_id: "mobile_remote_1".to_string(),
            timestamp: SystemTime::now(),
        };
        let pause_result = app_state.process_playback_command(pause_command);
        assert!(pause_result.is_ok());

        let paused_state = pause_result.unwrap();
        assert!(!paused_state.is_playing);
        assert!(paused_state.can_stop);
        assert!(paused_state.can_start); // Can resume
        assert!(paused_state.current_message.is_some());
        assert!(paused_state.session_id.is_some());

        // Resume it
        let resume_command = PlaybackCommand::Resume {
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };
        let resume_result = app_state.process_playback_command(resume_command);
        assert!(resume_result.is_ok());

        let resumed_state = resume_result.unwrap();
        assert!(resumed_state.is_playing);
        assert!(resumed_state.can_stop);
        assert!(!resumed_state.can_start);
        assert!(resumed_state.current_message.is_some());
        assert!(resumed_state.session_id.is_some());
    }

    #[test]
    fn test_command_idempotency() {
        let app_state = AppStateSync::new();

        // Start a message
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };

        // First start should be processed
        assert!(app_state.should_process_command(&start_command));
        app_state
            .process_playback_command(start_command.clone())
            .unwrap();

        // Second identical start should not be processed (idempotent)
        assert!(!app_state.should_process_command(&start_command));

        // Stop command should be processed
        let stop_command = PlaybackCommand::Stop {
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };
        assert!(app_state.should_process_command(&stop_command));
        app_state
            .process_playback_command(stop_command.clone())
            .unwrap();

        // Second stop should not be processed (idempotent)
        assert!(!app_state.should_process_command(&stop_command));
    }

    #[test]
    fn test_parse_device_type() {
        let app_state = AppStateSync::new();

        assert_eq!(
            app_state.parse_device_type("control_plane_1").unwrap(),
            DeviceType::ControlPlane
        );
        assert_eq!(
            app_state.parse_device_type("control-plane-1").unwrap(),
            DeviceType::ControlPlane
        );
        assert_eq!(
            app_state.parse_device_type("mobile_remote_1").unwrap(),
            DeviceType::MobileRemote
        );
        assert_eq!(
            app_state.parse_device_type("mobile-remote-1").unwrap(),
            DeviceType::MobileRemote
        );
        assert_eq!(
            app_state.parse_device_type("system").unwrap(),
            DeviceType::System
        );

        // Unknown device IDs default to MobileRemote
        assert_eq!(
            app_state.parse_device_type("unknown_device").unwrap(),
            DeviceType::MobileRemote
        );
    }

    #[test]
    fn test_calculate_message_duration() {
        let app_state = AppStateSync::new();

        let message = MessageConfig {
            id: "test".to_string(),
            text: "Hello World".to_string(), // 11 characters
            text_file: None,
            text_style: "test".to_string(),
            text_style_preset: None,
            style_overrides: None,
            repeat_count: None,
            speed: Some(1.0),
            split_enabled: None,
            split_separator: None,
        };

        let duration = app_state.calculate_message_duration(&message);
        assert!(duration.is_some());

        // Should be approximately 11 chars / 5 chars per second = 2.2 seconds
        let duration = duration.unwrap();
        assert!(duration.as_secs_f64() > 2.0 && duration.as_secs_f64() < 3.0);
    }

    #[test]
    fn test_calculate_message_duration_disables_server_timeout_for_split_sequences() {
        let app_state = AppStateSync::new();

        let split_message = MessageConfig {
            id: "split".to_string(),
            text: "3, 2, 1".to_string(),
            text_file: None,
            text_style: "bounce".to_string(),
            text_style_preset: None,
            style_overrides: None,
            repeat_count: Some(2),
            speed: Some(1.0),
            split_enabled: Some(true),
            split_separator: Some(",".to_string()),
        };

        let duration = app_state.calculate_message_duration(&split_message);
        assert!(duration.is_some());
        assert!(duration.unwrap().as_secs_f64() > 30.0);
        assert_eq!(
            app_state.calculate_safety_timeout_duration(&split_message),
            None
        );

        let credits_message = MessageConfig {
            text_style: "credits".to_string(),
            ..split_message
        };

        assert!(app_state
            .calculate_message_duration(&credits_message)
            .is_some());
        assert!(app_state
            .calculate_safety_timeout_duration(&credits_message)
            .is_some());
    }

    #[test]
    fn test_concurrent_command_validation() {
        let app_state = AppStateSync::new();

        // Start a message
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "control_plane_1".to_string(),
            timestamp: SystemTime::now(),
        };
        app_state.process_playback_command(start_command).unwrap();

        // Try to start another message while one is playing
        let conflicting_start = PlaybackCommand::Start {
            message_id: "msg-2".to_string(),
            device_id: "mobile_remote_1".to_string(),
            timestamp: SystemTime::now(),
        };

        let result = app_state.process_playback_command(conflicting_start);
        assert!(result.is_err());

        match result.unwrap_err() {
            PlaybackError::InvalidCommand(msg) => {
                assert!(msg.contains("another message is already playing"));
            }
            _ => panic!("Expected InvalidCommand error"),
        }
    }

    // Property-based tests

    /// **Feature: message-control-sync, Property 9: Command Validation**
    /// **Validates: Requirements 3.1**
    ///
    /// Property: For any start command with a message ID, the system should validate
    /// the message exists before updating playback state, rejecting invalid messages
    /// without state changes.
    #[quickcheck(tests = 15)]
    fn prop_command_validation_message_existence(
        message_id: String,
        device_id: String,
    ) -> TestResult {
        // Skip empty strings and very long strings to keep tests reasonable
        if message_id.is_empty()
            || message_id.len() > 100
            || device_id.is_empty()
            || device_id.len() > 100
        {
            return TestResult::discard();
        }

        // Skip message IDs that contain control characters or invalid UTF-8 sequences
        if message_id.chars().any(|c| c.is_control()) || device_id.chars().any(|c| c.is_control()) {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();

        // Get the initial state before any command processing
        let initial_state = app_state.get_playback_control();

        // Create a start command with the generated message_id
        let start_command = PlaybackCommand::Start {
            message_id: message_id.clone(),
            device_id: device_id.clone(),
            timestamp: SystemTime::now(),
        };

        // Process the command
        let result = app_state.process_playback_command(start_command);

        // Get the state after command processing
        let final_state = app_state.get_playback_control();

        // Check if the message exists in the default messages
        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        let message_exists = default_message_ids.contains(&message_id.as_str());

        if message_exists {
            // If message exists, command should succeed and state should be updated
            match result {
                Ok(new_state) => {
                    // Verify the state was updated correctly
                    TestResult::from_bool(
                        new_state.is_playing
                            && new_state.can_stop
                            && !new_state.can_start
                            && new_state.session_id.is_some()
                            && new_state.current_message.is_some()
                            && new_state.current_message.as_ref().unwrap().id == message_id
                            && final_state.is_playing
                            && final_state.current_message.is_some(),
                    )
                }
                Err(_) => {
                    // Should not fail for valid messages
                    TestResult::from_bool(false)
                }
            }
        } else {
            // If message doesn't exist, command should fail and state should remain unchanged
            match result {
                Ok(_) => {
                    // Should not succeed for invalid messages
                    TestResult::from_bool(false)
                }
                Err(PlaybackError::MessageNotFound(not_found_id)) => {
                    // Verify the error contains the correct message ID and state is unchanged
                    TestResult::from_bool(
                        not_found_id == message_id
                            && final_state.is_playing == initial_state.is_playing
                            && final_state.can_stop == initial_state.can_stop
                            && final_state.can_start == initial_state.can_start
                            && final_state.session_id == initial_state.session_id
                            && final_state.current_message == initial_state.current_message,
                    )
                }
                Err(_) => {
                    // Wrong error type, but state should still be unchanged
                    TestResult::from_bool(
                        final_state.is_playing == initial_state.is_playing
                            && final_state.can_stop == initial_state.can_stop
                            && final_state.can_start == initial_state.can_start
                            && final_state.session_id == initial_state.session_id
                            && final_state.current_message == initial_state.current_message,
                    )
                }
            }
        }
    }

    /// **Feature: message-control-sync, Property 9: Command Validation**
    /// **Validates: Requirements 3.1**
    ///
    /// Property: Command validation should be consistent regardless of device type
    /// and should preserve state integrity when validation fails.
    #[quickcheck(tests = 10)]
    fn prop_command_validation_device_independence(message_id: String) -> TestResult {
        // Skip empty strings and very long strings
        if message_id.is_empty() || message_id.len() > 100 {
            return TestResult::discard();
        }

        // Skip message IDs that contain control characters
        if message_id.chars().any(|c| c.is_control()) {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();

        // Test with different device types
        let device_types = vec![
            "control_plane_1",
            "mobile_remote_1",
            "system_1",
            "unknown_device_123",
        ];

        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        let message_exists = default_message_ids.contains(&message_id.as_str());

        // Test that validation behavior is consistent across all device types
        for device_id in device_types {
            let initial_state = app_state.get_playback_control();

            let start_command = PlaybackCommand::Start {
                message_id: message_id.clone(),
                device_id: device_id.to_string(),
                timestamp: SystemTime::now(),
            };

            let result = app_state.process_playback_command(start_command);
            let final_state = app_state.get_playback_control();

            // Reset state for next iteration if command succeeded
            if result.is_ok() {
                let stop_command = PlaybackCommand::Stop {
                    device_id: device_id.to_string(),
                    timestamp: SystemTime::now(),
                };
                let _ = app_state.process_playback_command(stop_command);
            }

            // Verify consistent behavior regardless of device type
            if message_exists {
                if result.is_err() {
                    return TestResult::from_bool(false);
                }
            } else {
                match result {
                    Ok(_) => return TestResult::from_bool(false),
                    Err(PlaybackError::MessageNotFound(not_found_id)) => {
                        if not_found_id != message_id {
                            return TestResult::from_bool(false);
                        }
                    }
                    Err(_) => {
                        // Other errors are acceptable as long as state is preserved
                        if final_state.is_playing != initial_state.is_playing
                            || final_state.current_message != initial_state.current_message
                        {
                            return TestResult::from_bool(false);
                        }
                    }
                }
            }
        }

        TestResult::from_bool(true)
    }

    /// **Feature: message-control-sync, Property 12: Command Idempotency**
    /// **Validates: Requirements 3.5**
    ///
    /// Property: For any control command sent multiple times in rapid succession,
    /// the system should handle it idempotently without state corruption.
    #[quickcheck(tests = 10)]
    fn prop_command_idempotency_rapid_succession(
        command_type: u8,
        message_id: String,
        device_id: String,
        repeat_count: u8,
    ) -> TestResult {
        // Limit inputs to reasonable ranges
        if message_id.trim().is_empty()
            || message_id.len() > 100
            || device_id.trim().is_empty()
            || device_id.len() > 100
            || repeat_count == 0
            || repeat_count > 20
        {
            return TestResult::discard();
        }

        // Skip message IDs and device IDs with control characters or only whitespace
        if message_id.chars().any(|c| c.is_control())
            || device_id.chars().any(|c| c.is_control())
            || message_id.trim().is_empty()
            || device_id.trim().is_empty()
        {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();
        let timestamp = SystemTime::now();

        // Map command_type to actual command variants
        let base_command = match command_type % 4 {
            0 => PlaybackCommand::Start {
                message_id: message_id.clone(),
                device_id: device_id.clone(),
                timestamp,
            },
            1 => PlaybackCommand::Stop {
                device_id: device_id.clone(),
                timestamp,
            },
            2 => PlaybackCommand::Pause {
                device_id: device_id.clone(),
                timestamp,
            },
            3 => PlaybackCommand::Resume {
                device_id: device_id.clone(),
                timestamp,
            },
            _ => unreachable!(),
        };

        // Check if this is a Start command with invalid message ID
        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        let is_invalid_start = matches!(&base_command, PlaybackCommand::Start { message_id, .. }
            if !default_message_ids.contains(&message_id.as_str()));

        if is_invalid_start {
            // For start commands with invalid message IDs, we expect them to fail consistently
            let initial_state = app_state.get_playback_control();
            for _ in 0..repeat_count {
                let result = app_state.process_playback_command(base_command.clone());
                if result.is_ok() {
                    return TestResult::from_bool(false); // Should consistently fail
                }
                // Verify state remains unchanged
                let current_state = app_state.get_playback_control();
                if !states_equivalent(&initial_state, &current_state) {
                    return TestResult::from_bool(false);
                }
            }
            return TestResult::passed(); // All failed as expected
        }

        // For Stop, Pause, and Resume commands, we need to set up appropriate initial state
        match &base_command {
            PlaybackCommand::Stop { .. } | PlaybackCommand::Pause { .. } => {
                // Start a message first so we have something to stop/pause
                let setup_command = PlaybackCommand::Start {
                    message_id: "msg-1".to_string(), // Use known valid message
                    device_id: device_id.clone(),
                    timestamp,
                };
                if app_state.process_playback_command(setup_command).is_err() {
                    return TestResult::discard(); // Skip if setup fails
                }
            }
            PlaybackCommand::Resume { .. } => {
                // Start and then pause a message so we have something to resume
                let start_command = PlaybackCommand::Start {
                    message_id: "msg-1".to_string(),
                    device_id: device_id.clone(),
                    timestamp,
                };
                if app_state.process_playback_command(start_command).is_err() {
                    return TestResult::discard();
                }
                let pause_command = PlaybackCommand::Pause {
                    device_id: device_id.clone(),
                    timestamp,
                };
                if app_state.process_playback_command(pause_command).is_err() {
                    return TestResult::discard();
                }
            }
            PlaybackCommand::Start { .. } => {
                // Valid start command - no setup needed
            }
        }

        // Get initial state before processing commands
        let initial_state = app_state.get_playback_control();

        // Process the same command multiple times in rapid succession
        let mut results = Vec::new();
        let mut final_states = Vec::new();

        for _ in 0..repeat_count {
            let result = app_state.process_playback_command(base_command.clone());
            results.push(result);
            final_states.push(app_state.get_playback_control());
        }

        // Validate idempotency properties

        // Property 1: First command should succeed if valid, subsequent identical commands should be idempotent
        let first_result = &results[0];

        // Reset state to initial for should_process_command check
        match &base_command {
            PlaybackCommand::Start { .. } => {
                // Reset to initial state for proper should_process_command evaluation
                app_state.stop_message_playback(DeviceType::System);
            }
            _ => {}
        }

        match first_result {
            Ok(first_state) => {
                // If first command succeeded, verify state consistency

                // Property 2: All subsequent results should either succeed with same state or be rejected idempotently
                for (i, result) in results.iter().enumerate().skip(1) {
                    match result {
                        Ok(state) => {
                            // If subsequent command succeeded, state should be equivalent to first result
                            if !states_equivalent(first_state, state) {
                                return TestResult::from_bool(false);
                            }
                        }
                        Err(_) => {
                            // If subsequent command was rejected, that's acceptable for idempotency
                            // as long as the system state wasn't corrupted
                            let current_state = &final_states[i];
                            if !state_is_valid(current_state) {
                                return TestResult::from_bool(false);
                            }
                        }
                    }
                }

                // Property 3: Final state should be consistent with first successful command
                let final_state = &final_states[final_states.len() - 1];
                if !state_is_valid(final_state) {
                    return TestResult::from_bool(false);
                }
            }
            Err(_) => {
                // If first command failed, all subsequent commands should also fail
                for result in results.iter().skip(1) {
                    if result.is_ok() {
                        return TestResult::from_bool(false);
                    }
                }

                // Property 4: State should remain unchanged if all commands fail
                let final_state = &final_states[final_states.len() - 1];
                if !states_equivalent(&initial_state, final_state) {
                    return TestResult::from_bool(false);
                }
            }
        }

        TestResult::passed()
    }

    /// **Feature: message-control-sync, Property 12: Command Idempotency**
    /// **Validates: Requirements 3.5**
    ///
    /// Property: Idempotency should be maintained across different device types
    /// sending the same command simultaneously.
    #[quickcheck(tests = 8)]
    fn prop_command_idempotency_cross_device(message_id: String, device_count: u8) -> TestResult {
        // Limit inputs to reasonable ranges
        if message_id.trim().is_empty()
            || message_id.len() > 100
            || device_count == 0
            || device_count > 10
        {
            return TestResult::discard();
        }

        // Skip message IDs with control characters or only whitespace
        if message_id.chars().any(|c| c.is_control()) || message_id.trim().is_empty() {
            return TestResult::discard();
        }

        // Only test with valid message IDs for this property
        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        if !default_message_ids.contains(&message_id.as_str()) {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();
        let timestamp = SystemTime::now();

        // Generate different device IDs
        let device_types = ["control_plane", "mobile_remote", "system"];
        let mut device_ids = Vec::new();
        for i in 0..device_count {
            let device_type = device_types[(i as usize) % device_types.len()];
            device_ids.push(format!("{}_{}", device_type, i));
        }

        // Test Start command idempotency across devices
        let mut results = Vec::new();
        let mut states = Vec::new();

        for device_id in &device_ids {
            let command = PlaybackCommand::Start {
                message_id: message_id.clone(),
                device_id: device_id.clone(),
                timestamp,
            };

            let result = app_state.process_playback_command(command);
            results.push(result);
            states.push(app_state.get_playback_control());
        }

        // Validate idempotency across devices

        // Property 1: First command should succeed
        if results[0].is_err() {
            return TestResult::from_bool(false);
        }

        let first_successful_state = results[0].as_ref().unwrap();

        // Property 2: Subsequent commands should be handled idempotently
        for (i, result) in results.iter().enumerate().skip(1) {
            match result {
                Ok(state) => {
                    // If command succeeded, state should be equivalent to first
                    if !states_equivalent(first_successful_state, state) {
                        return TestResult::from_bool(false);
                    }
                }
                Err(_) => {
                    // If command was rejected (idempotent), that's acceptable
                    // Verify system state wasn't corrupted
                    if !state_is_valid(&states[i]) {
                        return TestResult::from_bool(false);
                    }
                }
            }
        }

        // Property 3: Final system state should be consistent
        let final_state = &states[states.len() - 1];
        if !state_is_valid(final_state) || !final_state.is_playing {
            return TestResult::from_bool(false);
        }

        // Test Stop command idempotency across devices
        let mut stop_results = Vec::new();
        let mut stop_states = Vec::new();

        for device_id in &device_ids {
            let stop_command = PlaybackCommand::Stop {
                device_id: device_id.clone(),
                timestamp,
            };

            let result = app_state.process_playback_command(stop_command);
            stop_results.push(result);
            stop_states.push(app_state.get_playback_control());
        }

        // Validate stop command idempotency

        // Property 4: First stop should succeed
        if stop_results[0].is_err() {
            return TestResult::from_bool(false);
        }

        let first_stop_state = stop_results[0].as_ref().unwrap();

        // Property 5: Subsequent stops should be idempotent
        for (i, result) in stop_results.iter().enumerate().skip(1) {
            match result {
                Ok(state) => {
                    if !states_equivalent(first_stop_state, state) {
                        return TestResult::from_bool(false);
                    }
                }
                Err(_) => {
                    // Idempotent rejection is acceptable
                    if !state_is_valid(&stop_states[i]) {
                        return TestResult::from_bool(false);
                    }
                }
            }
        }

        // Property 6: Final state should be stopped
        let final_stop_state = &stop_states[stop_states.len() - 1];
        if !state_is_valid(final_stop_state) || final_stop_state.is_playing {
            return TestResult::from_bool(false);
        }

        TestResult::passed()
    }

    /// **Feature: message-control-sync, Property 12: Command Idempotency**
    /// **Validates: Requirements 3.5**
    ///
    /// Property: Command idempotency should preserve state consistency even
    /// when commands are interleaved with state queries.
    #[quickcheck(tests = 8)]
    fn prop_command_idempotency_with_state_queries(
        message_id: String,
        query_count: u8,
    ) -> TestResult {
        // Limit inputs to reasonable ranges
        if message_id.trim().is_empty() || message_id.len() > 100 || query_count > 20 {
            return TestResult::discard();
        }

        // Skip message IDs with control characters or only whitespace
        if message_id.chars().any(|c| c.is_control()) || message_id.trim().is_empty() {
            return TestResult::discard();
        }

        // Only test with valid message IDs
        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        if !default_message_ids.contains(&message_id.as_str()) {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();
        let timestamp = SystemTime::now();
        let device_id = "test_device".to_string();

        let start_command = PlaybackCommand::Start {
            message_id: message_id.clone(),
            device_id: device_id.clone(),
            timestamp,
        };

        // Execute command and interleave with state queries
        let first_result = app_state.process_playback_command(start_command.clone());
        if first_result.is_err() {
            return TestResult::discard();
        }

        let first_state = first_result.unwrap();
        let mut all_states = vec![first_state.clone()];

        // Interleave duplicate commands with state queries
        for _ in 0..query_count {
            // Query state multiple times
            let queried_state1 = app_state.get_playback_control();
            let queried_state2 = app_state.get_playback_control();

            // States from queries should be identical
            if !states_equivalent(&queried_state1, &queried_state2) {
                return TestResult::from_bool(false);
            }

            // Execute duplicate command
            let duplicate_result = app_state.process_playback_command(start_command.clone());

            // Query state again
            let post_command_state = app_state.get_playback_control();
            all_states.push(post_command_state);

            // Duplicate command should either succeed with same state or be rejected idempotently
            match duplicate_result {
                Ok(result_state) => {
                    if !states_equivalent(&first_state, &result_state) {
                        return TestResult::from_bool(false);
                    }
                }
                Err(_) => {
                    // Idempotent rejection is acceptable, but state should be preserved
                    let current_state = app_state.get_playback_control();
                    if !state_is_valid(&current_state) {
                        return TestResult::from_bool(false);
                    }
                }
            }
        }

        // Property: All states throughout the process should be equivalent to the first successful state
        for state in &all_states {
            if !states_equivalent(&first_state, state) {
                return TestResult::from_bool(false);
            }
        }

        TestResult::passed()
    }

    // Helper functions for property tests

    /// Check if two PlaybackControlState instances are equivalent for idempotency purposes
    fn states_equivalent(state1: &PlaybackControlState, state2: &PlaybackControlState) -> bool {
        state1.session_id == state2.session_id
            && state1.current_message == state2.current_message
            && state1.is_playing == state2.is_playing
            && state1.can_stop == state2.can_stop
            && state1.can_start == state2.can_start
        // Note: We don't compare playback_position, initiated_by, or last_updated
        // as these may legitimately differ between equivalent states
    }

    /// Validate that a PlaybackControlState is internally consistent and valid
    fn state_is_valid(state: &PlaybackControlState) -> bool {
        // Rule 1: If playing, must have current message and session
        if state.is_playing && (state.current_message.is_none() || state.session_id.is_none()) {
            return false;
        }

        // Rule 2: If not playing and no message, should not have session
        if !state.is_playing && state.current_message.is_none() && state.session_id.is_some() {
            return false;
        }

        // Rule 3: Control capabilities should be consistent with state
        match (state.is_playing, state.current_message.is_some()) {
            (true, true) => state.can_stop && !state.can_start, // Playing: can stop, cannot start
            (false, true) => state.can_stop && state.can_start, // Paused: can stop OR resume (start)
            (false, false) => !state.can_stop && state.can_start, // Idle: cannot stop, can start
            (true, false) => false,                             // Invalid: playing without message
        }
    }

    /// **Feature: message-control-sync, Property 9: Command Validation**
    /// **Validates: Requirements 3.1**
    ///
    /// Property: State should never be corrupted by invalid commands, even when
    /// multiple invalid commands are processed in sequence.
    #[quickcheck(tests = 10)]
    fn prop_command_validation_state_integrity(invalid_message_ids: Vec<String>) -> TestResult {
        // Limit the number of commands to test to keep execution time reasonable
        if invalid_message_ids.len() > 10 {
            return TestResult::discard();
        }

        // Filter out valid message IDs and empty strings
        let default_message_ids = vec!["msg-1", "msg-2", "msg-3"];
        let truly_invalid_ids: Vec<String> = invalid_message_ids
            .into_iter()
            .filter(|id| {
                !id.is_empty()
                    && id.len() <= 100
                    && !id.chars().any(|c| c.is_control())
                    && !default_message_ids.contains(&id.as_str())
            })
            .collect();

        if truly_invalid_ids.is_empty() {
            return TestResult::discard();
        }

        let app_state = AppStateSync::new();
        let initial_state = app_state.get_playback_control();

        // Process multiple invalid commands in sequence
        for (i, message_id) in truly_invalid_ids.iter().enumerate() {
            let device_id = format!("device_{}", i);

            let start_command = PlaybackCommand::Start {
                message_id: message_id.clone(),
                device_id,
                timestamp: SystemTime::now(),
            };

            let result = app_state.process_playback_command(start_command);

            // All commands should fail
            if result.is_ok() {
                return TestResult::from_bool(false);
            }

            // Verify state remains unchanged after each failed command
            let current_state = app_state.get_playback_control();
            if current_state.is_playing != initial_state.is_playing
                || current_state.can_stop != initial_state.can_stop
                || current_state.can_start != initial_state.can_start
                || current_state.session_id != initial_state.session_id
                || current_state.current_message != initial_state.current_message
            {
                return TestResult::from_bool(false);
            }
        }

        // Final verification that state is completely unchanged
        let final_state = app_state.get_playback_control();
        TestResult::from_bool(
            final_state.is_playing == initial_state.is_playing
                && final_state.can_stop == initial_state.can_stop
                && final_state.can_start == initial_state.can_start
                && final_state.session_id == initial_state.session_id
                && final_state.current_message == initial_state.current_message
                && final_state.playback_position == initial_state.playback_position,
        )
    }

    #[test]
    fn test_enhanced_tauri_event_data_structure() {
        let app_state = AppStateSync::new();

        // Start a message to create a playback state
        let result = app_state.start_message_playback("msg-1", DeviceType::MobileRemote);
        assert!(result.is_ok());

        // Get the complete state that would be sent in Tauri events
        let complete_state = app_state.get_state();

        // Verify that the complete state includes playback control information
        assert!(complete_state.playback_control.is_playing);
        assert!(complete_state.playback_control.can_stop);
        assert!(!complete_state.playback_control.can_start);
        assert_eq!(
            complete_state.playback_control.initiated_by,
            DeviceType::MobileRemote
        );
        assert!(complete_state.playback_control.current_message.is_some());
        assert!(complete_state.playback_control.session_id.is_some());

        // Verify that the message information is included
        let message_info = complete_state
            .playback_control
            .current_message
            .as_ref()
            .unwrap();
        assert_eq!(message_info.id, "msg-1");
        assert_eq!(message_info.title, "Countdown initiated...");

        // Test the JSON serialization that would be sent in Tauri events
        let event_payload = serde_json::json!({
            "type": "MESSAGE_STARTED_FROM_REMOTE",
            "playbackControl": complete_state.playback_control,
            "state": complete_state
        });

        // Verify the event payload structure
        assert_eq!(event_payload["type"], "MESSAGE_STARTED_FROM_REMOTE");
        assert!(event_payload["playbackControl"]["isPlaying"]
            .as_bool()
            .unwrap());
        assert!(event_payload["playbackControl"]["canStop"]
            .as_bool()
            .unwrap());
        assert!(!event_payload["playbackControl"]["canStart"]
            .as_bool()
            .unwrap());
        assert_eq!(
            event_payload["playbackControl"]["initiatedBy"],
            "mobile_remote"
        );

        // Verify that the complete state is included for full synchronization
        assert!(event_payload["state"]["playbackControl"]["isPlaying"]
            .as_bool()
            .unwrap());
        assert!(event_payload["state"]["messages"].is_array());
        assert!(event_payload["state"]["activeVisualization"].is_string());
    }

    #[test]
    fn test_stop_command_enhanced_tauri_event() {
        let app_state = AppStateSync::new();

        // Start a message first
        app_state
            .start_message_playback("msg-1", DeviceType::ControlPlane)
            .unwrap();

        // Stop the message
        app_state.stop_message_playback(DeviceType::MobileRemote);

        // Get the complete state that would be sent in Tauri events
        let complete_state = app_state.get_state();

        // Verify the stopped state
        assert!(!complete_state.playback_control.is_playing);
        assert!(!complete_state.playback_control.can_stop);
        assert!(complete_state.playback_control.can_start);
        assert_eq!(
            complete_state.playback_control.initiated_by,
            DeviceType::MobileRemote
        );
        assert!(complete_state.playback_control.current_message.is_none());
        assert!(complete_state.playback_control.session_id.is_none());

        // Test the JSON serialization for stop event
        let event_payload = serde_json::json!({
            "type": "MESSAGE_STOPPED_FROM_REMOTE",
            "playbackControl": complete_state.playback_control,
            "state": complete_state
        });

        // Verify the stop event payload structure
        assert_eq!(event_payload["type"], "MESSAGE_STOPPED_FROM_REMOTE");
        assert!(!event_payload["playbackControl"]["isPlaying"]
            .as_bool()
            .unwrap());
        assert!(!event_payload["playbackControl"]["canStop"]
            .as_bool()
            .unwrap());
        assert!(event_payload["playbackControl"]["canStart"]
            .as_bool()
            .unwrap());
        assert_eq!(
            event_payload["playbackControl"]["initiatedBy"],
            "mobile_remote"
        );
        assert!(event_payload["playbackControl"]["currentMessage"].is_null());
        assert!(event_payload["playbackControl"]["sessionId"].is_null());
    }
}
