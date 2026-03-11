# T4 (P1): Atomic State Snapshot + Monotonic State Version

## Objective

Guarantee snapshot consistency and provide ordering metadata for all state updates.

## Problem Context

`get_state()` acquires many independent mutexes. The resulting broadcast can represent mixed-time state. Clients also lack a strict version to compare updates.

## Primary File Locations

1. `src-tauri/crates/state/src/lib.rs`
2. `src-tauri/crates/models/src/lib.rs`
3. `src-tauri/crates/server/src/lib.rs`
4. `src/hooks/useAppState.ts`
5. `src/components/ControlPlane.tsx`
6. `src/components/VisualizerWindow.tsx`

## Implementation Strategy

## Phase 1: Add state version

1. Extend `BroadcastState` with `stateVersion: u64`.
2. Increment version on every successful mutation before broadcast.
3. Include version in all relevant Tauri event payloads as metadata.

## Phase 2: Improve snapshot consistency

1. Preferred: refactor to single `RwLock<AppState>` and snapshot under one lock.
2. Minimum viable step:
   - guard reads with a snapshot struct and lock ordering discipline.
   - remove nested lock patterns where possible.

## Phase 3: Client-side stale update protection

1. In `useAppState`, drop state events older than last applied `stateVersion`.
2. In Control Plane/Visualizer overrides, reconcile only if incoming version is newer.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Rust tests:
   - `stateVersion` increases monotonically.
   - every mutation emits versioned state.
2. Frontend tests:
   - stale state event ignored.
   - newer state supersedes local overrides.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

## Acceptance Criteria

1. Every state payload includes `stateVersion`.
2. Clients never regress to older state due to out-of-order events.
3. Snapshot inconsistency class is materially reduced or eliminated.

## Risks and Notes

1. Full lock-model refactor is invasive; do in isolated commits.
2. Backward compatibility needed for any consumers expecting old schema.
