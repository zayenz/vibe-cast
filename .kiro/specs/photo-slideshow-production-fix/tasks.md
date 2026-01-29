# Implementation Plan: Photo Slideshow Production Fix

## Overview

This implementation plan addresses the critical production bug where the photo slideshow fails on Windows production builds due to API endpoint failures causing HTML fallback instead of JSON responses. The approach focuses on enhancing error handling, improving diagnostics, and ensuring cross-platform consistency.

## Tasks

- [x] 1. Enhance server-side API error handling
  - [x] 1.1 Create structured error response types in Rust
    - Define `ApiErrorResponse` struct with error, code, details, and request_id fields
    - Implement proper serialization for JSON responses
    - _Requirements: 1.2, 1.4, 1.5, 3.5, 4.2_

  - [x] 1.2 Write property test for error response format consistency
    - **Property 2: Error Response Format Consistency**
    - **Validates: Requirements 1.2, 1.4, 1.5, 3.5, 4.2**

  - [x] 1.3 Refactor list_images endpoint with comprehensive error handling
    - Update function signature to return `Result<Json<Vec<String>>, (StatusCode, Json<ApiErrorResponse>)>`
    - Add detailed error handling for all failure cases (folder not found, permission denied, etc.)
    - Implement request logging and error context preservation
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 4.1, 4.2_

  - [x] 1.4 Write property test for API response format consistency
    - **Property 1: API Response Format Consistency**
    - **Validates: Requirements 1.1, 3.2, 3.3**

  - [x] 1.5 Enhance resource path resolution with better error handling
    - Improve `$RESOURCES/` prefix handling with detailed error messages
    - Add validation for resource existence and accessibility
    - _Requirements: 1.3_

  - [x] 1.6 Write property test for resource path resolution
    - **Property 3: Resource Path Resolution**
    - **Validates: Requirements 1.3**

- [ ] 2. Improve frontend error handling and diagnostics
  - [x] 2.1 Create enhanced error detection in usePhotoSlideshow hook
    - Add content-type validation to detect HTML vs JSON responses
    - Implement detailed error parsing with fallback detection
    - Add diagnostic information for malformed responses
    - _Requirements: 4.3_

  - [x] 2.2 Write property test for frontend error diagnostics
    - **Property 9: Frontend Error Diagnostics**
    - **Validates: Requirements 4.3**

  - [x] 2.3 Implement network resilience with timeout and retry mechanisms
    - Add exponential backoff retry logic for network failures
    - Implement proper timeout handling for API requests
    - _Requirements: 6.3_

  - [x] 2.4 Write property test for network resilience
    - **Property 11: Network Resilience**
    - **Validates: Requirements 6.3**

  - [x] 2.5 Enhance default fallback behavior
    - Improve fallback logic to `$RESOURCES/kittens` when folder selection fails
    - Add proper error messaging for fallback failures
    - _Requirements: 2.1, 2.3_

  - [x] 2.6 Write property test for default fallback behavior
    - **Property 4: Default Fallback Behavior**
    - **Validates: Requirements 2.1, 2.3**

- [x] 3. Checkpoint - Ensure core error handling works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Add comprehensive logging and diagnostics
  - [~] 4.1 Implement detailed API request/response logging
    - Add structured logging for all `/api/images/list` requests
    - Include request parameters, response times, and error details
    - Log SPA fallback triggers with route matching failure reasons
    - _Requirements: 4.1, 4.4_

  - [~] 4.2 Write property test for comprehensive error logging
    - **Property 8: Comprehensive Error Logging**
    - **Validates: Requirements 4.1, 4.4**

  - [~] 4.3 Add debug mode enhancement
    - Implement debug mode detection and enhanced diagnostic output
    - Add additional context information in debug responses
    - _Requirements: 4.5_

  - [~] 4.4 Write property test for debug mode enhancement
    - **Property 10: Debug Mode Enhancement**
    - **Validates: Requirements 4.5**

  - [~] 4.5 Enhance SPA fallback handler with diagnostic logging
    - Add detailed logging when SPA fallback is triggered instead of API routes
    - Include request path, method, and headers in fallback logs
    - _Requirements: 4.4_

- [ ] 5. Ensure cross-platform consistency
  - [~] 5.1 Validate Tauri command and HTTP API parity
    - Compare `list_images_in_folder` Tauri command with `/api/images/list` HTTP endpoint
    - Ensure identical error handling and response formats
    - Verify resource path resolution works consistently
    - _Requirements: 5.1, 5.2, 5.5_

  - [~] 5.2 Write property test for cross-platform consistency
    - **Property 6: Cross-Platform Consistency**
    - **Validates: Requirements 5.1, 5.2, 5.5**

  - [~] 5.3 Standardize path resolution across platforms
    - Ensure `resolve_path` function works identically in both Tauri app and server
    - Add comprehensive path validation and normalization
    - _Requirements: 5.3_

  - [~] 5.4 Write property test for path resolution consistency
    - **Property 7: Path Resolution Consistency**
    - **Validates: Requirements 5.3**

  - [~] 5.5 Add custom folder validation improvements
    - Enhance folder existence and accessibility validation
    - Implement consistent validation responses across platforms
    - _Requirements: 3.1, 3.4_

  - [~] 5.6 Write property test for custom folder validation
    - **Property 5: Custom Folder Validation**
    - **Validates: Requirements 3.1, 3.4**

- [ ] 6. Integration testing and validation
  - [~] 6.1 Create integration tests for HTTP API endpoints
    - Test complete request/response cycle for `/api/images/list`
    - Verify error responses are proper JSON with correct status codes
    - Test resource path resolution end-to-end
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [~] 6.2 Write integration tests for photo slideshow component
    - Test complete photo slideshow functionality in both desktop and web remote modes
    - Verify fallback behavior and error handling in UI
    - _Requirements: 2.1, 2.3, 2.4_

  - [~] 6.3 Add cross-platform validation tests
    - Create tests that verify identical behavior between Tauri invoke and HTTP API
    - Test with various folder structures and edge cases
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [ ] 7. Final checkpoint - Comprehensive testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive bug fix and testing coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using QuickCheck (Rust) and fast-check (TypeScript)
- Integration tests ensure end-to-end functionality works correctly
- Cross-platform testing ensures Windows production builds work identically to macOS builds
- Focus on preventing HTML fallback responses and ensuring proper JSON error handling