import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import type { TestInfo } from '@playwright/test';
import { browserMatrixForProject, RemoteClient, type RemoteSnapshot } from './remoteClient';

const execFileAsync = promisify(execFile);

export interface ProbeEvent {
  sessionId: string;
  clientId: string;
  clientLabel: string;
  clientKind: string;
  eventType: string;
  ts: number;
  payload: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  status: string;
  eventCount: number;
  clientSnapshots: Record<string, { snapshot: RemoteSnapshot }>;
  serverSnapshot?: RemoteSnapshot;
  perfCounters: Record<string, number>;
}

function appBinaryPath(): string {
  if (process.platform === 'darwin') {
    return path.resolve(
      process.cwd(),
      'src-tauri/target/release/bundle/macos/VibeCast.app/Contents/MacOS/vibe_cast',
    );
  }

  throw new Error(`Unsupported platform for packaged E2E run: ${process.platform}`);
}

async function stopStaleProcesses(): Promise<void> {
  try {
    await execFileAsync('pkill', ['vibe_cast']);
  } catch {
    // ignore
  }

  try {
    await execFileAsync('node', ['scripts/kill-port.mjs', '8080'], { cwd: process.cwd() });
  } catch {
    // ignore
  }
}

async function waitFor<T>(
  predicate: () => Promise<T | null | undefined | false>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function comparableSnapshot(snapshot: RemoteSnapshot | undefined): Record<string, unknown> | null {
  if (!snapshot) {
    return null;
  }

  const { connectionPhase: _connectionPhase, ...rest } = snapshot;
  return rest;
}

export class AppSession {
  readonly baseUrl: string;
  readonly sessionId: string;
  readonly process: ChildProcessWithoutNullStreams;
  readonly logs: string[];
  readonly clients: RemoteClient[] = [];

  private constructor(baseUrl: string, sessionId: string, process: ChildProcessWithoutNullStreams, logs: string[]) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.process = process;
    this.logs = logs;
  }

  static async launch(scenarioName: string): Promise<AppSession> {
    const binaryPath = appBinaryPath();
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Packaged app missing at ${binaryPath}. Run npm run tauri build first.`);
    }

    await stopStaleProcesses();
    const logLines: string[] = [];

    const child = spawn(binaryPath, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VIBECAST_E2E: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.trim()) {
        logLines.push(line);
      }
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.trim()) {
        logLines.push(line);
      }
      process.stderr.write(chunk);
    });

    const port = await waitFor(async () => {
      for (let candidate = 8080; candidate <= 8100; candidate += 1) {
        try {
          const response = await fetch(`http://127.0.0.1:${candidate}/api/status`);
          if (response.ok) {
            return candidate;
          }
        } catch {
          // continue polling
        }
      }
      return null;
    }, 30_000, 500);

    const baseUrl = `http://127.0.0.1:${port}`;
    const response = await fetch(`${baseUrl}/api/e2e/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioName }),
    });
    if (!response.ok) {
      throw new Error(`Failed to start E2E session: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as { sessionId: string };
    return new AppSession(baseUrl, payload.sessionId, child, logLines);
  }

  async sendCommand(command: string, payload: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        payload,
        deviceType: 'system',
        sessionId: this.sessionId,
        clientId: 'harness',
        clientLabel: 'harness',
        clientKind: 'server',
      }),
    });
    if (!response.ok) {
      throw new Error(`Command ${command} failed with ${response.status}`);
    }
  }

  async loadConfiguration(configuration: unknown): Promise<void> {
    await this.sendCommand('load-configuration', configuration);
  }

  async getEvents(): Promise<ProbeEvent[]> {
    const response = await fetch(`${this.baseUrl}/api/e2e/session/${this.sessionId}/events`);
    if (!response.ok) {
      throw new Error(`Failed to fetch E2E events: ${response.status}`);
    }
    return response.json() as Promise<ProbeEvent[]>;
  }

  async getSummary(): Promise<SessionSummary> {
    const response = await fetch(`${this.baseUrl}/api/e2e/session/${this.sessionId}/summary`);
    if (!response.ok) {
      throw new Error(`Failed to fetch E2E summary: ${response.status}`);
    }
    return response.json() as Promise<SessionSummary>;
  }

  async waitForEvent(
    eventType: string,
    predicate: (event: ProbeEvent) => boolean = () => true,
    timeoutMs = 15_000,
  ): Promise<ProbeEvent> {
    return waitFor(async () => {
      const events = await this.getEvents();
      return events.find((event) => event.eventType === eventType && predicate(event)) ?? null;
    }, timeoutMs);
  }

  async waitForSummary(
    predicate: (summary: SessionSummary) => boolean,
    timeoutMs = 15_000,
  ): Promise<SessionSummary> {
    return waitFor(async () => {
      const summary = await this.getSummary();
      return predicate(summary) ? summary : null;
    }, timeoutMs);
  }

  async waitForWindowReadiness(timeoutMs = 15_000): Promise<void> {
    await this.waitForSummary((summary) => {
      const clientIds = Object.keys(summary.clientSnapshots);
      return clientIds.includes('control-plane') && clientIds.includes('visualizer');
    }, timeoutMs);
  }

  async waitForConvergence(clientIds: string[], timeoutMs = 15_000): Promise<SessionSummary> {
    return this.waitForSummary((summary) => {
      if (!summary.serverSnapshot) {
        return false;
      }

      const expected = JSON.stringify(comparableSnapshot(summary.serverSnapshot));
      return clientIds.every((clientId) => {
        const snapshot = summary.clientSnapshots[clientId]?.snapshot;
        return snapshot !== undefined && JSON.stringify(comparableSnapshot(snapshot)) === expected;
      });
    }, timeoutMs);
  }

  async launchMatrix(projectName: string): Promise<RemoteClient[]> {
    const descriptors = browserMatrixForProject(projectName);
    const clients = await Promise.all(
      descriptors.map((descriptor) => RemoteClient.launch(this.baseUrl, this.sessionId, descriptor)),
    );
    this.clients.push(...clients);
    return clients;
  }

  async persistArtifacts(testInfo: TestInfo, failed: boolean): Promise<void> {
    try {
      const events = await this.getEvents();
      await fsPromises.writeFile(
        testInfo.outputPath('probe-events.json'),
        JSON.stringify(events, null, 2),
        'utf8',
      );
    } catch {
      // ignore artifact collection failures during teardown
    }

    try {
      const summary = await this.getSummary();
      await fsPromises.writeFile(
        testInfo.outputPath('session-summary.json'),
        JSON.stringify(summary, null, 2),
        'utf8',
      );
    } catch {
      // ignore artifact collection failures during teardown
    }
    if (this.logs.length > 0) {
      await fsPromises.writeFile(
        testInfo.outputPath('app.log'),
        this.logs.join(''),
        'utf8',
      );
    }

    for (const client of this.clients) {
      await client.persistArtifacts(testInfo, failed);
    }
  }

  async close(status: 'completed' | 'failed'): Promise<void> {
    for (const client of this.clients.splice(0, this.clients.length)) {
      await client.close();
    }

    try {
      await fetch(`${this.baseUrl}/api/e2e/session/${this.sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
        }),
      });
    } catch {
      // ignore
    }

    try {
      this.process.kill('SIGTERM');
    } catch {
      // ignore
    }
    await stopStaleProcesses();
  }
}
