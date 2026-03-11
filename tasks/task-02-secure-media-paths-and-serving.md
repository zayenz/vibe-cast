# T2 (P0): Secure Media File Serving Boundaries

## Objective

Prevent arbitrary filesystem reads through media APIs while preserving slideshow/media functionality.

## Problem Context

`/api/images/serve` currently accepts a path and reads it directly. This allows access outside intended media folders.

## Key Findings

1. Path traversal and unrestricted absolute path reads are possible.
2. `list_images` and `serve_image` trust user-provided path inputs too much.
3. Security comment exists but enforcement is intentionally permissive.

## Primary File Locations

1. `src-tauri/crates/server/src/lib.rs`
2. `src-tauri/crates/app/src/lib.rs`
3. `src/plugins/visualizations/hooks/usePhotoSlideshow.ts`
4. `src/plugins/visualizations/PhotoSlideshowPlugin.tsx`

## Implementation Strategy

## Phase 1: Introduce canonical path guard

1. Add utility:
   - canonicalize candidate path
   - canonicalize allowed roots
   - verify candidate is within one allowed root
2. Allowed roots:
   - `config_base_path` (if set)
   - resources directory resolved from Tauri
   - optional explicit media root config

## Phase 2: Harden endpoints

1. In `list_images`, reject folders outside allowed roots.
2. In `serve_image`, reject `path` outside allowed roots.
3. Return structured `403`/`400` errors with `ApiErrorResponse`.

## Phase 3: Remove direct raw path passing where possible

1. Prefer serving by opaque id or relative path rooted at an approved directory.
2. If full migration is too large, keep compatibility path with strict guard.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Rust tests for `serve_image` and `list_images`:
   - reject `/etc/passwd` style absolute paths.
   - reject `../` traversal.
   - accept valid files under allowed roots.
2. Frontend tests:
   - slideshow still loads allowed assets successfully.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

## Acceptance Criteria

1. APIs cannot read files outside configured allowed directories.
2. Slideshow/media features continue functioning for valid paths.
3. Security errors are deterministic and structured.

## Risks and Notes

1. Symlink handling must be validated with canonical path checks.
2. Windows path normalization needs explicit test coverage.
