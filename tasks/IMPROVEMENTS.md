# Vibe Cast Architecture Improvements Backlog

This backlog translates the architecture review findings into execution-ready tasks for coding agents.

## Prioritization

| Priority | Task ID | Title | Why First | Dependency |
|---|---|---|---|---|
| P0 | T1 | LAN Auth + Network Surface Hardening | Prevents unauthorized LAN control and state mutation | None |
| P0 | T2 | Secure Media File Serving Boundaries | Prevents arbitrary file reads via API | T1 recommended first |
| P1 | T3 | Unify Mutation Path into Canonical Command Processor | Reduces divergence and inconsistent behavior | T1, T2 independent |
| P1 | T4 | Atomic State Snapshot + Monotonic State Version | Eliminates inconsistent state snapshots and supports ordering | T3 preferred |
| P1 | T5 | Event Ordering + Channel Ownership Contract | Removes race conditions between SSE and Tauri events | T4 required |
| P2 | T6 | SSE Payload and Broadcast Efficiency | Reduces dropped updates and CPU overhead | T4 preferred |
| P3 | T7 | Typed State Schema + Validation Boundary | Improves maintainability and safer evolution | T3 preferred |

## Task Files

1. `tasks/task-01-lan-auth-and-surface-hardening.md`
2. `tasks/task-02-secure-media-paths-and-serving.md`
3. `tasks/task-03-unify-command-mutation-path.md`
4. `tasks/task-04-state-snapshot-atomicity-and-versioning.md`
5. `tasks/task-05-event-ordering-and-channel-contracts.md`
6. `tasks/task-06-sse-performance-and-payload-optimization.md`
7. `tasks/task-07-typed-state-schema-and-validation.md`

## Standard Automation Baseline

Run this baseline before and after each task unless the task file narrows it further.

```bash
npm run lint
npm test -- --run
cd src-tauri && cargo test --workspace
cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings
```

For task-specific verification, follow each task file exactly.
