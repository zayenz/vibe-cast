# T3 (P1): Unify Mutation Path into Canonical Command Processor

## Objective

Eliminate behavior drift by routing all state mutations through a single backend command processor.

## Problem Context

Mutation logic is duplicated across:
1. Axum `handle_command`.
2. Tauri command handlers in app crate (`emit_state_change`, playback commands).

This creates divergence risk and inconsistent side effects.

## Primary File Locations

1. `src-tauri/crates/server/src/lib.rs`
2. `src-tauri/crates/app/src/lib.rs`
3. `src-tauri/crates/state/src/lib.rs`
4. `src-tauri/crates/models/src/lib.rs`
5. `src/components/ControlPlane.tsx`
6. `src/components/VisualizerWindow.tsx`

## Implementation Strategy

## Phase 1: Extract canonical command service

1. Create a single Rust function/module that:
   - validates command
   - mutates state
   - returns deterministic side effects (events to emit, follow-up actions)
2. Move existing `handle_command` branch logic into this service.

## Phase 2: Rewire callers

1. Axum route calls canonical service.
2. Tauri commands call canonical service, not local duplicate mutation branches.
3. Mark legacy command functions deprecated and thin wrappers only.

## Phase 3: Standardize side effects

1. Ensure all side effects are emitted in one place:
   - state broadcast
   - command broadcast
   - tauri event emission
2. Remove duplicate/bypass emit paths where possible.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Rust tests:
   - same input command via Axum and Tauri yields same final state.
   - same emitted event types and payload shape.
2. Integration tests:
   - playback start/stop from control plane and remote remain equivalent.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
node scripts/e2e_flow_test.mjs
```

## Acceptance Criteria

1. There is exactly one mutation implementation per command.
2. Axum and Tauri paths produce equivalent behavior.
3. Playback and folder queue flows remain functional end to end.

## Risks and Notes

1. Large refactor with regression risk around queue/playback transitions.
2. Requires careful parity tests before deleting old branches.
