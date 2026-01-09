use serde::{Deserialize, Serialize};

/// Message configuration matching the frontend MessageConfig type
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageConfig {
    pub id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_file: Option<String>,
    pub text_style: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_style_preset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_overrides: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_separator: Option<String>,
}

/// Visualization preset matching the frontend VisualizationPreset type
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VisualizationPreset {
    pub id: String,
    pub name: String,
    pub visualization_id: String,
    pub settings: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Text style preset matching the frontend TextStylePreset type
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TextStylePreset {
    pub id: String,
    pub name: String,
    pub text_style_id: String,
    pub settings: serde_json::Value,
}

/// Message statistics matching the frontend MessageStats type
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageStats {
    pub message_id: String,
    pub trigger_count: u32,
    pub last_triggered: u64,
    pub history: Vec<TriggerHistory>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TriggerHistory {
    pub timestamp: u64,
}

/// Common visualization settings
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CommonSettings {
    pub intensity: f64,
    pub dim: f64,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            intensity: 1.0,
            dim: 1.0,
        }
    }
}

/// Folder playback queue state
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderPlaybackQueue {
    pub folder_id: String,
    pub message_ids: Vec<String>,
    pub current_index: usize,
}

/// E2E Test Report from Frontend
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct E2EReport {
    pub timestamp: u64,
    pub active_visualization: String,
    pub active_messages: Vec<String>,
    pub fps: Option<f64>,
    pub message_count: usize,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RemoteCommand {
    pub command: String,
    pub payload: Option<serde_json::Value>,
}

/// Application state that gets broadcast via SSE
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastState {
    pub active_visualization: String,
    pub enabled_visualizations: Vec<String>,
    pub common_settings: CommonSettings,
    pub visualization_settings: serde_json::Value,
    pub visualization_presets: Vec<VisualizationPreset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_visualization_preset: Option<String>,
    pub messages: Vec<MessageConfig>,
    /// Optional message tree (folders). When present, UI should use this as canonical ordering.
    pub message_tree: serde_json::Value,
    pub default_text_style: String,
    pub text_style_settings: serde_json::Value,
    pub text_style_presets: Vec<TextStylePreset>,
    pub message_stats: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub triggered_message: Option<MessageConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_playback_queue: Option<FolderPlaybackQueue>,
    // Legacy compatibility
    pub mode: String,
}

pub fn flatten_message_tree_value(tree: &serde_json::Value) -> Vec<MessageConfig> {
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
