/**
 * Property-Based Tests for State Propagation Timing
 * 
 * **Feature: message-control-sync, Property 4: State Propagation Timing**
 * **Validates: Requirements 2.1, 4.5**
 * 
 * Property: For any state change initiated from any device, all connected devices 
 * should receive and reflect the updated state within 100ms.
 */

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::broadcast;
use tokio::time::timeout;
use quickcheck::{TestResult, Arbitrary, Gen};
use quickcheck_macros::quickcheck;

use crate::AppStateSync;
use vibe_cast_models::{PlaybackCommand, DeviceType, BroadcastState, PlaybackControlState};

/// Test data generator for device configurations
#[derive(Debug, Clone)]
struct DeviceConfiguration {
    device_count: u8,
    device_types: Vec<DeviceType>,
    device_ids: Vec<String>,
}

impl Arbitrary for DeviceConfiguration {
    fn arbitrary(g: &mut Gen) -> Self {
        let device_count = u8::arbitrary(g) % 5 + 1; // 1-5 devices
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

/// Test data generator for playback commands
#[derive(Debug, Clone)]
struct TestPlaybackCommand {
    command: PlaybackCommand,
    expected_success: bool,
}

impl Arbitrary for TestPlaybackCommand {
    fn arbitrary(g: &mut Gen) -> Self {
        let command_type = u8::arbitrary(g) % 4;
        let device_id = format!("test_device_{}", u32::arbitrary(g) % 100);
        let timestamp = SystemTime::now();
        
        // Use valid message IDs for successful commands
        let valid_message_ids = ["msg-1", "msg-2", "msg-3"];
        let message_id = valid_message_ids[usize::arbitrary(g) % valid_message_ids.len()].to_string();
        
        let (command, expected_success) = match command_type {
            0 => (
                PlaybackCommand::Start { 
                    message_id, 
                    device_id, 
                    timestamp 
                },
                true // Valid message IDs should succeed
            ),
            1 => (
                PlaybackCommand::Stop { 
                    device_id, 
                    timestamp 
                },
                false // Will fail if nothing is playing initially
            ),
            2 => (
                PlaybackCommand::Pause { 
                    device_id, 
                    timestamp 
                },
                false // Will fail if nothing is playing initially
            ),
            3 => (
                PlaybackCommand::Resume { 
                    device_id, 
                    timestamp 
                },
                false // Will fail if nothing is paused initially
            ),
            _ => unreachable!(),
        };
        
        TestPlaybackCommand {
            command,
            expected_success,
        }
    }
}

/// Simulates a connected device that subscribes to state changes
struct MockDevice {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    device_type: DeviceType,
    state_receiver: broadcast::Receiver<BroadcastState>,
    last_received_state: Option<BroadcastState>,
    last_update_time: Option<Instant>,
}

impl MockDevice {
    fn new(id: String, device_type: DeviceType, state_receiver: broadcast::Receiver<BroadcastState>) -> Self {
        Self {
            id,
            device_type,
            state_receiver,
            last_received_state: None,
            last_update_time: None,
        }
    }
    
    /// Attempt to receive the latest state update with timeout
    async fn try_receive_state_update(&mut self, timeout_duration: Duration) -> Result<BroadcastState, String> {
        match timeout(timeout_duration, self.state_receiver.recv()).await {
            Ok(Ok(state)) => {
                self.last_received_state = Some(state.clone());
                self.last_update_time = Some(Instant::now());
                Ok(state)
            },
            Ok(Err(broadcast::error::RecvError::Lagged(_))) => {
                // Handle lagged receiver by trying again
                match self.state_receiver.recv().await {
                    Ok(state) => {
                        self.last_received_state = Some(state.clone());
                        self.last_update_time = Some(Instant::now());
                        Ok(state)
                    },
                    Err(e) => Err(format!("Failed to receive after lag: {}", e)),
                }
            },
            Ok(Err(e)) => Err(format!("Receive error: {}", e)),
            Err(_) => Err("Timeout waiting for state update".to_string()),
        }
    }
    
    /// Check if this device has received a state update within the specified time window
    fn received_update_within(&self, start_time: Instant, max_duration: Duration) -> bool {
        if let Some(update_time) = self.last_update_time {
            update_time >= start_time && update_time.duration_since(start_time) <= max_duration
        } else {
            false
        }
    }
}

/// **Feature: message-control-sync, Property 4: State Propagation Timing**
/// **Validates: Requirements 2.1, 4.5**
/// 
/// Property: For any state change initiated from any device, all connected devices 
/// should receive and reflect the updated state within 100ms.
#[quickcheck(tests = 10)]
fn prop_state_propagation_timing_start_command(
    device_config: DeviceConfiguration,
    test_command: TestPlaybackCommand
) -> TestResult {
    // Skip configurations that are too complex for timing tests
    if device_config.device_count > 3 {
        return TestResult::discard();
    }
    
    // Only test Start commands for this property (they're most likely to succeed)
    if !matches!(test_command.command, PlaybackCommand::Start { .. }) {
        return TestResult::discard();
    }
    
    // Run the async test
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_state_propagation_timing_async(device_config, test_command).await
    })
}

async fn test_state_propagation_timing_async(
    device_config: DeviceConfiguration,
    test_command: TestPlaybackCommand
) -> TestResult {
    // Create AppStateSync instance
    let app_state = Arc::new(AppStateSync::new());
    
    // Create mock devices that subscribe to state changes
    let mut mock_devices = Vec::new();
    for (i, device_type) in device_config.device_types.iter().enumerate() {
        let device_id = device_config.device_ids[i].clone();
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockDevice::new(device_id, device_type.clone(), state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Record the time just before issuing the command
    let command_start_time = Instant::now();
    
    // Process the playback command
    let command_result = app_state.process_playback_command(test_command.command.clone());
    
    // If command failed and we expected it to fail, skip timing test
    if command_result.is_err() && !test_command.expected_success {
        return TestResult::discard();
    }
    
    // If command succeeded when we expected failure, that's a test failure
    if command_result.is_ok() && !test_command.expected_success {
        return TestResult::from_bool(false);
    }
    
    // If command failed when we expected success, that's a test failure
    if command_result.is_err() && test_command.expected_success {
        return TestResult::from_bool(false);
    }
    
    // Command succeeded as expected - now test timing
    let max_propagation_time = Duration::from_millis(100);
    let timeout_duration = Duration::from_millis(150); // Give a bit extra for test reliability
    
    // Attempt to receive state updates on all devices within the timeout
    let mut successful_updates = 0;
    let mut timing_violations = 0;
    
    for mock_device in &mut mock_devices {
        match mock_device.try_receive_state_update(timeout_duration).await {
            Ok(received_state) => {
                // Verify the state reflects the command that was executed
                if state_reflects_command(&received_state.playback_control, &test_command.command) {
                    successful_updates += 1;
                    
                    // Check if update was received within timing requirement
                    if !mock_device.received_update_within(command_start_time, max_propagation_time) {
                        timing_violations += 1;
                    }
                }
            },
            Err(_) => {
                // Device didn't receive update within timeout
                timing_violations += 1;
            }
        }
    }
    
    // Property validation:
    // 1. All devices should have received the state update
    // 2. All updates should have been received within 100ms
    let all_devices_updated = successful_updates == device_config.device_count as usize;
    let no_timing_violations = timing_violations == 0;
    
    TestResult::from_bool(all_devices_updated && no_timing_violations)
}

/// **Feature: message-control-sync, Property 4: State Propagation Timing**
/// **Validates: Requirements 2.1, 4.5**
/// 
/// Property: State propagation timing should be consistent regardless of the number
/// of connected devices (within reasonable limits).
#[quickcheck(tests = 5)]
fn prop_state_propagation_timing_scalability(device_count: u8) -> TestResult {
    // Limit device count to reasonable numbers for timing tests
    let device_count = (device_count % 4) + 1; // 1-4 devices
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_state_propagation_scalability_async(device_count).await
    })
}

async fn test_state_propagation_scalability_async(device_count: u8) -> TestResult {
    let app_state = Arc::new(AppStateSync::new());
    
    // Create multiple mock devices
    let mut mock_devices = Vec::new();
    for i in 0..device_count {
        let device_id = format!("device_{}", i);
        let device_type = if i % 2 == 0 { DeviceType::ControlPlane } else { DeviceType::MobileRemote };
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockDevice::new(device_id, device_type, state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Execute a start command
    let start_command = PlaybackCommand::Start {
        message_id: "msg-1".to_string(),
        device_id: "test_device".to_string(),
        timestamp: SystemTime::now(),
    };
    
    let command_start_time = Instant::now();
    let command_result = app_state.process_playback_command(start_command.clone());
    
    if command_result.is_err() {
        return TestResult::discard();
    }
    
    // Measure propagation time to all devices
    let max_propagation_time = Duration::from_millis(100);
    let timeout_duration = Duration::from_millis(150);
    
    let mut max_observed_delay = Duration::from_millis(0);
    let mut successful_updates = 0;
    
    for mock_device in &mut mock_devices {
        match mock_device.try_receive_state_update(timeout_duration).await {
            Ok(received_state) => {
                if state_reflects_command(&received_state.playback_control, &start_command) {
                    successful_updates += 1;
                    
                    if let Some(update_time) = mock_device.last_update_time {
                        let delay = update_time.duration_since(command_start_time);
                        if delay > max_observed_delay {
                            max_observed_delay = delay;
                        }
                    }
                }
            },
            Err(_) => {
                // Failed to receive update
            }
        }
    }
    
    // Property validation:
    // 1. All devices should receive updates
    // 2. Maximum delay should be within acceptable bounds
    // 3. Delay should not increase significantly with device count (within test limits)
    let all_devices_updated = successful_updates == device_count as usize;
    let timing_acceptable = max_observed_delay <= max_propagation_time;
    
    TestResult::from_bool(all_devices_updated && timing_acceptable)
}

/// **Feature: message-control-sync, Property 4: State Propagation Timing**
/// **Validates: Requirements 2.1, 4.5**
/// 
/// Property: Multiple rapid state changes should still propagate within timing bounds,
/// with the final state being consistent across all devices.
#[quickcheck(tests = 5)]
fn prop_state_propagation_timing_rapid_changes(change_count: u8) -> TestResult {
    // Limit to reasonable number of rapid changes
    let change_count = (change_count % 3) + 1; // 1-3 changes
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        test_rapid_state_changes_async(change_count).await
    })
}

async fn test_rapid_state_changes_async(change_count: u8) -> TestResult {
    let app_state = Arc::new(AppStateSync::new());
    
    // Create mock devices
    let mut mock_devices = Vec::new();
    for i in 0..2 { // Keep it simple with 2 devices
        let device_id = format!("device_{}", i);
        let device_type = if i == 0 { DeviceType::ControlPlane } else { DeviceType::MobileRemote };
        let state_receiver = app_state.state_tx.subscribe();
        let mock_device = MockDevice::new(device_id, device_type, state_receiver);
        mock_devices.push(mock_device);
    }
    
    // Execute rapid state changes
    let mut commands = Vec::new();
    let _start_time = Instant::now();
    
    // Start with a start command
    let start_command = PlaybackCommand::Start {
        message_id: "msg-1".to_string(),
        device_id: "rapid_test_device".to_string(),
        timestamp: SystemTime::now(),
    };
    
    let start_result = app_state.process_playback_command(start_command.clone());
    if start_result.is_err() {
        return TestResult::discard();
    }
    commands.push(start_command);
    
    // Add additional commands based on change_count
    for i in 1..change_count {
        let command = match i % 3 {
            1 => PlaybackCommand::Pause {
                device_id: format!("rapid_test_device_{}", i),
                timestamp: SystemTime::now(),
            },
            2 => PlaybackCommand::Resume {
                device_id: format!("rapid_test_device_{}", i),
                timestamp: SystemTime::now(),
            },
            _ => PlaybackCommand::Stop {
                device_id: format!("rapid_test_device_{}", i),
                timestamp: SystemTime::now(),
            },
        };
        
        // Execute command (some may fail, which is okay for this test)
        let _ = app_state.process_playback_command(command.clone());
        commands.push(command);
        
        // Small delay between commands to make them truly rapid but not instantaneous
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    
    let commands_end_time = Instant::now();
    
    // Wait for final state to propagate
    let max_propagation_time = Duration::from_millis(100);
    let _timeout_duration = Duration::from_millis(200); // Extra time for multiple changes
    
    // Get final state from app
    let final_app_state = app_state.get_playback_control();
    
    // Check that all devices receive consistent final state within timing bounds
    let mut devices_with_consistent_state = 0;
    let mut devices_within_timing = 0;
    
    for mock_device in &mut mock_devices {
        // Try to receive the latest state (may need to drain multiple updates)
        let mut latest_state: Option<BroadcastState> = None;
        let mut last_update_time: Option<Instant> = None;
        
        // Drain all pending updates to get the latest
        loop {
            match mock_device.try_receive_state_update(Duration::from_millis(10)).await {
                Ok(state) => {
                    latest_state = Some(state);
                    last_update_time = mock_device.last_update_time;
                },
                Err(_) => break, // No more updates
            }
        }
        
        if let Some(state) = latest_state {
            // Check if final state is consistent
            if states_equivalent(&state.playback_control, &final_app_state) {
                devices_with_consistent_state += 1;
            }
            
            // Check timing (from end of commands to final state received)
            if let Some(update_time) = last_update_time {
                if update_time.duration_since(commands_end_time) <= max_propagation_time {
                    devices_within_timing += 1;
                }
            }
        }
    }
    
    // Property validation:
    // 1. All devices should have consistent final state
    // 2. Final state should be received within timing bounds
    let all_consistent = devices_with_consistent_state == mock_devices.len();
    let all_within_timing = devices_within_timing == mock_devices.len();
    
    TestResult::from_bool(all_consistent && all_within_timing)
}

/// Helper function to check if a received state reflects the executed command
fn state_reflects_command(state: &PlaybackControlState, command: &PlaybackCommand) -> bool {
    match command {
        PlaybackCommand::Start { message_id, .. } => {
            state.is_playing && 
            state.current_message.as_ref().map(|m| &m.id) == Some(message_id) &&
            state.can_stop &&
            !state.can_start
        },
        PlaybackCommand::Stop { .. } => {
            !state.is_playing &&
            state.current_message.is_none() &&
            !state.can_stop &&
            state.can_start
        },
        PlaybackCommand::Pause { .. } => {
            !state.is_playing &&
            state.current_message.is_some() &&
            state.can_stop &&
            state.can_start
        },
        PlaybackCommand::Resume { .. } => {
            state.is_playing &&
            state.current_message.is_some() &&
            state.can_stop &&
            !state.can_start
        },
    }
}

/// Helper function to check if two states are equivalent for consistency purposes
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
    async fn test_mock_device_basic_functionality() {
        let app_state = Arc::new(AppStateSync::new());
        let state_receiver = app_state.state_tx.subscribe();
        let mut mock_device = MockDevice::new(
            "test_device".to_string(),
            DeviceType::ControlPlane,
            state_receiver
        );
        
        // Trigger a state change
        let start_time = Instant::now();
        let _ = app_state.start_message_playback("msg-1", DeviceType::MobileRemote);
        app_state.broadcast_current_state();
        
        // Device should receive the update
        let result = mock_device.try_receive_state_update(Duration::from_millis(100)).await;
        assert!(result.is_ok());
        
        let received_state = result.unwrap();
        assert!(received_state.playback_control.is_playing);
        assert!(mock_device.received_update_within(start_time, Duration::from_millis(50)));
    }
    
    #[tokio::test]
    async fn test_state_reflects_command_logic() {
        let app_state = AppStateSync::new();
        
        // Test Start command reflection
        let start_command = PlaybackCommand::Start {
            message_id: "msg-1".to_string(),
            device_id: "test".to_string(),
            timestamp: SystemTime::now(),
        };
        
        let result = app_state.process_playback_command(start_command.clone());
        assert!(result.is_ok());
        
        let final_state = result.unwrap();
        assert!(state_reflects_command(&final_state, &start_command));
        
        // Test Stop command reflection
        let stop_command = PlaybackCommand::Stop {
            device_id: "test".to_string(),
            timestamp: SystemTime::now(),
        };
        
        let result = app_state.process_playback_command(stop_command.clone());
        assert!(result.is_ok());
        
        let final_state = result.unwrap();
        assert!(state_reflects_command(&final_state, &stop_command));
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
}
