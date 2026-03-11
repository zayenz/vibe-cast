# T7 (P3): Typed State Schema + Validation Boundary (Rust + Zod Frontend)

## Objective

Reduce runtime schema ambiguity by replacing untyped JSON blobs with typed models and validation at API boundaries, using `zod` on the frontend.

## Problem Context

Core fields such as settings and stats are represented as loose `serde_json::Value`. This weakens compile-time safety and complicates migrations.

## Primary File Locations

1. `src-tauri/crates/models/src/lib.rs`
2. `src-tauri/crates/state/src/lib.rs`
3. `src-tauri/crates/server/src/lib.rs`
4. `src/hooks/useAppState.ts`
5. `src/plugins/types.ts`
6. `docs/ARCHITECTURE.md`
7. `package.json`

## Implementation Strategy

## Phase 1: Define typed models

1. Add typed Rust structs for:
   - message stats
   - text style settings map
   - visualization settings map (or typed union by plugin id)
2. Keep serde compatibility with old payload fields where needed.

## Phase 2: Validate at command boundary

1. Parse incoming payloads into typed command structs.
2. Reject invalid schema with explicit `400` and machine-readable errors.

## Phase 3: Align frontend types

1. Update TS interfaces to match backend schema.
2. Introduce `zod` schemas for inbound state and command payloads.
3. Infer TypeScript types from `zod` schemas where practical (`z.infer`), and reduce ad hoc parsing branches in `useAppState`.
4. Fail closed on invalid payload shapes with explicit logging and safe fallback behavior.

## Phase 4: Migration and compatibility

1. Add compatibility adapter for legacy payload names (snake_case/camelCase mix).
2. Document schema version and deprecation timeline.
3. Keep `zod` transforms for compatibility during migration window, then remove compatibility transforms once deprecated fields are dropped.

## Automation Before Starting

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
```

## Task-Specific Test Automation to Add

1. Rust tests:
   - invalid payload shapes fail with deterministic errors.
   - legacy payloads still parse during transition.
2. Frontend tests:
   - `useAppState` validates with `zod` and rejects malformed payloads safely.
   - `zod` schema tests cover snake_case/camelCase compatibility transforms.
3. Property tests:
   - serialization/deserialization round-trips for key models.

## Verification After Changes

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

## Acceptance Criteria

1. Core state and command payloads are strongly typed.
2. Invalid input is rejected consistently at the boundary.
3. Frontend payload parsing is backed by `zod` schemas (not manual field probing).
4. Frontend and backend types remain aligned with fewer runtime fallbacks.

## Risks and Notes

1. Plugin-specific settings may require a phased typed rollout, not one-shot.
2. Backward compatibility must be explicitly tested to avoid breaking saved configs.
