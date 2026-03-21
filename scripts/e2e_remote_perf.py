#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "matplotlib",
# ]
# ///

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import math
import os
import pathlib
import platform
import shutil
import socket
import statistics
import subprocess
import sys
import time
from typing import Any


SCRIPT_PATH = pathlib.Path(__file__).resolve()
TERMINAL_STATUSES = {"ok", "failed", "error", "timeout"}


def log(message: str) -> None:
    print(message, flush=True)


def iso_utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sanitize_run_id(value: str) -> str:
    clean = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in value)
    while "--" in clean:
        clean = clean.replace("--", "-")
    clean = clean.strip("-")
    if not clean:
        raise ValueError("run id cannot be empty")
    return clean


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    sorted_values = sorted(values)
    rank = (len(sorted_values) - 1) * pct
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return sorted_values[int(rank)]
    weight = rank - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


@dataclasses.dataclass(frozen=True)
class RunLayout:
    root: pathlib.Path
    runs: pathlib.Path
    analysis: pathlib.Path
    reports: pathlib.Path
    plots: pathlib.Path


@dataclasses.dataclass(frozen=True)
class BenchmarkCase:
    run_id: str
    command: list[str]
    env: dict[str, str]
    dimensions: dict[str, Any]


def resolve_repo_root(args: argparse.Namespace) -> pathlib.Path:
    if args.repo_root:
        return pathlib.Path(args.repo_root).expanduser().resolve()
    return SCRIPT_PATH.parent.parent


def resolve_results_root(args: argparse.Namespace, repo_root: pathlib.Path) -> pathlib.Path:
    if args.results_root:
        return pathlib.Path(args.results_root).expanduser().resolve()
    return repo_root / "results"


def run_layout(name: str, results_root: pathlib.Path) -> RunLayout:
    root = results_root / name
    return RunLayout(
        root=root,
        runs=root / "runs",
        analysis=root / "analysis",
        reports=root / "reports",
        plots=root / "plots",
    )


def ensure_layout(layout: RunLayout) -> None:
    for path in (layout.root, layout.runs, layout.analysis, layout.reports, layout.plots):
        path.mkdir(parents=True, exist_ok=True)


def write_json(path: pathlib.Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def maybe_read_json(path: pathlib.Path) -> Any | None:
    if not path.exists():
        return None
    try:
        return read_json(path)
    except Exception:
        return None


def completed_run(path: pathlib.Path) -> bool:
    payload = maybe_read_json(path)
    return bool(payload and payload.get("status") in TERMINAL_STATUSES)


def parse_csv_ints(raw: str) -> list[int]:
    values: list[int] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        values.append(int(item))
    if not values:
        raise ValueError("expected at least one integer value")
    return values


def parse_csv_strings(raw: str) -> list[str]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    if not values:
        raise ValueError("expected at least one value")
    return values


def detect_time_prefix() -> list[str]:
    if shutil.which("gtime"):
        return ["gtime", "-v"]
    if pathlib.Path("/usr/bin/time").exists():
        return ["/usr/bin/time", "-l"]
    return []


def parse_peak_memory_kib(stderr_text: str) -> float | None:
    for line in stderr_text.splitlines():
        if "maximum resident set size" in line.lower():
            parts = line.split(":")
            if len(parts) != 2:
                continue
            try:
                return float(parts[1].strip()) / 1024.0
            except ValueError:
                return None
    return None


def repo_context(repo_root: pathlib.Path) -> dict[str, Any]:
    evidence: list[str] = []
    if (repo_root / "package.json").exists():
        evidence.append("package.json present")
    if (repo_root / "src-tauri" / "Cargo.toml").exists():
        evidence.append("src-tauri/Cargo.toml present")
    return {
        "project_type": "mixed tauri/react",
        "evidence": evidence,
        "benchmark_axes": ["project", "message_count", "text_bytes", "repeat"],
        "report_recommendations": [
            "startup latency summary",
            "payload-size scaling summary",
            "browser comparison",
        ],
    }


def build_cases(args: argparse.Namespace, repo_root: pathlib.Path, layout: RunLayout) -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []
    for project in args.projects:
        for message_count in args.message_counts:
            for repeat_index in range(1, args.repeats + 1):
                run_id = sanitize_run_id(
                    f"{project}-cold-start-msg{message_count}-txt{args.message_text_bytes}-rep{repeat_index}"
                )
                playwright_output = layout.runs / f"{run_id}-playwright"
                command = [
                    "npx",
                    "playwright",
                    "test",
                    "--config",
                    "playwright.config.ts",
                    "--project",
                    project,
                    "--grep",
                    "cold-start remote hydration",
                    "--output",
                    str(playwright_output),
                    "--reporter",
                    "line",
                ]
                env = {
                    "VIBECAST_E2E_MESSAGE_COUNT": str(message_count),
                    "VIBECAST_E2E_MESSAGE_TEXT_BYTES": str(args.message_text_bytes),
                    "VIBECAST_E2E_PRESET_COUNT": str(args.preset_count),
                    "VIBECAST_E2E_MAX_FIRST_USABLE_MS": str(args.budget_ms),
                    "VIBECAST_E2E_SKIP_AUDIO": "1",
                }
                cases.append(
                    BenchmarkCase(
                        run_id=run_id,
                        command=command,
                        env=env,
                        dimensions={
                            "project": project,
                            "message_count": message_count,
                            "message_text_bytes": args.message_text_bytes,
                            "preset_count": args.preset_count,
                            "repeat": repeat_index,
                        },
                    )
                )
    return cases


def find_single_artifact(root: pathlib.Path, name: str) -> pathlib.Path | None:
    matches = sorted(root.glob(f"**/{name}"))
    return matches[0] if matches else None


def parse_probe_metrics(probe_events: list[dict[str, Any]]) -> dict[str, Any]:
    remote_usability: dict[str, dict[str, Any]] = {}
    bootstrap_served: list[dict[str, Any]] = []
    sse_open_payloads: dict[str, dict[str, Any]] = {}

    for event in probe_events:
        event_type = event.get("eventType")
        client_id = event.get("clientId")
        payload = event.get("payload") or {}
        if event_type == "remote_first_usable_render" and isinstance(client_id, str):
            remote_usability[client_id] = payload
        elif event_type == "remote_sse_open" and isinstance(client_id, str):
            sse_open_payloads[client_id] = payload
        elif event_type == "server_remote_bootstrap_served":
            bootstrap_served.append(payload)

    first_usable_values = [
        float(payload["firstUsableRenderMs"])
        for payload in remote_usability.values()
        if isinstance(payload.get("firstUsableRenderMs"), (int, float))
    ]
    bootstrap_values = [
        float(payload["bootstrapLatencyMs"])
        for payload in remote_usability.values()
        if isinstance(payload.get("bootstrapLatencyMs"), (int, float))
    ]
    sse_values = [
        float(payload["sseOpenLatencyMs"])
        for payload in sse_open_payloads.values()
        if isinstance(payload.get("sseOpenLatencyMs"), (int, float))
    ]
    payload_bytes_values = [
        float(payload["payloadBytes"])
        for payload in remote_usability.values()
        if isinstance(payload.get("payloadBytes"), (int, float))
    ]
    serialize_values = [
        float(payload["serializeMs"])
        for payload in remote_usability.values()
        if isinstance(payload.get("serializeMs"), (int, float))
    ]
    server_payload_values = [
        float(payload["payloadBytes"])
        for payload in bootstrap_served
        if isinstance(payload.get("payloadBytes"), (int, float))
    ]
    server_serialize_values = [
        float(payload["serializeMs"])
        for payload in bootstrap_served
        if isinstance(payload.get("serializeMs"), (int, float))
    ]

    return {
        "clients": remote_usability,
        "first_usable_ms": first_usable_values,
        "bootstrap_latency_ms": bootstrap_values,
        "sse_open_latency_ms": sse_values,
        "client_payload_bytes": payload_bytes_values,
        "client_serialize_ms": serialize_values,
        "server_payload_bytes": server_payload_values,
        "server_serialize_ms": server_serialize_values,
    }


def execute_case(case: BenchmarkCase, repo_root: pathlib.Path, layout: RunLayout) -> dict[str, Any]:
    run_json = layout.runs / f"{case.run_id}.json"
    stdout_path = layout.runs / f"{case.run_id}.stdout"
    stderr_path = layout.runs / f"{case.run_id}.stderr"
    playwright_output = layout.runs / f"{case.run_id}-playwright"

    if run_json.exists():
        run_json.unlink()
    if stdout_path.exists():
        stdout_path.unlink()
    if stderr_path.exists():
        stderr_path.unlink()
    if playwright_output.exists():
        shutil.rmtree(playwright_output)

    env = os.environ.copy()
    env.update(case.env)
    time_prefix = detect_time_prefix()
    command = [*time_prefix, *case.command]

    start = time.perf_counter()
    result = subprocess.run(
        command,
        cwd=repo_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    elapsed_sec = time.perf_counter() - start

    stdout_path.write_text(result.stdout, encoding="utf-8")
    stderr_path.write_text(result.stderr, encoding="utf-8")

    probe_path = find_single_artifact(playwright_output, "probe-events.json")
    summary_path = find_single_artifact(playwright_output, "session-summary.json")
    probe_events = read_json(probe_path) if probe_path else []
    session_summary = read_json(summary_path) if summary_path else None
    metrics = parse_probe_metrics(probe_events)

    status = "ok" if result.returncode == 0 else "failed"
    payload = {
        "run_id": case.run_id,
        "dimensions": case.dimensions,
        "command": command,
        "return_code": result.returncode,
        "status": status,
        "elapsed_sec": elapsed_sec,
        "peak_memory_kib": parse_peak_memory_kib(result.stderr),
        "stdout_path": str(stdout_path.relative_to(layout.root)),
        "stderr_path": str(stderr_path.relative_to(layout.root)),
        "playwright_output": str(playwright_output.relative_to(layout.root)),
        "probe_events_path": str(probe_path.relative_to(layout.root)) if probe_path else None,
        "session_summary_path": str(summary_path.relative_to(layout.root)) if summary_path else None,
        "metrics": metrics,
        "session_summary": session_summary,
        "provenance": {
            "timestamp": iso_utc_now(),
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
            "python": sys.version,
            "time_prefix": time_prefix,
        },
    }
    write_json(run_json, payload)
    return payload


def summarize_runs(run_payloads: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for payload in run_payloads:
      dims = payload["dimensions"]
      key = f'{dims["project"]}|{dims["message_count"]}'
      grouped.setdefault(key, []).append(payload)

    groups: list[dict[str, Any]] = []
    for key, payloads in sorted(grouped.items()):
        first_usable: list[float] = []
        bootstrap: list[float] = []
        sse_open: list[float] = []
        client_payload_bytes: list[float] = []
        server_payload_bytes: list[float] = []
        server_serialize_ms: list[float] = []
        elapsed: list[float] = []
        status_counts: dict[str, int] = {}

        for payload in payloads:
            status = str(payload["status"])
            status_counts[status] = status_counts.get(status, 0) + 1
            elapsed.append(float(payload["elapsed_sec"]))
            metrics = payload.get("metrics") or {}
            first_usable.extend(float(v) for v in metrics.get("first_usable_ms", []))
            bootstrap.extend(float(v) for v in metrics.get("bootstrap_latency_ms", []))
            sse_open.extend(float(v) for v in metrics.get("sse_open_latency_ms", []))
            client_payload_bytes.extend(float(v) for v in metrics.get("client_payload_bytes", []))
            server_payload_bytes.extend(float(v) for v in metrics.get("server_payload_bytes", []))
            server_serialize_ms.extend(float(v) for v in metrics.get("server_serialize_ms", []))

        dims = payloads[0]["dimensions"]
        groups.append(
            {
                "project": dims["project"],
                "message_count": dims["message_count"],
                "repeats": len(payloads),
                "status_counts": status_counts,
                "elapsed_sec": {
                    "avg": average(elapsed),
                    "p50": percentile(elapsed, 0.5),
                    "p95": percentile(elapsed, 0.95),
                    "max": max(elapsed) if elapsed else None,
                },
                "first_usable_ms": {
                    "avg": average(first_usable),
                    "p50": percentile(first_usable, 0.5),
                    "p95": percentile(first_usable, 0.95),
                    "max": max(first_usable) if first_usable else None,
                },
                "bootstrap_latency_ms": {
                    "avg": average(bootstrap),
                    "p50": percentile(bootstrap, 0.5),
                    "p95": percentile(bootstrap, 0.95),
                    "max": max(bootstrap) if bootstrap else None,
                },
                "sse_open_latency_ms": {
                    "avg": average(sse_open),
                    "p50": percentile(sse_open, 0.5),
                    "p95": percentile(sse_open, 0.95),
                    "max": max(sse_open) if sse_open else None,
                },
                "payload_bytes": {
                    "client_avg": average(client_payload_bytes),
                    "client_max": max(client_payload_bytes) if client_payload_bytes else None,
                    "server_avg": average(server_payload_bytes),
                    "server_max": max(server_payload_bytes) if server_payload_bytes else None,
                },
                "server_serialize_ms": {
                    "avg": average(server_serialize_ms),
                    "p50": percentile(server_serialize_ms, 0.5),
                    "p95": percentile(server_serialize_ms, 0.95),
                    "max": max(server_serialize_ms) if server_serialize_ms else None,
                },
            }
        )

    return {
        "generated_at": iso_utc_now(),
        "total_runs": len(run_payloads),
        "groups": groups,
    }


def format_metric(value: float | None, suffix: str) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}{suffix}"


def run_command(args: argparse.Namespace) -> None:
    repo_root = resolve_repo_root(args)
    results_root = resolve_results_root(args, repo_root)
    name = args.name
    layout = run_layout(name, results_root)
    ensure_layout(layout)

    cases = build_cases(args, repo_root, layout)
    if args.limit is not None:
        cases = cases[: args.limit]

    write_json(
        layout.analysis / "plan.json",
        {
            "generated_at": iso_utc_now(),
            "repo_root": str(repo_root),
            "results_root": str(results_root),
            "repo_context": repo_context(repo_root),
            "cases": [dataclasses.asdict(case) for case in cases],
        },
    )

    for case in cases:
        run_json = layout.runs / f"{case.run_id}.json"
        if not args.force and completed_run(run_json):
            log(f"skip {case.run_id}")
            continue
        if args.dry_run:
            log(f"plan {case.run_id}: {' '.join(case.command)}")
            continue
        log(f"run {case.run_id}")
        payload = execute_case(case, repo_root, layout)
        log(
            "  status={status} elapsed={elapsed:.2f}s first-usable-p50={first_usable}".format(
                status=payload["status"],
                elapsed=float(payload["elapsed_sec"]),
                first_usable=format_metric(
                    percentile(payload["metrics"].get("first_usable_ms", []), 0.5),
                    "ms",
                ),
            )
        )


def analyze_command(args: argparse.Namespace) -> None:
    repo_root = resolve_repo_root(args)
    results_root = resolve_results_root(args, repo_root)
    layout = run_layout(args.name, results_root)
    run_payloads = [read_json(path) for path in sorted(layout.runs.glob("*.json"))]
    summary = summarize_runs(run_payloads)
    summary["repo_context"] = repo_context(repo_root)
    write_json(layout.analysis / "summary.json", summary)
    log(f"wrote {layout.analysis / 'summary.json'}")


def report_command(args: argparse.Namespace) -> None:
    repo_root = resolve_repo_root(args)
    results_root = resolve_results_root(args, repo_root)
    layout = run_layout(args.name, results_root)
    summary = read_json(layout.analysis / "summary.json")

    lines = [
        f"# Remote E2E Performance Report: {args.name}",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Total runs: {summary['total_runs']}",
        f"- Repo: `{repo_root}`",
        "",
        "## Groups",
        "",
        "| Project | Messages | Repeats | First usable p50 | First usable p95 | Bootstrap p50 | Server payload avg | Run elapsed avg |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for group in summary["groups"]:
        lines.append(
            "| {project} | {message_count} | {repeats} | {first_p50} | {first_p95} | {boot_p50} | {payload_avg} | {elapsed_avg} |".format(
                project=group["project"],
                message_count=group["message_count"],
                repeats=group["repeats"],
                first_p50=format_metric(group["first_usable_ms"]["p50"], "ms"),
                first_p95=format_metric(group["first_usable_ms"]["p95"], "ms"),
                boot_p50=format_metric(group["bootstrap_latency_ms"]["p50"], "ms"),
                payload_avg=format_metric(group["payload_bytes"]["server_avg"], "B"),
                elapsed_avg=format_metric(group["elapsed_sec"]["avg"], "s"),
            )
        )

    report_path = layout.reports / "summary.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log(f"wrote {report_path}")


def plot_command(args: argparse.Namespace) -> None:
    import matplotlib.pyplot as plt

    repo_root = resolve_repo_root(args)
    results_root = resolve_results_root(args, repo_root)
    layout = run_layout(args.name, results_root)
    summary = read_json(layout.analysis / "summary.json")

    grouped: dict[str, list[dict[str, Any]]] = {}
    for group in summary["groups"]:
        grouped.setdefault(group["project"], []).append(group)

    fig, ax = plt.subplots(figsize=(8, 5))
    for project, groups in sorted(grouped.items()):
        groups = sorted(groups, key=lambda item: item["message_count"])
        xs = [group["message_count"] for group in groups]
        ys = [group["first_usable_ms"]["p50"] or 0.0 for group in groups]
        ax.plot(xs, ys, marker="o", label=project)

    ax.set_title("Remote cold-start p50 by message count")
    ax.set_xlabel("Message count")
    ax.set_ylabel("First usable render (ms)")
    ax.grid(True, alpha=0.3)
    ax.legend()

    png_path = layout.plots / "first-usable-p50.png"
    svg_path = layout.plots / "first-usable-p50.svg"
    fig.tight_layout()
    fig.savefig(png_path, dpi=200)
    fig.savefig(svg_path)
    log(f"wrote {png_path}")
    log(f"wrote {svg_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark Vibe Cast remote cold-start performance via Playwright.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--name", required=True)
        subparser.add_argument("--repo-root")
        subparser.add_argument("--results-root")

    run_parser = subparsers.add_parser("run")
    add_common(run_parser)
    run_parser.add_argument("--projects", type=parse_csv_strings, default=["matrix"])
    run_parser.add_argument("--message-counts", type=parse_csv_ints, default=[180, 1000, 5000])
    run_parser.add_argument("--repeats", type=int, default=3)
    run_parser.add_argument("--message-text-bytes", type=int, default=256)
    run_parser.add_argument("--preset-count", type=int, default=20)
    run_parser.add_argument("--budget-ms", type=int, default=12_000)
    run_parser.add_argument("--limit", type=int)
    run_parser.add_argument("--force", action="store_true")
    run_parser.add_argument("--dry-run", action="store_true")

    analyze_parser = subparsers.add_parser("analyze")
    add_common(analyze_parser)

    report_parser = subparsers.add_parser("report")
    add_common(report_parser)

    plot_parser = subparsers.add_parser("plot")
    add_common(plot_parser)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "run":
        run_command(args)
    elif args.command == "analyze":
        analyze_command(args)
    elif args.command == "report":
        report_command(args)
    elif args.command == "plot":
        plot_command(args)
    else:
        parser.error(f"unsupported command {args.command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
