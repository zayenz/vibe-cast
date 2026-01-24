# Design Document: Photo Slideshow Production Fix

## Overview

This design addresses a critical production bug in VibeCast's photo slideshow feature that affects Windows production builds. The issue occurs when the `/api/images/list` HTTP endpoint fails or is not properly routed, causing the Axum server to fall back to serving the SPA (index.html) instead of returning JSON. This results in a JSON parsing error when the frontend tries to parse HTML as JSON.

The root cause is that Windows production builds run as a web interface served by the Axum server, using HTTP API calls instead of Tauri invoke commands. When the API endpoint fails to match or encounters an error, the server's fallback mechanism serves HTML instead of proper JSON error responses.

## Architecture

### Current System Architecture

VibeCast uses a dual-path approach for photo slideshow functionality:

1. **Desktop Path (Development & macOS Production)**: Uses Tauri `invoke` commands
   - Command: `list_images_in_folder`
   - Direct file system access through Tauri APIs
   - Returns `Vec<String>` of image paths

2. **Web Remote Path (Windows Production)**: Uses HTTP API endpoints
   - Endpoint: `/api/images/list?folder={path}`
   - Served by Axum server
   - Should return JSON array of image paths

### Problem Analysis

The issue manifests in the web remote path where:

1. **Route Matching Failure**: The `/api/images/list` route may not be properly matched
2. **Error Handling Gap**: When the endpoint encounters errors, it doesn't return proper JSON responses
3. **SPA Fallback Trigger**: Failed API requests fall through to the SPA fallback handler
4. **JSON Parse Error**: Frontend receives HTML (`<!DOCTYPE html>...`) instead of JSON

### Environment Detection Logic

The current environment detection in `usePhotoSlideshow.ts`:
```typescript
const isWebRemote = window.location.protocol.startsWith('http') && !import.meta.env.DEV;
```

This correctly identifies Windows production builds as web remote environments.

## Components and Interfaces

### 1. HTTP API Endpoint (`/api/images/list`)

**Current Implementation Issues:**
- Located in `src-tauri/crates/server/src/lib.rs`
- Returns `Json<Vec<String>>` on success
- No explicit error handling for JSON responses
- May not handle all edge cases properly

**Enhanced Interface:**
```rust
async fn list_images(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<String>>, (StatusCode, Json<ErrorResponse>)>
```

### 2. Error Response Structure

**New Error Response Type:**
```rust
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: String,
    details: Option<String>,
}
```

### 3. Frontend Error Handling

**Enhanced Error Processing:**
```typescript
interface ApiError {
    error: string;
    code: string;
    details?: string;
}

async function fetchImageList(targetPath: string): Promise<string[]> {
    const response = await fetch(`/api/images/list?folder=${encodeURIComponent(targetPath)}`);
    
    if (!response.ok) {
        let errorMessage = `HTTP ${response.status} ${response.statusText}`;
        
        try {
            const errorData: ApiError = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch {
            // If we can't parse JSON, it might be HTML fallback
            const text = await response.text();
            if (text.includes('<!DOCTYPE')) {
                errorMessage = 'Server returned HTML instead of JSON - API endpoint may not be working';
            }
        }
        
        throw new Error(errorMessage);
    }
    
    return response.json();
}
```

### 4. Server Route Configuration

**Enhanced Route Setup:**
```rust
let app = Router::new()
    // ... other routes ...
    .route("/api/images/list", get(list_images_with_error_handling))
    .route("/api/images/serve", get(serve_image_with_error_handling))
    // ... other routes ...
    .fallback(get(serve_spa_with_logging))
```

### 5. Logging and Diagnostics

**Enhanced Logging System:**
- Request/response logging for image API endpoints
- Detailed error logging with request parameters
- SPA fallback trigger logging
- Path resolution debugging

## Data Models

### 1. Image List Response

**Success Response:**
```json
[
    "/path/to/image1.jpg",
    "/path/to/image2.png",
    "/path/to/video1.mp4"
]
```

**Error Response:**
```json
{
    "error": "Folder not found",
    "code": "FOLDER_NOT_FOUND",
    "details": "The specified folder '/invalid/path' does not exist or is not accessible"
}
```

### 2. Resource Path Resolution

**Input Formats:**
- `$RESOURCES/kittens` → Bundled resource path
- `/absolute/path/to/folder` → Absolute file system path
- `relative/path` → Relative to config base path

**Resolution Logic:**
```rust
fn resolve_image_folder_path(
    folder_path: &str,
    app_handle: &AppHandle,
    config_base_path: Option<&str>
) -> Result<PathBuf, ResolveError>
```

### 3. Supported Media Types

**Image Extensions:**
`["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"]`

**Video Extensions:**
`["mp4", "mov", "webm", "m4v", "avi", "mkv"]`

## Correctness Properties

Now I need to use the prework tool to analyze the acceptance criteria before writing the correctness properties:

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated to eliminate redundancy:

- Properties 1.1, 3.2, and 3.3 all test API response format consistency and can be combined into a comprehensive "API response format" property
- Properties 1.2, 1.4, 1.5, and 3.5 all test error response consistency and can be combined into an "error response format" property  
- Properties 4.2 and the error status aspects can be merged with the error response property
- Properties 5.1, 5.2, and 5.5 test cross-platform/interface consistency and can be combined

### Core Properties

**Property 1: API Response Format Consistency**
*For any* valid folder path provided to the `/api/images/list` endpoint, the response should be a JSON array containing only supported image and video file paths from that folder
**Validates: Requirements 1.1, 3.2, 3.3**

**Property 2: Error Response Format Consistency**  
*For any* error condition encountered by the `/api/images/list` endpoint, the response should be proper JSON with appropriate HTTP status codes (400, 403, 404, 500) and never fall back to HTML
**Validates: Requirements 1.2, 1.4, 1.5, 3.5, 4.2**

**Property 3: Resource Path Resolution**
*For any* path prefixed with `$RESOURCES/`, the system should resolve it to the correct bundled resource location and return the same results as direct file system access
**Validates: Requirements 1.3**

**Property 4: Default Fallback Behavior**
*For any* invalid or empty folder specification, the photo slideshow should fall back to loading images from `$RESOURCES/kittens` and display them successfully
**Validates: Requirements 2.1, 2.3**

**Property 5: Custom Folder Validation**
*For any* custom folder path provided by a user, the system should validate accessibility and return appropriate responses (success with image list, or proper error with JSON format)
**Validates: Requirements 3.1, 3.4**

**Property 6: Cross-Platform Consistency**
*For any* photo slideshow operation, the behavior should be identical between Windows production builds (HTTP API) and macOS builds (Tauri invoke), with the same inputs producing the same outputs
**Validates: Requirements 5.1, 5.2, 5.5**

**Property 7: Path Resolution Consistency**
*For any* file path (absolute or relative), the resolution behavior should be consistent across all platforms and execution environments
**Validates: Requirements 5.3**

**Property 8: Comprehensive Error Logging**
*For any* API error or system failure, detailed diagnostic information should be logged including request parameters, failure reasons, and context
**Validates: Requirements 4.1, 4.4**

**Property 9: Frontend Error Diagnostics**
*For any* malformed or unexpected API response received by the frontend, diagnostic information should be provided to help identify the root cause
**Validates: Requirements 4.3**

**Property 10: Debug Mode Enhancement**
*For any* system operation when debugging mode is enabled, additional diagnostic information should be included in responses and logs
**Validates: Requirements 4.5**

**Property 11: Network Resilience**
*For any* network-related failure affecting the HTTP API, the system should implement appropriate timeout and retry mechanisms with proper error reporting
**Validates: Requirements 6.3**

## Error Handling

### 1. API Endpoint Error Handling

**Error Categories:**
- **400 Bad Request**: Invalid parameters, malformed requests
- **403 Forbidden**: Permission denied, access restrictions
- **404 Not Found**: Folder/resource not found
- **500 Internal Server Error**: Unexpected system errors

**Error Response Format:**
```rust
#[derive(Serialize)]
struct ApiErrorResponse {
    error: String,           // Human-readable error message
    code: String,           // Machine-readable error code
    details: Option<String>, // Additional diagnostic information
    request_id: Option<String>, // For debugging/tracing
}
```

### 2. Frontend Error Handling

**Error Detection Strategy:**
1. **HTTP Status Check**: Verify response.ok before parsing
2. **Content-Type Validation**: Ensure response is JSON, not HTML
3. **JSON Parse Protection**: Catch parsing errors and provide diagnostics
4. **Fallback Detection**: Identify when SPA fallback was served instead of API

**Error Recovery Actions:**
- Retry with exponential backoff for network errors
- Fall back to default images for folder access errors
- Display user-friendly error messages with actionable guidance
- Log detailed error information for debugging

### 3. Server-Side Error Handling

**Route Error Handling:**
```rust
async fn list_images_with_error_handling(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<String>>, (StatusCode, Json<ApiErrorResponse>)> {
    // Implementation with comprehensive error handling
}
```

**Logging Strategy:**
- Request/response logging for all image API calls
- Error context preservation (request parameters, user agent, etc.)
- Performance metrics (response times, folder scan durations)
- SPA fallback trigger detection and logging

### 4. Resource Resolution Error Handling

**Resource Path Validation:**
- Verify `$RESOURCES/` prefix resolution works correctly
- Handle missing bundled resources gracefully
- Provide clear error messages for resource access failures

**File System Error Handling:**
- Permission denied errors → 403 with clear message
- Path not found errors → 404 with path information
- I/O errors → 500 with sanitized error details

## Testing Strategy

### Dual Testing Approach

The testing strategy employs both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests:**
- Focus on specific examples and edge cases
- Test integration points between HTTP API and Tauri commands
- Verify error conditions and boundary cases
- Test resource path resolution with known inputs

**Property-Based Tests:**
- Verify universal properties across all inputs using QuickCheck for Rust and fast-check for TypeScript
- Generate random folder structures and verify consistent API behavior
- Test error handling across all possible failure modes
- Validate cross-platform consistency with generated test data

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: **Feature: photo-slideshow-production-fix, Property {number}: {property_text}**

**Testing Libraries:**
- **Rust Backend**: QuickCheck for property-based testing, standard test framework for unit tests
- **TypeScript Frontend**: fast-check for property-based testing, Vitest for unit tests
- **Integration**: Custom test harness to verify HTTP API and Tauri command parity

### Test Coverage Areas

1. **API Endpoint Testing**
   - Valid folder paths with various file types
   - Invalid parameters and malformed requests
   - Permission and access errors
   - Resource path resolution

2. **Frontend Integration Testing**
   - Environment detection logic
   - Error response parsing and handling
   - Fallback behavior verification
   - Cross-platform consistency

3. **Error Handling Testing**
   - JSON vs HTML response detection
   - Error message clarity and actionability
   - Logging completeness and accuracy
   - Recovery mechanism effectiveness

4. **Performance Testing**
   - Large folder scanning performance
   - Concurrent request handling
   - Memory usage during operations
   - Network timeout and retry behavior