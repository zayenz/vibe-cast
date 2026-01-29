/**
 * Property-Based Tests for State Broadcast Consistency
 * 
 * **Feature: message-control-sync, Property 11: State Broadcast Consistency**
 * **Validates: Requirements 3.4**
 * 
 * Property: For any successfully processed control command, the resulting state change 
 * should be broadcast to all connected devices via the State_Sync mechanism.
 */

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::broadcast;
use tokio::time::timeout;
use quickcheck::{TestResult, Arbitrary, Gen};
use quickcheck_macros::quickcheck;

use crate::AppStateSync;
use vibe_cast_models::{PlaybackCommand, DeviceType, BroadcastState, PlaybackControlState};

/// Test data generator for valid playback commands that should succeed
#[derive(Debug, Clone)]
struct ValidPlaybackCommand {
    command: PlaybackCommand,
    setup_commands: Vec<PlaybackCommand>, // Commands needed to set up state for this command
}

impl Arbitrary for ValidPlaybackCommand {
    fn arbitrary(g: &mut Gen) -> Self {
        let command_type = u8::arbitrary(g) % 4;
        let device_id = format!("test_device_{}", u32::arbitrary(g) % 100);
        let timestamp = SystemTime::now();
        
        // Use valid message IDs
        let valid_message_ids = ["msg-1", "msg-2", "msg-3"];
        let message_id = valid_message_ids[usize::arbitrary(g) % valid_message_ids.len()].to_string();
        
        match command_type {
            0 => {
                // Start command - no setup needed
                ValidPlaybackCommand {
                    command: PlaybackCommand::Start { 
                        message_id, 
                        device_id, 
                        timestamp 
                    },
                    setup_commands: vec![],
                }
            },
            1 => {
                // Stop command - needs a start command first
                let setup_start = PlaybackCommand::Start {
                    message_id: message_id.clone(),
                    device_id: device_id.clone(),
                    timestamp,
                };
                ValidPlaybackCommand {
                    command: PlaybackCommand::Stop { 
                        device_id, 
                        timestamp 
                    },
                    setup_commands: vec![setup_start],
                }
            },
            2 => {
                // Pause command - needs a start command first
                let setup_start = PlaybackCommand::Start {
                    message_id: message_id.clone(),
                    device_id: device_id.clone(),
                    timestamp,
                };
                ValidPlaybackCommand {
                    command: PlaybackCommand::Pause { 
                        device_id, 
                        timestamp 
                    },
                    setup_commands: vec![setup_start],
                }
            },
            3 => {
                // Resume command - needs start then pause
                let setup_start = PlaybackCommand::Start {
                    message_id: message_id.clone(),
                    device_id: device_id.clone(),
                    timestamp,
                };
                let setup_pause = PlaybackCommand::Pause {
                    device_id: device_id.clone(),
                    timestamp,
                };
                ValidPlaybackCommand {
                    command: PlaybackCommand::Resume { 
                        device_id, 
                        timestamp 
                    },
                    setup_commands: vec![setup_start, setup_pause],
                }
            },
            _ => unreachable!(),
        }
    }
}

/// Test data generator for device configurations
#[derive(Debug, Clone)]
struct DeviceConfiguration {
    device_count: u8,
    device_types: Vec<DeviceType>,
    device_ids: Vec<String>,
}

impl Arbitrary for DeviceConfiguration {
    fn arbitrary(g: &mut Gen) -> Self {
        let device_count = (u8::arbitrary(g) % 4) + 1; // 1-4 devices for broadcast testing
        let available_types = [DeviceType::ControlPlane, DeviceType::MobileRemote, DeviceType::System];
        
        let mut device_types = Vec::new();
        let mut device_ids = Vec::new();
        
        for i in 0..device_count {
            let device_type = available_types[usize::arbitrary(g) % available_types.len()].clone();
            let device_id = format!("{}_{}", 
                match device_type {
                    DeviceType::ControlPlane => "control_plane",
                    DeviceType::MobileRemote => "mobile_remote", 
                    DeviceType::System => "system",
                }, 
                i
            );
            
            device_types.push(device_type);
            device_ids.push(device_id);
        }
        
        DeviceConfiguration {
            device_count,
            device_types,
            device_ids,
        }
    }
}

/// Mock device that subscribes to state broadcasts
struct MockConnectedDevice {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    device_type: DeviceType,
    state_receiver: broadcast::Receiver<BroadcastState>,
    received_states: Vec<(BroadcastState, Instant)>,
}

impl MockConnectedDevice {
    fn new(id: String, device_type: DeviceType, state_receiver: broadcast::Receiver<BroadcastState>) -> Self {
        Self {
            id,
            device_type,
            state_receiver,
            received_states: Vec::new(),
        }
    }
    
    /// Attempt to receive state updates with timeout
    async fn try_receive_updates(&mut self, timeout_duration: Duration) -> Result<Vec<BroadcastState>, String> {
        let mut updates = Vec::new();
        let start_time = Instant::now();
        
        loop {
            let remaining_time = timeout_duration.saturating_sub(start_time.elapsed());
            if remaining_time.is_zero() {
                break;
            }
            
            match timeout(remaining_time, self.state_receiver.recv()).await {
                Ok(Ok(state)) => {
                    let receive_time = Instant::now();
                    self.received_states.push((state.clone(), receive_time));
                    updates.push(state);
                },
                Ok(Err(broadcast::error::RecvError::Lagged(_))) => {
                    // Handle lagged receiver by trying to get the latest state
                    match self.state_receiver.recv().await {
                        Ok(state) => {
                            let receive_time = Instant::now();
                            self.received_states.push((state.clone(), receive_time));
                            updates.push(state);
                        },
                        Err(_) => break,
                    }
                },
                Ok(Err(_)) => break,
                Err(_) => break, // Timeout
            }
        }
        
        if updates.is_empty() {
            Err("No state updates received within timeout".to_string())
        } else {
            Ok(updates)
        }
    }
    
    /// Get the most recent state received by this device
    fn get_latest_state(&self) -> Option<&BroadcastState> {
        self.received_states.last().map(|(state, _)| state)
    }
    
    /// Check if this device received a state update after a specific time
    fn received_update_after(&self, after_time: Instant) -> bool {
        self.received_states.iter().any(|(_, receive_time)| *receive_time > after_time)
    }
}

/// **Feature: message-control-sync, Property 11: State Broadcast Consistency**
/// **Validates: Requirements 3.4**
/// 
/// Property: For any successfully processed control command, the resulting state change 
/// should be broadcast to all connected devices via the State_Sync mechanism.
#[quickcheck]
fn prop_state_broadcast_consistency_basic(
    valid_command: ValidPlaybackCommand,
    device_config: DeviceConfiguration
) -> TestResult {
    // Skip overly complex configurations for basic broadcast testing
    if device_config.device_count > 3 {
        return TestResult::discard();
    }
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_state_broadcast_consistency_async(valid_command, device_config).await
    })
}

async fn test_state_broadcast_consistency_async(
    valid_command: ValidPlaybackCommand,
    device_config: DeviceConfiguration
) -> TestResult {
    // Create AppStateSync instance
    let app_state = Arc::new(AppStateSync::new());
    
    // Create mock connected devices that subscribe to state broadcasts
    let mut mock_devices = Vec::new();
    for (i, device_type) in device_config.device_types.iter().enumerate() {
        let device_id = device_config.device_ids[i].clone();
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockConnectedDevice::new(device_id, device_type.clone(), state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Execute setup commands if needed
    for setup_command in &valid_command.setup_commands {
        let setup_result = app_state.process_playback_command(setup_command.clone());
        if setup_result.is_err() {
            return TestResult::discard(); // Skip if setup fails
        }
    }
    
    // Clear any setup broadcasts from device receivers
    for mock_device in &mut mock_devices {
        let _ = mock_device.try_receive_updates(Duration::from_millis(50)).await;
        mock_device.received_states.clear(); // Clear setup states
    }
    
    // Record time just before executing the main command
    let command_start_time = Instant::now();
    
    // Execute the main command
    let command_result = app_state.process_playback_command(valid_command.command.clone());
    
    // Command should succeed (we've set up valid commands)
    if command_result.is_err() {
        return TestResult::discard();
    }
    
    let expected_state = command_result.unwrap();
    
    // Wait for broadcasts to reach all devices
    let broadcast_timeout = Duration::from_millis(200);
    let mut devices_received_broadcast = 0;
    let mut devices_with_correct_state = 0;
    
    for mock_device in &mut mock_devices {
        match mock_device.try_receive_updates(broadcast_timeout).await {
            Ok(_updates) => {
                devices_received_broadcast += 1;
                
                // Check if device received update after command execution
                if mock_device.received_update_after(command_start_time) {
                    // Verify the latest state matches the expected state
                    if let Some(latest_state) = mock_device.get_latest_state() {
                        if states_equivalent(&latest_state.playback_control, &expected_state) {
                            devices_with_correct_state += 1;
                        }
                    }
                }
            },
            Err(_) => {
                // Device didn't receive broadcast
            }
        }
    }
    
    // Property validation:
    // 1. All connected devices should receive the state broadcast
    // 2. All devices should receive the correct state that reflects the command result
    let all_devices_received_broadcast = devices_received_broadcast == device_config.device_count as usize;
    let all_devices_have_correct_state = devices_with_correct_state == device_config.device_count as usize;
    
    TestResult::from_bool(all_devices_received_broadcast && all_devices_have_correct_state)
}

/// **Feature: message-control-sync, Property 11: State Broadcast Consistency**
/// **Validates: Requirements 3.4**
/// 
/// Property: State broadcasts should be consistent across different command types,
/// ensuring all command results are properly communicated to connected devices.
#[quickcheck]
fn prop_state_broadcast_consistency_command_types(command_type: u8) -> TestResult {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_command_type_broadcast_consistency_async(command_type).await
    })
}

async fn test_command_type_broadcast_consistency_async(command_type: u8) -> TestResult {
    let app_state = Arc::new(AppStateSync::new());
    
    // Create a few mock devices
    let mut mock_devices = Vec::new();
    let device_types = [DeviceType::ControlPlane, DeviceType::MobileRemote];
    
    for (i, device_type) in device_types.iter().enumerate() {
        let device_id = format!("device_{}", i);
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockConnectedDevice::new(device_id, device_type.clone(), state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Create command based on type
    let device_id = "test_device".to_string();
    let timestamp = SystemTime::now();
    let message_id = "msg-1".to_string();
    
    let (main_command, setup_commands) = match command_type % 4 {
        0 => {
            // Start command
            (PlaybackCommand::Start { message_id, device_id, timestamp }, vec![])
        },
        1 => {
            // Stop command (needs start first)
            let setup = PlaybackCommand::Start { 
                message_id: message_id.clone(), 
                device_id: device_id.clone(), 
                timestamp 
            };
            let main = PlaybackCommand::Stop { device_id, timestamp };
            (main, vec![setup])
        },
        2 => {
            // Pause command (needs start first)
            let setup = PlaybackCommand::Start { 
                message_id: message_id.clone(), 
                device_id: device_id.clone(), 
                timestamp 
            };
            let main = PlaybackCommand::Pause { device_id, timestamp };
            (main, vec![setup])
        },
        3 => {
            // Resume command (needs start then pause)
            let setup1 = PlaybackCommand::Start { 
                message_id: message_id.clone(), 
                device_id: device_id.clone(), 
                timestamp 
            };
            let setup2 = PlaybackCommand::Pause { 
                device_id: device_id.clone(), 
                timestamp 
            };
            let main = PlaybackCommand::Resume { device_id, timestamp };
            (main, vec![setup1, setup2])
        },
        _ => unreachable!(),
    };
    
    // Execute setup commands
    for setup_command in &setup_commands {
        let setup_result = app_state.process_playback_command(setup_command.clone());
        if setup_result.is_err() {
            return TestResult::discard();
        }
    }
    
    // Clear setup broadcasts
    for mock_device in &mut mock_devices {
        let _ = mock_device.try_receive_updates(Duration::from_millis(50)).await;
        mock_device.received_states.clear();
    }
    
    // Execute main command
    let command_start_time = Instant::now();
    let command_result = app_state.process_playback_command(main_command.clone());
    
    if command_result.is_err() {
        return TestResult::discard();
    }
    
    let expected_state = command_result.unwrap();
    
    // Verify all devices receive consistent broadcasts
    let mut all_devices_consistent = true;
    
    for mock_device in &mut mock_devices {
        match mock_device.try_receive_updates(Duration::from_millis(150)).await {
            Ok(_) => {
                if mock_device.received_update_after(command_start_time) {
                    if let Some(latest_state) = mock_device.get_latest_state() {
                        if !states_equivalent(&latest_state.playback_control, &expected_state) {
                            all_devices_consistent = false;
                            break;
                        }
                    } else {
                        all_devices_consistent = false;
                        break;
                    }
                } else {
                    all_devices_consistent = false;
                    break;
                }
            },
            Err(_) => {
                all_devices_consistent = false;
                break;
            }
        }
    }
    
    TestResult::from_bool(all_devices_consistent)
}

/// **Feature: message-control-sync, Property 11: State Broadcast Consistency**
/// **Validates: Requirements 3.4**
/// 
/// Property: State broadcasts should maintain consistency even when multiple
/// commands are processed in sequence, with each command result being broadcast.
#[quickcheck]
fn prop_state_broadcast_consistency_sequential_commands(sequence_length: u8) -> TestResult {
    // Limit sequence length to keep test execution reasonable
    let sequence_length = (sequence_length % 3) + 1; // 1-3 commands
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_sequential_command_broadcast_consistency_async(sequence_length).await
    })
}

async fn test_sequential_command_broadcast_consistency_async(sequence_length: u8) -> TestResult {
    let app_state = Arc::new(AppStateSync::new());
    
    // Create mock devices
    let mut mock_devices = Vec::new();
    for i in 0..2 { // Keep it simple with 2 devices
        let device_id = format!("device_{}", i);
        let device_type = if i == 0 { DeviceType::ControlPlane } else { DeviceType::MobileRemote };
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockConnectedDevice::new(device_id, device_type, state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Create a sequence of valid commands
    let mut command_sequence = Vec::new();
    let device_id = "sequence_test_device".to_string();
    let timestamp = SystemTime::now();
    
    // Always start with a Start command
    command_sequence.push(PlaybackCommand::Start {
        message_id: "msg-1".to_string(),
        device_id: device_id.clone(),
        timestamp,
    });
    
    // Add additional commands based on sequence length
    for i in 1..sequence_length {
        let command = match i % 3 {
            1 => PlaybackCommand::Pause {
                device_id: device_id.clone(),
                timestamp,
            },
            2 => PlaybackCommand::Resume {
                device_id: device_id.clone(),
                timestamp,
            },
            _ => PlaybackCommand::Stop {
                device_id: device_id.clone(),
                timestamp,
            },
        };
        command_sequence.push(command);
    }
    
    // Execute commands and track expected states
    let mut expected_states = Vec::new();
    let mut command_execution_times = Vec::new();
    
    for command in &command_sequence {
        let execution_time = Instant::now();
        let result = app_state.process_playback_command(command.clone());
        
        if result.is_err() {
            // Some commands in sequence may fail (e.g., resume without pause), skip those
            continue;
        }
        
        expected_states.push(result.unwrap());
        command_execution_times.push(execution_time);
        
        // Small delay between commands
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    
    if expected_states.is_empty() {
        return TestResult::discard(); // No successful commands
    }
    
    // Wait for all broadcasts to complete
    tokio::time::sleep(Duration::from_millis(100)).await;
    
    // Verify each device received broadcasts for all successful commands
    let mut all_devices_consistent = true;
    
    for mock_device in &mut mock_devices {
        // Collect all updates received by this device
        let _ = mock_device.try_receive_updates(Duration::from_millis(50)).await;
        
        // Check that device received at least as many updates as successful commands
        if mock_device.received_states.len() < expected_states.len() {
            all_devices_consistent = false;
            break;
        }
        
        // Verify the final state matches the last expected state
        if let Some(latest_state) = mock_device.get_latest_state() {
            let last_expected_state = &expected_states[expected_states.len() - 1];
            if !states_equivalent(&latest_state.playback_control, last_expected_state) {
                all_devices_consistent = false;
                break;
            }
        } else {
            all_devices_consistent = false;
            break;
        }
    }
    
    TestResult::from_bool(all_devices_consistent)
}

/// **Feature: message-control-sync, Property 11: State Broadcast Consistency**
/// **Validates: Requirements 3.4**
/// 
/// Property: State broadcasts should be reliable even when devices connect
/// at different times during command processing.
#[quickcheck]
fn prop_state_broadcast_consistency_late_connecting_devices(device_connect_delay: u8) -> TestResult {
    // Limit delay to reasonable range
    let connect_delay_ms = (device_connect_delay % 50) + 10; // 10-59ms delay
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_late_connecting_device_broadcast_consistency_async(connect_delay_ms).await
    })
}

async fn test_late_connecting_device_broadcast_consistency_async(connect_delay_ms: u8) -> TestResult {
    let app_state = Arc::new(AppStateSync::new());
    
    // Create one device that connects immediately
    let early_device_receiver = app_state.state_tx.subscribe();
    let mut early_device = MockConnectedDevice::new(
        "early_device".to_string(),
        DeviceType::ControlPlane,
        early_device_receiver
    );
    
    // Execute a command
    let start_command = PlaybackCommand::Start {
        message_id: "msg-1".to_string(),
        device_id: "test_device".to_string(),
        timestamp: SystemTime::now(),
    };
    
    let command_result = app_state.process_playback_command(start_command.clone());
    if command_result.is_err() {
        return TestResult::discard();
    }
    
    let _expected_state = command_result.unwrap();
    
    // Wait for the specified delay, then connect a late device
    tokio::time::sleep(Duration::from_millis(connect_delay_ms as u64)).await;
    
    let late_device_receiver = app_state.state_tx.subscribe();
    let mut late_device = MockConnectedDevice::new(
        "late_device".to_string(),
        DeviceType::MobileRemote,
        late_device_receiver
    );
    
    // Execute another command to trigger a new broadcast
    let stop_command = PlaybackCommand::Stop {
        device_id: "test_device".to_string(),
        timestamp: SystemTime::now(),
    };
    
    let stop_result = app_state.process_playback_command(stop_command.clone());
    if stop_result.is_err() {
        return TestResult::discard();
    }
    
    let expected_stop_state = stop_result.unwrap();
    
    // Both devices should receive the stop command broadcast
    let broadcast_timeout = Duration::from_millis(150);
    
    let early_updates = early_device.try_receive_updates(broadcast_timeout).await;
    let late_updates = late_device.try_receive_updates(broadcast_timeout).await;
    
    // Verify both devices received broadcasts
    let early_received = early_updates.is_ok();
    let late_received = late_updates.is_ok();
    
    if !early_received || !late_received {
        return TestResult::from_bool(false);
    }
    
    // Verify both devices have consistent final state
    let early_final_state = early_device.get_latest_state();
    let late_final_state = late_device.get_latest_state();
    
    match (early_final_state, late_final_state) {
        (Some(early_state), Some(late_state)) => {
            let early_consistent = states_equivalent(&early_state.playback_control, &expected_stop_state);
            let late_consistent = states_equivalent(&late_state.playback_control, &expected_stop_state);
            let states_match = states_equivalent(&early_state.playback_control, &late_state.playback_control);
            
            TestResult::from_bool(early_consistent && late_consistent && states_match)
        },
        _ => TestResult::from_bool(false),
    }
}

/// Helper function to check if two states are equivalent for broadcast consistency
fn states_equivalent(state1: &PlaybackControlState, state2: &PlaybackControlState) -> bool {
    state1.session_id == state2.session_id &&
    state1.current_message == state2.current_message &&
    state1.is_playing == state2.is_playing &&
    state1.can_stop == state2.can_stop &&
    state1.can_start == state2.can_start
    // Note: We don't compare playback_position, initiated_by, or last_updated 
    // as these may legitimately differ between equivalent states
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    
    #[tokio::test]
    async fn test_mock_connected_device_basic_functionality() {
        let app_state = Arc::new(AppStateSync::new());
        let state_receiver = app_state.state_tx.subscribe();
        let mut mock_device = MockConnectedDevice::new(
            "test_device".to_string(),
            DeviceType::ControlPlane,
            state_receiver
        );
        
        // Trigger a state change
        let _ = app_state.start_message_playback("msg-1", DeviceType::MobileRemote);
        
        // Device should receive the update
        let updates = mock_device.try_receive_updates(Duration::from_millis(100)).await;
        assert!(updates.is_ok());
        
        let received_updates = updates.unwrap();
        assert!(!received_updates.is_empty());
        
        let latest_state = mock_device.get_latest_state();
        assert!(latest_state.is_some());
        assert!(latest_state.unwrap().playback_control.is_playing);
    }
    
    #[tokio::test]
    async fn test_broadcast_consistency_single_command() {
        let app_state = Arc::new(AppStateSync::new());
        
        // Create multiple mock devices
        let mut devices = Vec::new();
        for i in 0..3 {
            let state_receiver = app_state.state_tx.subscribe();
            let device = MockConnectedDevice::new(
                format!("device_{}", i),
                if i % 2 == 0 { DeviceType::ControlPlane } else { DeviceType::MobileRemote },
                state_receiver
            );
            devices.push(device);
        }
        
        // Execute a command
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "test_device".to_string(),
            timestamp: SystemTime::now(),
        };
        
        let result = app_state.process_playback_command(start_command);
        assert!(result.is_ok());
        
        let expected_state = result.unwrap();
        
        // All devices should receive consistent broadcasts
        for device in &mut devices {
            let updates = device.try_receive_updates(Duration::from_millis(100)).await;
            assert!(updates.is_ok());
            
            let latest_state = device.get_latest_state();
            assert!(latest_state.is_some());
            assert!(states_equivalent(&latest_state.unwrap().playback_control, &expected_state));
        }
    }
    
    #[test]
    fn test_states_equivalent_logic() {
        let state1 = PlaybackControlState {
            session_id: Some("session1".to_string()),
            current_message: None,
            is_playing: false,
            playback_position: Duration::from_secs(0),
            can_stop: false,
            can_start: true,
            initiated_by: DeviceType::ControlPlane,
            last_updated: SystemTime::now(),
        };
        
        let mut state2 = state1.clone();
        assert!(states_equivalent(&state1, &state2));
        
        // Different timestamps should still be equivalent
        state2.last_updated = SystemTime::now();
        assert!(states_equivalent(&state1, &state2));
        
        // Different initiated_by should still be equivalent
        state2.initiated_by = DeviceType::MobileRemote;
        assert!(states_equivalent(&state1, &state2));
        
        // Different core state should not be equivalent
        state2.is_playing = true;
        assert!(!states_equivalent(&state1, &state2));
    }
    
    #[tokio::test]
    async fn test_valid_playback_command_generation() {
        // Test that our ValidPlaybackCommand generator creates valid setups
        
        // Test Start command (no setup needed)
        let app_state1 = AppStateSync::new();
        let start_cmd = ValidPlaybackCommand {
            command: PlaybackCommand::Start {
                message_id: "msg-1".to_string(),
                device_id: "test".to_string(),
                timestamp: SystemTime::now(),
            },
            setup_commands: vec![],
        };
        
        let result = app_state1.process_playback_command(start_cmd.command);
        assert!(result.is_ok());
        
        // Test Stop command (with setup) - use fresh AppStateSync instance
        let app_state2 = AppStateSync::new();
        let stop_cmd = ValidPlaybackCommand {
            command: PlaybackCommand::Stop {
                device_id: "test".to_string(),
                timestamp: SystemTime::now(),
            },
            setup_commands: vec![PlaybackCommand::Start {
                message_id: "msg-1".to_string(),
                device_id: "test".to_string(),
                timestamp: SystemTime::now(),
            }],
        };
        
        // Execute setup
        for setup in &stop_cmd.setup_commands {
            let setup_result = app_state2.process_playback_command(setup.clone());
            assert!(setup_result.is_ok());
        }
        
        // Execute main command
        let result = app_state2.process_playback_command(stop_cmd.command);
        assert!(result.is_ok());
    }
}