# Implementation Plan: Message Control Synchronization

## Overview

This implementation plan addresses the message control synchronization issue by enhancing the existing state synchronization system in Vibe Cast. The approach focuses on extending the current AppStateSync architecture to properly handle bidirectional playback controls across all connected devices (Control Plane and Mobile Remote).

## Tasks

- [ ] 1. Enhance backend state models and command processing
  - [x] 1.1 Extend PlaybackControlState in AppStateSync
    - Add comprehensive playback control state fields (can_stop, can_start, initiated_by, session_id)
    - Update existing state structures to include control context
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  
  - [x] 1.2 Write property test for PlaybackControlState
    - **Property 3: UI State Consistency**
    - **Validates: Requirements 1.4, 1.5, 4.1, 4.2, 4.3, 4.4**
  
  - [x] 1.3 Implement PlaybackCommand enum and processing logic
    - Create command types for Start, Stop, Pause, Resume with device context
    - Implement command validation and processing in AppStateSync
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 1.4 Write property test for command processing
    - **Property 9: Command Validation**
    - **Validates: Requirements 3.1**
  
  - [x] 1.5 Write property test for command idempotency
    - **Property 12: Command Idempotency**
    - **Validates: Requirements 3.5**

- [ ] 2. Implement enhanced state synchronization
  - [x] 2.1 Update SSE handler to broadcast complete control state
    - Modify server-sent events to include full playback control context
    - Ensure all connected devices receive control capability information
    - _Requirements: 2.1, 3.4_
  
  - [x] 2.2 Update Tauri Events to include control state for Control Plane
    - Extend Tauri event payloads to include playback control context
    - Ensure Control Plane receives bidirectional control information
    - _Requirements: 2.1, 3.4_
  
  - [x] 2.3 Write property test for state propagation timing
    - **Property 4: State Propagation Timing**
    - **Validates: Requirements 2.1, 4.5**
  
  - [x] 2.4 Write property test for state broadcast consistency
    - **Property 11: State Broadcast Consistency**
    - **Validates: Requirements 3.4**

- [x] 3. Checkpoint - Verify backend state synchronization
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Update Control Plane playback controls
  - [x] 4.1 Enhance Control Plane PlaybackControls component
    - Update React component to handle bidirectional control state
    - Implement stop functionality when message started from remote
    - Add proper state-based control rendering (show stop when can_stop is true)
    - _Requirements: 1.1, 4.1, 4.3_
  
  - [x] 4.2 Update Control Plane state subscription logic
    - Modify Tauri event listeners to handle enhanced control state
    - Ensure UI updates immediately when control state changes
    - _Requirements: 2.1, 4.5_
  
  - [x] 4.3 Write property test for Control Plane UI consistency
    - **Property 1: Bidirectional Control Consistency**
    - **Validates: Requirements 1.1, 1.2**

- [ ] 5. Update Mobile Remote playback controls
  - [~] 5.1 Enhance Mobile Remote PlaybackControls component
    - Update React component to handle bidirectional control state
    - Implement stop functionality when message started from Control Plane
    - Add proper state-based control rendering
    - _Requirements: 1.2, 4.2, 4.4_
  
  - [~] 5.2 Update Mobile Remote SSE event handling
    - Modify SSE event listeners to handle enhanced control state
    - Ensure UI updates immediately when control state changes
    - _Requirements: 2.1, 4.5_
  
  - [~] 5.3 Write property test for Mobile Remote UI consistency
    - **Property 1: Bidirectional Control Consistency**
    - **Validates: Requirements 1.1, 1.2**

- [ ] 6. Implement command processing and error handling
  - [~] 6.1 Add command processing endpoints in Axum server
    - Create REST endpoints for playback commands from Mobile Remote
    - Implement proper error responses and validation
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [~] 6.2 Add Tauri command handlers for Control Plane
    - Create Tauri commands for playback control from Control Plane
    - Implement proper error handling and validation
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [~] 6.3 Write property test for universal stop control
    - **Property 2: Universal Stop Control**
    - **Validates: Requirements 1.3**
  
  - [~] 6.4 Write property test for error isolation
    - **Property 13: Error Isolation**
    - **Validates: Requirements 3.3, 5.4**

- [ ] 7. Implement resilience and recovery features
  - [~] 7.1 Add network resilience with command queuing
    - Implement command queue for handling temporary disconnections
    - Add retry logic for failed state synchronization
    - _Requirements: 2.4, 5.3_
  
  - [~] 7.2 Add new device synchronization logic
    - Implement immediate state sync for newly connected devices
    - Ensure devices connecting to active sessions receive current state
    - _Requirements: 2.3_
  
  - [~] 7.3 Write property test for network resilience
    - **Property 7: Network Resilience**
    - **Validates: Requirements 2.4**
  
  - [~] 7.4 Write property test for new device synchronization
    - **Property 6: New Device Synchronization**
    - **Validates: Requirements 2.3**

- [ ] 8. Add concurrent command handling
  - [~] 8.1 Implement command ordering and conflict resolution
    - Add proper locking and ordering for concurrent commands
    - Implement deterministic processing of conflicting commands
    - _Requirements: 2.5_
  
  - [~] 8.2 Write property test for concurrent command consistency
    - **Property 8: Concurrent Command Consistency**
    - **Validates: Requirements 2.5**

- [~] 9. Checkpoint - Verify complete functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Add persistence and recovery
  - [~] 10.1 Implement playback state persistence
    - Add persistent storage for active playback sessions
    - Implement state recovery after service restarts
    - _Requirements: 5.5_
  
  - [~] 10.2 Write property test for service recovery
    - **Property 17: Service Recovery**
    - **Validates: Requirements 5.5**

- [ ] 11. Integration and final testing
  - [~] 11.1 Wire all components together
    - Ensure all enhanced components work together seamlessly
    - Verify end-to-end message control synchronization
    - _Requirements: All requirements_
  
  - [~] 11.2 Write integration tests for complete workflow
    - Test full message control synchronization across all devices
    - Verify bidirectional control works in all scenarios
    - _Requirements: All requirements_
  
  - [~] 11.3 Write property test for disconnection resilience
    - **Property 14: Disconnection Resilience**
    - **Validates: Requirements 5.1**

- [~] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key integration points
- Property tests validate universal correctness properties across all valid inputs
- Unit tests validate specific examples, edge cases, and error conditions
- The implementation builds on existing Vibe Cast architecture (SSE + Tauri Events)
- Focus on enhancing existing components rather than rebuilding from scratch