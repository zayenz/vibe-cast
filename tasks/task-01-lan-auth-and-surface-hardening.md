# T1 (P0): LAN Auth + Network Surface Hardening

## Objective

Ensure remote control is explicitly authorized and that network exposure is minimized by default.

## Problem Context

Current server behavior allows broad LAN access without authentication and permissive CORS. This makes command APIs and SSE endpoints reachable by any device on the network.

## Key Findings

1. Server binds to broad interfaces and scans a port range.
2. CORS is set to permissive.
3. No auth check on `/api/command` or `/api/events`.

## Primary File Locations

1. `src-tauri/crates/server/src/lib.rs`
2. `src-tauri/crates/app/src/lib.rs`
3. `src/hooks/useAppState.ts`
4. `src/components/RemoteControl.tsx`
5. `src/components/ControlPlane.tsx`
6. `src-tauri/crates/state/src/lib.rs`

## Implementation Strategy

## Phase 1: Introduce auth model

1. Add `remote_auth_token` and `lan_mode_enabled` to shared state.
2. Generate token at startup (cryptographically random; URL-safe string).
3. Expose token and mode from `get_server_info`.
4. Add a server helper that validates token from either:
   - `Authorization: Bearer <token>`, or
   - query/header fallback for SSE (`token` query param if needed).

## Phase 2: Enforce auth on network routes

1. Require token for:
   - `POST /api/command`
   - `GET /api/events`
   - `GET /api/state` (if still used externally)
2. Keep local Tauri IPC commands authenticated by process trust boundary.
3. Return structured `401` via existing `ApiErrorResponse`.

## Phase 3: Restrict network surface defaults

1. Default bind to loopback (`127.0.0.1`) unless `lan_mode_enabled=true`.
2. Restrict CORS:
   - allowed origins only for known local/paired origins.
   - disallow `very_permissive`.
3. Add explicit config switch (env/config flag) to enable LAN mode.

## Phase 4: Wire token into clients

1. Pass token from Control Plane to Remote link/QR.
2. Include token in client request helper and `useAppState` SSE URL.
3. Handle token expiry/startup mismatch with reconnect + clear error messaging.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

## Task-Specific Test Automation to Add

1. Rust integration tests in `src-tauri/crates/server`:
   - unauthorized `/api/command` returns `401`
   - authorized `/api/command` returns `200`
   - unauthorized SSE rejected
   - authorized SSE emits initial state
2. Frontend tests:
   - `useAppState` includes token in SSE connect URL.
   - command sender includes `Authorization` header.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
node scripts/e2e_flow_test.mjs
```

## Acceptance Criteria

1. Unauthenticated remote requests cannot mutate state.
2. SSE does not stream without valid token.
3. Default startup is local-only unless explicitly configured for LAN.
4. Remote pairing/link includes working token and control still functions.

## Risks and Notes

1. SSE auth may require query token support due to browser EventSource header limits.
2. Token rotation policy must avoid breaking active sessions unexpectedly.
