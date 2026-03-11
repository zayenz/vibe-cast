# T5 (P1): Event Ordering + Channel Ownership Contracts

## Objective

Define deterministic event semantics across SSE and Tauri channels and remove race-prone dual authority.

## Problem Context

The same logical action can emit:
1. SSE state event
2. SSE command event
3. Tauri state/control events

Without ordering contracts, clients can apply stale overrides or conflicting updates.

## Primary File Locations

1. `src-tauri/crates/server/src/lib.rs`
2. `src-tauri/crates/app/src/lib.rs`
3. `src-tauri/crates/models/src/lib.rs`
4. `src/hooks/useAppState.ts`
5. `src/components/ControlPlane.tsx`
6. `src/components/VisualizerWindow.tsx`
7. `docs/ARCHITECTURE.md`

## Implementation Strategy

## Phase 1: Define contract

1. Establish one authoritative state channel per client:
   - Control Plane + Remote: SSE state stream authoritative.
   - Visualizer: Tauri event stream authoritative for hot path.
2. Define use of command events as transient hints only, never source of truth.

## Phase 2: Add sequence metadata

1. Add `eventSequence` and `stateVersion` in event envelopes.
2. Emit sequence from a single monotonic counter per process.

## Phase 3: Client reconciliation logic

1. Apply only newer sequence/version events.
2. Remove or narrow local playback override patterns that can outlive canonical state.

## Phase 4: Documentation update

1. Update `docs/ARCHITECTURE.md` with explicit ordering and ownership matrix.
2. Add troubleshooting section for desync incidents.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Frontend unit tests:
   - out-of-order event sequence does not regress UI state.
2. Rust tests:
   - emitted sequences are monotonic.
3. Integration tests:
   - start/stop playback from different clients stays consistent.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
node scripts/e2e_flow_test.mjs
```

## Acceptance Criteria

1. Channel ownership is explicit and enforced in code.
2. Out-of-order events do not produce stale UI.
3. Docs describe exact ordering and merge strategy.

## Risks and Notes

1. Event envelope changes may require updating existing tests and mocks.
2. Temporary compatibility adapter may be needed during migration.
