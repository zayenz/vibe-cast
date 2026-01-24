# Requirements Document

## Introduction

This specification addresses a critical production bug in the VibeCast photo slideshow feature that affects Windows production builds. The issue manifests as a JSON parsing error when the `/api/images/list` endpoint fails and the server falls back to serving HTML instead of the expected JSON response.

## Glossary

- **Photo_Slideshow**: The visualization plugin that displays images from folders
- **API_Endpoint**: The `/api/images/list` HTTP endpoint for retrieving image lists
- **Production_Build**: The compiled Windows application running in production mode
- **SPA_Fallback**: Server behavior that serves index.html when API routes fail
- **Resource_Path**: Paths prefixed with `$RESOURCES/` that reference bundled application resources
- **Image_List**: JSON array containing file paths to displayable images

## Requirements

### Requirement 1: API Endpoint Reliability

**User Story:** As a VibeCast user on Windows production builds, I want the photo slideshow to load images reliably, so that the visualization works consistently across all platforms.

#### Acceptance Criteria

1. WHEN the `/api/images/list` endpoint is called with a valid folder path, THE API_Endpoint SHALL return a JSON array of image file paths
2. WHEN the API endpoint encounters an error, THE API_Endpoint SHALL return a proper HTTP error status with JSON error response instead of falling back to HTML
3. WHEN processing `$RESOURCES/` prefixed paths, THE API_Endpoint SHALL resolve them to the correct bundled resource location
4. WHEN the endpoint receives invalid parameters, THE API_Endpoint SHALL return a 400 status with descriptive JSON error message
5. WHEN the target folder does not exist or is inaccessible, THE API_Endpoint SHALL return a 404 status with JSON error response

### Requirement 2: Default Photo Loading

**User Story:** As a VibeCast user, I want the default kitten photos to load automatically when no custom folder is selected, so that the slideshow works out of the box.

#### Acceptance Criteria

1. WHEN no folder is specified or folder selection fails, THE Photo_Slideshow SHALL load images from `$RESOURCES/kittens`
2. WHEN the `$RESOURCES/kittens` folder is accessed, THE System SHALL return the bundled kitten image files
3. WHEN default photos are loaded successfully, THE Photo_Slideshow SHALL display them in the visualization
4. WHEN default photo loading fails, THE System SHALL provide a clear error message indicating the fallback failure

### Requirement 3: Custom Folder Support

**User Story:** As a VibeCast user, I want to select custom folders for the photo slideshow, so that I can display my own images.

#### Acceptance Criteria

1. WHEN a user selects a custom folder path, THE System SHALL validate the folder exists and is accessible
2. WHEN a valid custom folder is provided, THE API_Endpoint SHALL scan for supported image file types
3. WHEN custom folder scanning completes, THE System SHALL return all found image paths as a JSON array
4. WHEN a custom folder contains no images, THE System SHALL return an empty JSON array with appropriate status
5. WHEN custom folder access is denied, THE System SHALL return a 403 status with JSON error response

### Requirement 4: Error Handling and Diagnostics

**User Story:** As a developer debugging production issues, I want clear error messages and proper HTTP status codes, so that I can quickly identify and resolve problems.

#### Acceptance Criteria

1. WHEN any API error occurs, THE System SHALL log detailed error information including request parameters and failure reason
2. WHEN returning error responses, THE API_Endpoint SHALL use appropriate HTTP status codes (400, 403, 404, 500)
3. WHEN JSON parsing fails on the frontend, THE System SHALL provide diagnostic information about the received response
4. WHEN the SPA fallback is triggered, THE System SHALL log why the API route was not matched
5. WHEN debugging mode is enabled, THE System SHALL provide additional diagnostic information in responses

### Requirement 5: Cross-Platform Consistency

**User Story:** As a VibeCast user, I want the photo slideshow to work identically across all platforms, so that I have a consistent experience regardless of my operating system.

#### Acceptance Criteria

1. WHEN running on Windows production builds, THE Photo_Slideshow SHALL behave identically to macOS builds
2. WHEN using the HTTP API path, THE System SHALL provide the same functionality as the Tauri invoke path
3. WHEN path resolution occurs, THE System SHALL handle both absolute and relative paths consistently across platforms
4. WHEN resource bundling differs between platforms, THE System SHALL abstract these differences from the user interface
5. WHEN switching between desktop and web remote interfaces, THE Photo_Slideshow SHALL maintain consistent behavior

### Requirement 6: Performance and Reliability

**User Story:** As a VibeCast user, I want the photo slideshow to load quickly and reliably, so that it doesn't interrupt my visualization experience.

#### Acceptance Criteria

1. WHEN scanning large folders, THE System SHALL complete image listing within 5 seconds for folders containing up to 1000 images
2. WHEN multiple concurrent requests occur, THE API_Endpoint SHALL handle them without degrading performance
3. WHEN network issues affect the HTTP API, THE System SHALL implement appropriate timeout and retry mechanisms
4. WHEN memory usage is high, THE System SHALL efficiently manage image path listings without excessive memory allocation
5. WHEN the application starts, THE Photo_Slideshow SHALL be ready to load default images within 2 seconds