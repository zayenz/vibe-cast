# Requirements Document

## Introduction

This specification addresses the message control synchronization issue in Vibe Cast, where message playback controls are not properly synchronized across all connected devices. Currently, when a message is started from a remote device, the control plane only displays the playing state without providing stop functionality, breaking the expected unified control experience.

## Glossary

- **Control_Plane**: The main React window displayed on the primary display
- **Mobile_Remote**: The React web application served by Axum for LAN access
- **Message**: A single audio message or full folder of messages that can be played
- **State_Sync**: The hybrid SSE + Tauri Events system that maintains consistent state across devices
- **AppStateSync**: The Rust backend component that serves as the single source of truth for application state
- **Playback_Session**: An active message playing state that includes the current message, playback position, and control state

## Requirements

### Requirement 1: Universal Message Control

**User Story:** As a user operating any device (control plane or remote), I want to start and stop message playback from any connected device, so that I have consistent control regardless of which device I'm using.

#### Acceptance Criteria

1. WHEN a user starts a message from the Mobile_Remote, THE Control_Plane SHALL display both the playing state and stop control functionality
2. WHEN a user starts a message from the Control_Plane, THE Mobile_Remote SHALL display both the playing state and stop control functionality
3. WHEN a user stops a message from any device, THE System SHALL immediately stop playback and update all connected devices
4. WHEN a message is playing, THE System SHALL ensure all devices show consistent playback controls (stop button available)
5. WHEN no message is playing, THE System SHALL ensure all devices show consistent idle controls (play button available)

### Requirement 2: State Synchronization Integrity

**User Story:** As a user with multiple connected devices, I want all devices to show the same playback state at all times, so that I have a consistent experience across all interfaces.

#### Acceptance Criteria

1. WHEN a Playback_Session state changes on any device, THE State_Sync SHALL propagate the change to all connected devices within 100ms
2. WHEN the AppStateSync receives a control command, THE System SHALL update the authoritative state before acknowledging the command
3. WHEN a device connects to an active Playback_Session, THE System SHALL immediately sync the current playback state to the newly connected device
4. WHEN network connectivity is temporarily lost, THE System SHALL queue state changes and sync them when connectivity is restored
5. WHEN multiple devices send conflicting commands simultaneously, THE AppStateSync SHALL process them in order and maintain state consistency

### Requirement 3: Control Command Processing

**User Story:** As a system administrator, I want message control commands to be processed reliably and consistently, so that the system maintains proper state regardless of the command source.

#### Acceptance Criteria

1. WHEN a start command is received, THE AppStateSync SHALL validate the message exists before updating the playback state
2. WHEN a stop command is received, THE AppStateSync SHALL immediately halt playback and clear the active session state
3. WHEN invalid control commands are received, THE System SHALL reject them and maintain the current state without disruption
4. WHEN a control command is processed, THE System SHALL broadcast the resulting state change to all connected devices via State_Sync
5. WHEN the same control command is received multiple times rapidly, THE System SHALL handle it idempotently without state corruption

### Requirement 4: User Interface Consistency

**User Story:** As a user, I want the playback controls to accurately reflect the current system state on all devices, so that I can understand what actions are available at any time.

#### Acceptance Criteria

1. WHEN a message is playing, THE Control_Plane SHALL display a stop button and the current message information
2. WHEN a message is playing, THE Mobile_Remote SHALL display a stop button and the current message information
3. WHEN no message is playing, THE Control_Plane SHALL display play controls for available messages
4. WHEN no message is playing, THE Mobile_Remote SHALL display play controls for available messages
5. WHEN playback state changes, THE System SHALL update all device interfaces within 100ms to reflect the new state

### Requirement 5: Error Handling and Recovery

**User Story:** As a user, I want the system to handle errors gracefully and maintain synchronization even when problems occur, so that I can continue using the application reliably.

#### Acceptance Criteria

1. WHEN a device loses connection during playback, THE System SHALL continue playback and resync the device when it reconnects
2. WHEN the AppStateSync encounters an error processing a command, THE System SHALL log the error and maintain the previous valid state
3. WHEN state synchronization fails to a specific device, THE System SHALL retry the sync operation up to 3 times
4. WHEN a device sends malformed control commands, THE System SHALL reject them gracefully without affecting other connected devices
5. WHEN the backend service restarts during active playback, THE System SHALL restore the playback state from persistent storage if available