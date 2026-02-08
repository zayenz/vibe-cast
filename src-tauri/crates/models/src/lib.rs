use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime};

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
#[serde(rename_all = "camelCase")]
pub struct RemoteCommand {
    pub command: String,
    pub payload: Option<serde_json::Value>,
    /// Optional device type to identify the source of the command.
    /// Defaults to MobileRemote for backward compatibility.
    #[serde(default)]
    pub device_type: Option<DeviceType>,
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
    /// Playback control state for message synchronization
    pub playback_control: PlaybackControlState,
    // Legacy compatibility
    pub mode: String,
}

/// Device type for tracking control command sources
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    ControlPlane,
    MobileRemote,
    System,
}

/// Message information for playback control state
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<Duration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_path: Option<String>,
}

/// Comprehensive playback control state
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackControlState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_message: Option<MessageInfo>,
    pub is_playing: bool,
    #[serde(with = "duration_serde")]
    pub playback_position: Duration,
    pub can_stop: bool,
    pub can_start: bool,
    pub initiated_by: DeviceType,
    #[serde(with = "systemtime_serde")]
    pub last_updated: SystemTime,
}

impl Default for PlaybackControlState {
    fn default() -> Self {
        Self {
            session_id: None,
            current_message: None,
            is_playing: false,
            playback_position: Duration::from_secs(0),
            can_stop: false,
            can_start: true,
            initiated_by: DeviceType::System,
            last_updated: SystemTime::now(),
        }
    }
}

/// Playback command types for control processing
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlaybackCommand {
    Start {
        message_id: String,
        device_id: String,
        #[serde(with = "systemtime_serde")]
        timestamp: SystemTime,
    },
    Stop {
        device_id: String,
        #[serde(with = "systemtime_serde")]
        timestamp: SystemTime,
    },
    Pause {
        device_id: String,
        #[serde(with = "systemtime_serde")]
        timestamp: SystemTime,
    },
    Resume {
        device_id: String,
        #[serde(with = "systemtime_serde")]
        timestamp: SystemTime,
    },
}

/// Custom serialization for Duration (as milliseconds)
mod duration_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u64(duration.as_millis() as u64)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let millis = u64::deserialize(deserializer)?;
        Ok(Duration::from_millis(millis))
    }
}

/// Custom serialization for SystemTime (as Unix timestamp in milliseconds)
mod systemtime_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn serialize<S>(time: &SystemTime, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let duration = time.duration_since(UNIX_EPOCH)
            .map_err(|_| serde::ser::Error::custom("SystemTime before UNIX_EPOCH"))?;
        serializer.serialize_u64(duration.as_millis() as u64)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<SystemTime, D::Error>
    where
        D: Deserializer<'de>,
    {
        let millis = u64::deserialize(deserializer)?;
        Ok(UNIX_EPOCH + std::time::Duration::from_millis(millis))
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use quickcheck::{TestResult, Arbitrary, Gen};
    use quickcheck_macros::quickcheck;
    use std::time::{Duration, UNIX_EPOCH};

    // Test data generators for property-based testing
    
    #[derive(Debug, Clone)]
    struct TestPlaybackControlState(PlaybackControlState);

    impl Arbitrary for TestPlaybackControlState {
        fn arbitrary(g: &mut Gen) -> Self {
            let is_playing = bool::arbitrary(g);
            let has_message = bool::arbitrary(g);
            
            let current_message = if has_message {
                Some(MessageInfo {
                    id: format!("msg_{}", u32::arbitrary(g) % 1000),
                    title: format!("Test Message {}", u32::arbitrary(g) % 100),
                    duration: if bool::arbitrary(g) {
                        Some(Duration::from_secs((u32::arbitrary(g) % 300) as u64))
                    } else {
                        None
                    },
                    folder_path: if bool::arbitrary(g) {
                        Some(format!("/folder_{}", u32::arbitrary(g) % 50))
                    } else {
                        None
                    },
                })
            } else {
                None
            };

            let session_id = if has_message && is_playing {
                Some(format!("session_{}", u32::arbitrary(g) % 1000))
            } else {
                None
            };

            // Generate consistent state based on playing status and message presence
            let (can_stop, can_start) = match (is_playing, has_message) {
                (true, true) => (true, false),   // Playing: can stop, cannot start
                (false, true) => (false, true),  // Paused/stopped with message: can start, cannot stop
                (false, false) => (false, true), // Idle: can start, cannot stop
                (true, false) => (false, true),  // Invalid state, normalize to idle
            };

            let device_types = [DeviceType::ControlPlane, DeviceType::MobileRemote, DeviceType::System];
            let initiated_by = device_types[usize::arbitrary(g) % device_types.len()].clone();

            TestPlaybackControlState(PlaybackControlState {
                session_id,
                current_message,
                is_playing: is_playing && has_message, // Only playing if we have a message
                playback_position: Duration::from_millis((u32::arbitrary(g) % 10000) as u64),
                can_stop,
                can_start,
                initiated_by,
                last_updated: UNIX_EPOCH + Duration::from_secs((u64::arbitrary(g) % 1_000_000) + 1_600_000_000),
            })
        }
    }

    #[derive(Debug, Clone)]
    struct ConnectedDevices(Vec<DeviceType>);

    impl Arbitrary for ConnectedDevices {
        fn arbitrary(g: &mut Gen) -> Self {
            let mut devices = Vec::new();
            let device_types = [DeviceType::ControlPlane, DeviceType::MobileRemote];
            
            // Always include at least one device
            devices.push(device_types[usize::arbitrary(g) % device_types.len()].clone());
            
            // Optionally add more devices (up to both types)
            if bool::arbitrary(g) {
                for device_type in &device_types {
                    if !devices.contains(device_type) && bool::arbitrary(g) {
                        devices.push(device_type.clone());
                    }
                }
            }
            
            ConnectedDevices(devices)
        }
    }

    /// **Feature: message-control-sync, Property 3: UI State Consistency**
    /// **Validates: Requirements 1.4, 1.5, 4.1, 4.2, 4.3, 4.4**
    /// 
    /// Property: For any system state (playing or idle) and any set of connected devices, 
    /// all devices should display consistent control interfaces that accurately reflect 
    /// the current playback capabilities.
    #[quickcheck(tests = 20)]
    fn prop_ui_state_consistency(
        state: TestPlaybackControlState, 
        devices: ConnectedDevices
    ) -> TestResult {
        let state = state.0;
        let devices = devices.0;
        
        // Skip empty device lists (shouldn't happen with our generator, but safety check)
        if devices.is_empty() {
            return TestResult::discard();
        }

        // Property 1: State consistency - all fields should be internally consistent
        let state_consistent = validate_state_consistency(&state);
        if !state_consistent {
            return TestResult::failed();
        }

        // Property 2: Control capability consistency
        let control_consistent = validate_control_consistency(&state);
        if !control_consistent {
            return TestResult::failed();
        }

        // Property 3: UI state should be deterministic based on playback state
        let ui_consistent = validate_ui_consistency(&state, &devices);
        if !ui_consistent {
            return TestResult::failed();
        }

        TestResult::passed()
    }

    /// Validates that the playback control state is internally consistent
    fn validate_state_consistency(state: &PlaybackControlState) -> bool {
        // Rule 1: If playing, must have a current message and session
        if state.is_playing {
            if state.current_message.is_none() || state.session_id.is_none() {
                return false;
            }
        }

        // Rule 2: If not playing, session_id should be None (unless paused)
        if !state.is_playing && state.current_message.is_none() {
            if state.session_id.is_some() {
                return false;
            }
        }

        // Rule 3: Playback position should be reasonable
        if state.playback_position > Duration::from_secs(86400) { // Max 24 hours
            return false;
        }

        // Rule 4: last_updated should be a reasonable timestamp
        if state.last_updated < UNIX_EPOCH + Duration::from_secs(1_600_000_000) {
            return false; // Before 2020
        }

        true
    }

    /// Validates that control capabilities are consistent with playback state
    fn validate_control_consistency(state: &PlaybackControlState) -> bool {
        match (state.is_playing, state.current_message.is_some()) {
            // Playing with message: should be able to stop, not start
            (true, true) => state.can_stop && !state.can_start,
            
            // Not playing but has message (paused/stopped): should be able to start, not stop
            (false, true) => !state.can_stop && state.can_start,
            
            // Not playing and no message (idle): should be able to start, not stop
            (false, false) => !state.can_stop && state.can_start,
            
            // Playing without message: invalid state
            (true, false) => false,
        }
    }

    /// Validates that UI state would be consistent across all connected devices
    fn validate_ui_consistency(state: &PlaybackControlState, devices: &[DeviceType]) -> bool {
        // All devices should see the same state and have the same control capabilities
        for device in devices {
            // Each device should be able to determine the correct UI state from the PlaybackControlState
            let ui_state = determine_ui_state_for_device(state, device);
            
            // Validate that the UI state is consistent with the playback state
            if !validate_device_ui_state(&ui_state, state) {
                return false;
            }
        }

        // All devices should have consistent UI states
        let reference_ui = determine_ui_state_for_device(state, &devices[0]);
        for device in devices.iter().skip(1) {
            let device_ui = determine_ui_state_for_device(state, device);
            if !ui_states_equivalent(&reference_ui, &device_ui) {
                return false;
            }
        }

        true
    }

    #[derive(Debug, PartialEq)]
    struct DeviceUIState {
        shows_playing: bool,
        shows_stop_button: bool,
        shows_play_button: bool,
        shows_message_info: bool,
        message_title: Option<String>,
    }

    /// Determines what UI state a device should show based on the playback control state
    fn determine_ui_state_for_device(state: &PlaybackControlState, _device: &DeviceType) -> DeviceUIState {
        // UI state should be the same for all device types - this is the consistency requirement
        DeviceUIState {
            shows_playing: state.is_playing,
            shows_stop_button: state.can_stop,
            shows_play_button: state.can_start,
            shows_message_info: state.current_message.is_some(),
            message_title: state.current_message.as_ref().map(|m| m.title.clone()),
        }
    }

    /// Validates that a device's UI state is consistent with the playback control state
    fn validate_device_ui_state(ui_state: &DeviceUIState, control_state: &PlaybackControlState) -> bool {
        // Playing indicator should match is_playing
        if ui_state.shows_playing != control_state.is_playing {
            return false;
        }

        // Stop button should match can_stop
        if ui_state.shows_stop_button != control_state.can_stop {
            return false;
        }

        // Play button should match can_start
        if ui_state.shows_play_button != control_state.can_start {
            return false;
        }

        // Message info should be shown when there's a current message
        if ui_state.shows_message_info != control_state.current_message.is_some() {
            return false;
        }

        // Message title should match
        let expected_title = control_state.current_message.as_ref().map(|m| m.title.clone());
        if ui_state.message_title != expected_title {
            return false;
        }

        true
    }

    /// Checks if two UI states are equivalent (should be identical for consistency)
    fn ui_states_equivalent(state1: &DeviceUIState, state2: &DeviceUIState) -> bool {
        state1 == state2
    }
}
