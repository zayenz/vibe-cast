# Implementation Plan: YouTube Player Production Fix

## Overview

This implementation plan addresses the YouTube player production mode failure by implementing a robust, multi-layered solution with proper origin handling, CSP configuration, asset serving strategies, and comprehensive error handling. The approach focuses on incremental development with early validation through testing.

## Tasks

- [x] 1. Update Tauri configuration and CSP policies
  - Update `tauri.conf.json` to include proper CSP directives for YouTube resources
  - Configure security policies to allow YouTube iframe API and video embedding
  - Add environment-specific CSP configurations for development vs production
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 1.1 Write property test for CSP compliance
  - **Property 8: CSP Compliance and Resource Access**
  - **Validates: Requirements 3.4, 3.5**

- [x] 2. Implement enhanced YouTubePlugin component
  - [x] 2.1 Create error state management and types
    - Define `YouTubeErrorType` enum and error interfaces
    - Implement `YouTubePlayerState` and configuration types
    - Add error context collection structures
    - _Requirements: 5.4, 8.4_

  - [x] 2.2 Write unit tests for error types and state management
    - Test error classification and state transitions
    - Test configuration validation with invalid inputs
    - _Requirements: 5.4, 8.4_

  - [x] 2.3 Implement environment detection and server URL resolution
    - Add logic to detect HTTP vs custom protocol environments
    - Implement `get_server_info` integration for production fallback
    - Add server availability validation
    - _Requirements: 2.4, 2.5, 4.4_

  - [x] 2.4 Write property test for environment detection
    - **Property 3: Origin Validation and Compatibility**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 2.5 Implement retry logic with exponential backoff
    - Add configurable retry mechanism for failed loads
    - Implement exponential backoff timing (1s, 2s, 4s, 8s, 16s)
    - Add maximum retry limits and timeout handling
    - _Requirements: 1.4, 5.5_

  - [x] 2.6 Write property test for retry mechanisms
    - **Property 1: YouTube API Loading Reliability**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [ ] 3. Enhance youtube_player.html with robust loading
  - [x] 3.1 Implement dynamic origin detection and validation
    - Add `getValidOrigin()` function with multiple fallback origins
    - Implement origin compatibility testing
    - Add origin parameter handling for YouTube API initialization
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Implement enhanced YouTube API loading with timeout and retry
    - Add `loadYouTubeAPI()` with Promise-based loading
    - Implement 10-second timeout with proper cleanup
    - Add retry logic for API script loading failures
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 3.3 Write property test for API loading robustness
    - **Property 2: Player Initialization and Communication**
    - **Validates: Requirements 1.5**

  - [x] 3.4 Implement comprehensive error event handling
    - Add error detection for network, origin, and API failures
    - Implement detailed error reporting to parent frame via postMessage
    - Add error recovery mechanisms where appropriate
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.5 Write property test for error handling and logging
    - **Property 5: Comprehensive Error Handling and Logging**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 4. Checkpoint - Ensure core functionality works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement enhanced asset serving strategy
  - [ ] 5.1 Update Axum server routes for YouTube player HTML
    - Ensure proper MIME types and CORS headers for YouTube compatibility
    - Add health check endpoint for server availability validation
    - Implement proper error responses for asset serving failures
    - _Requirements: 4.2, 4.3, 4.5_

  - [ ] 5.2 Implement asset serving validation and fallback logic
    - Add pre-flight checks for asset availability via Tauri protocol
    - Implement automatic fallback from asset protocol to HTTP server
    - Add asset accessibility validation before iframe creation
    - _Requirements: 4.1, 4.2, 4.4_

  - [ ] 5.3 Write property test for asset serving strategy
    - **Property 4: Asset Serving Strategy Robustness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [ ] 6. Implement fallback UI and graceful degradation
  - [ ] 6.1 Create fallback interface components
    - Design and implement fallback UI for when YouTube is unavailable
    - Add manual URL input component as alternative
    - Implement clear messaging for reduced functionality states
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ] 6.2 Implement graceful degradation logic
    - Add detection for complete YouTube API unavailability
    - Implement fallback suggestions for blocked YouTube scenarios
    - Ensure core application usability when YouTube fails
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ] 6.3 Write property test for graceful degradation
    - **Property 6: Graceful Degradation and Fallback Behavior**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [ ] 7. Implement configuration management system
  - [ ] 7.1 Create configuration interfaces and validation
    - Define `YouTubeConfig` interface with all configurable parameters
    - Implement configuration validation with safe defaults
    - Add environment-specific configuration loading
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 7.2 Implement runtime configuration management
    - Add configuration parameter validation at startup
    - Implement configuration error logging and reporting
    - Add configuration change handling for dynamic updates
    - _Requirements: 8.4, 8.5_

  - [ ] 7.3 Write property test for configuration validation
    - **Property 7: Configuration Validation and Defaults**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [ ] 8. Implement comprehensive logging and diagnostics
  - [ ] 8.1 Create error context collection system
    - Implement `ErrorContext` interface with environment details
    - Add diagnostic information collection (network, CSP, server status)
    - Implement structured logging for all error conditions
    - _Requirements: 5.4, 7.4_

  - [ ] 8.2 Add production-specific diagnostic capabilities
    - Implement browser compatibility detection
    - Add YouTube API script loading status monitoring
    - Create server availability and response time tracking
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 8.3 Write unit tests for logging and diagnostics
    - Test error context collection with various scenarios
    - Test diagnostic information accuracy
    - _Requirements: 5.4, 7.4_

- [ ] 9. Checkpoint - Ensure error handling and diagnostics work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement production testing and validation
  - [ ] 10.1 Create production build testing framework
    - Set up testing environment that uses production builds
    - Implement automated YouTube player functionality validation
    - Add CSP compliance testing for production configurations
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 10.2 Implement cross-environment integration tests
    - Create tests that validate identical functionality across dev/prod
    - Test server fallback mechanisms in both Tauri and web contexts
    - Validate complete YouTube player lifecycle in production builds
    - _Requirements: 7.4, 7.5_

  - [ ] 10.3 Write property test for production validation
    - Test YouTube player loading across different environment configurations
    - Validate error recovery flows work consistently in production
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Integration and final wiring
  - [ ] 11.1 Wire all components together in YouTubePlugin
    - Integrate error handling, retry logic, and fallback mechanisms
    - Connect configuration management with runtime behavior
    - Ensure proper communication between iframe and parent components
    - _Requirements: 1.5, 5.5, 6.4_

  - [ ] 11.2 Update plugin registration and initialization
    - Update visualization plugin registry to use enhanced YouTube component
    - Ensure proper initialization order and dependency management
    - Add startup validation for YouTube plugin configuration
    - _Requirements: 8.5_

  - [ ] 11.3 Write integration tests for complete YouTube plugin
    - Test end-to-end YouTube player functionality
    - Test error recovery and fallback scenarios
    - Test configuration changes and their effects
    - _Requirements: 1.1, 1.2, 1.5, 5.5, 6.4_

- [ ] 12. Final checkpoint - Ensure all functionality works in production
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of functionality
- Property tests validate universal correctness properties across environments
- Unit tests validate specific examples, edge cases, and error conditions
- Focus on production build testing to prevent regressions
- Comprehensive error handling ensures graceful degradation in all scenarios