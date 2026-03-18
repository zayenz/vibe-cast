import { expect, test } from '../fixtures/app';
import type { ProbeEvent, SessionSummary } from '../support/appHarness';
import { RemoteClient } from '../support/remoteClient';
import { buildLargeFixtureConfig, loadFixtureConfig } from '../support/config';

async function bootClients(
  projectName: string,
  appSession: { launchMatrix: (project: string) => Promise<RemoteClient[]>; waitForWindowReadiness: () => Promise<void> },
): Promise<RemoteClient[]> {
  const clients = await appSession.launchMatrix(projectName);
  await Promise.all(clients.map((client) => client.waitUntilReady()));
  await appSession.waitForWindowReadiness();
  return clients;
}

function recentEvents(events: ProbeEvent[], cursor: number): ProbeEvent[] {
  return events.slice(cursor);
}

function remoteEvent(events: ProbeEvent[], type: string, clientId: string): ProbeEvent | undefined {
  return events.find((event) => event.eventType === type && event.clientId === clientId);
}

function comparableSnapshot(summarySnapshot: SessionSummary['serverSnapshot'] | undefined): Record<string, unknown> | null {
  if (!summarySnapshot) {
    return null;
  }

  const { connectionPhase: _connectionPhase, ...rest } = summarySnapshot;
  return rest;
}

function summaryMatchesServer(summary: SessionSummary, clientId: string): boolean {
  const clientSnapshot = summary.clientSnapshots[clientId]?.snapshot;
  return Boolean(
    clientSnapshot
      && summary.serverSnapshot
      && JSON.stringify(comparableSnapshot(clientSnapshot)) === JSON.stringify(comparableSnapshot(summary.serverSnapshot)),
  );
}

test('cold-start remote hydration converges across the browser matrix', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await buildLargeFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);
  const clientIds = clients.map((client) => client.clientId);

  await Promise.all(clients.map((client) => client.waitForConnectionPhase('live')));
  await appSession.waitForConvergence([...clientIds, 'control-plane', 'visualizer'], 20_000);

  const events = await appSession.getEvents();
  for (const client of clients) {
    expect(client.network.bootstrapRequests).toBe(1);
    expect(client.network.sseRequests).toBe(1);
    expect(client.network.statePollRequests).toBe(0);

    const firstUsable = remoteEvent(events, 'remote_first_usable_render', client.clientId);
    expect(firstUsable).toBeTruthy();
    expect(Number(firstUsable?.payload.firstUsableRenderMs ?? 0)).toBeLessThanOrEqual(12_000);
  }
});

test('preset changes fan out once and converge across clients', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await loadFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);
  const baselineCount = (await appSession.getEvents()).length;

  await clients[0].selectPreset('techno-bassline');

  const summary = await appSession.waitForSummary((nextSummary) => {
    if (nextSummary.serverSnapshot?.activeVisualizationPreset !== 'techno-bassline') {
      return false;
    }
    return ['control-plane', 'visualizer', ...clients.map((client) => client.clientId)]
      .every((clientId) => summaryMatchesServer(nextSummary, clientId));
  }, 15_000);

  expect(summary.serverSnapshot?.activeVisualization).toBe('techno');
  const deltaEvents = recentEvents(await appSession.getEvents(), baselineCount);
  expect(deltaEvents.filter((event) => event.eventType === 'server_command_applied' && event.payload.command === 'set-active-visualization-preset')).toHaveLength(1);
  expect(deltaEvents.filter((event) => event.eventType === 'server_remote_state_broadcast')).toHaveLength(1);
  expect(deltaEvents.filter((event) => event.eventType === 'server_desktop_state_broadcast')).toHaveLength(1);
});

test('triggering and stopping a message stays synchronized everywhere', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await loadFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);

  await clients[1].triggerMessage('message-1');

  await appSession.waitForSummary((summary) => {
    if (summary.serverSnapshot?.playbackCurrentMessageId !== 'message-1' || !summary.serverSnapshot?.playbackIsPlaying) {
      return false;
    }
    return ['control-plane', 'visualizer', ...clients.map((client) => client.clientId)]
      .every((clientId) => summaryMatchesServer(summary, clientId));
  }, 15_000);
  await appSession.waitForEvent(
    'visualizer_message_rendered',
    (event) => event.payload.messageId === 'message-1',
    15_000,
  );

  const playingSummary = await appSession.getSummary();
  expect(playingSummary.serverSnapshot?.messageTriggerCounts['message-1']).toBe(1);

  await clients[Math.min(2, clients.length - 1)].stopMessage('message-1');

  await appSession.waitForSummary((summary) => {
    if (summary.serverSnapshot?.playbackIsPlaying) {
      return false;
    }
    return ['control-plane', 'visualizer', ...clients.map((client) => client.clientId)]
      .every((clientId) => summaryMatchesServer(summary, clientId));
  }, 15_000);
  await appSession.waitForEvent(
    'visualizer_message_cleared',
    (event) => event.payload.messageId === 'message-1',
    15_000,
  );
});

test('folder playback progresses and clears cleanly', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await loadFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);

  await clients[0].playFolder('showtime-folder');

  await appSession.waitForSummary((summary) => {
    return summary.serverSnapshot?.queueFolderId === 'showtime-folder'
      && summary.serverSnapshot?.queueCurrentMessageId === 'message-1';
  }, 10_000);

  await appSession.waitForEvent(
    'visualizer_message_rendered',
    (event) => event.payload.messageId === 'message-2',
    15_000,
  );

  await appSession.waitForSummary((summary) => {
    return !summary.serverSnapshot?.queueFolderId
      && !summary.serverSnapshot?.playbackIsPlaying;
  }, 20_000);
});

test('remote reconnect recovers without duplicating client state', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await loadFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);
  const client = clients[0];

  const clientIndex = appSession.clients.indexOf(client);
  await client.close();
  if (clientIndex >= 0) {
    appSession.clients.splice(clientIndex, 1);
  }
  await appSession.waitForEvent(
    'server_sse_client_disconnected',
    (event) => event.clientId === client.clientId,
    20_000,
  );

  const reconnectedClient = await RemoteClient.launch(appSession.baseUrl, appSession.sessionId, {
    engine: client.engine,
    clientId: client.clientId,
    clientLabel: client.clientLabel,
  });
  clients[0] = reconnectedClient;
  appSession.clients.push(reconnectedClient);
  await reconnectedClient.waitUntilReady();
  await reconnectedClient.waitForConnectionPhase('live');
  await appSession.waitForEvent(
    'remote_sse_open',
    (event) => event.clientId === reconnectedClient.clientId,
    20_000,
  );
  await appSession.waitForConvergence([...clients.map((entry) => entry.clientId), 'control-plane', 'visualizer'], 20_000);

  const summary = await appSession.getSummary();
  expect(Object.keys(summary.clientSnapshots).filter((clientId) => clientId === reconnectedClient.clientId)).toHaveLength(1);
});

test('multi-client contention still resolves to one canonical state', async ({ appSession }, testInfo) => {
  await appSession.loadConfiguration(await loadFixtureConfig());
  const clients = await bootClients(testInfo.project.name, appSession);

  await Promise.all([
    clients[0].triggerMessage('message-1'),
    clients[1].triggerMessage('message-2'),
  ]);

  const summary = await appSession.waitForSummary((nextSummary) => {
    const triggerCounts = nextSummary.serverSnapshot?.messageTriggerCounts ?? {};
    if (triggerCounts['message-1'] !== 1 || triggerCounts['message-2'] !== 1) {
      return false;
    }
    return ['control-plane', 'visualizer', ...clients.map((client) => client.clientId)]
      .every((clientId) => summaryMatchesServer(nextSummary, clientId));
  }, 15_000);

  expect(summary.serverSnapshot?.messageTriggerCounts['message-1']).toBe(1);
  expect(summary.serverSnapshot?.messageTriggerCounts['message-2']).toBe(1);
});
