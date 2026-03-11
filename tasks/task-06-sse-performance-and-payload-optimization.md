# T6 (P2): SSE Payload and Broadcast Efficiency

## Objective

Reduce CPU/network overhead from full-state broadcasts and lower dropped updates under bursty mutation load.

## Problem Context

Current broadcast approach sends full state on every change. Larger payloads and frequent updates can increase serialization overhead and client lag.

## Primary File Locations

1. `src-tauri/crates/state/src/lib.rs`
2. `src-tauri/crates/server/src/lib.rs`
3. `src/hooks/useAppState.ts`
4. `src/test/mocks/sse.ts`

## Implementation Strategy

## Phase 1: Add lightweight instrumentation

1. Track:
   - serialized state payload size
   - broadcast frequency
   - lag/drop counts
2. Emit metrics only in debug/development mode.

## Phase 2: Coalesce bursts

1. Add short debounce/coalescing window for repeated updates (for non-critical categories).
2. Keep immediate push for critical playback transitions.

## Phase 3: Delta strategy (optional incremental rollout)

1. Introduce selective delta events for large structures (for example message tree/presets).
2. Keep periodic full-state snapshots for recovery.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Rust tests:
   - coalescing preserves final state correctness.
   - critical events are never delayed.
2. Frontend tests:
   - client correctly applies coalesced/full updates.
3. Optional benchmark script:
   - synthetic command burst and measure throughput/latency.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

## Acceptance Criteria

1. Measurable reduction in redundant SSE transmissions under burst load.
2. Playback control responsiveness remains immediate.
3. No regressions in state convergence.

## Risks and Notes

1. Over-coalescing can hide intermediate states required by UI.
2. Delta strategy adds client complexity and migration cost.
