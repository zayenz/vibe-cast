import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type Page,
  type TestInfo,
} from '@playwright/test';

export interface RemoteSnapshot {
  configRevision: number;
  runtimeRevision: number;
  activeVisualization: string;
  activeVisualizationPreset: string | null;
  triggeredMessageId: string | null;
  playbackSessionId: string | null;
  playbackIsPlaying: boolean;
  playbackCurrentMessageId: string | null;
  queueFolderId: string | null;
  queueCurrentIndex: number | null;
  queueCurrentMessageId: string | null;
  messageTriggerCounts: Record<string, number>;
  connectionPhase?: 'connecting' | 'degraded' | 'live';
}

export interface BrowserDescriptor {
  engine: 'chromium' | 'firefox' | 'webkit';
  clientId: string;
  clientLabel: string;
  viewport?: { width: number; height: number };
}

export interface RemoteNetworkSummary {
  bootstrapRequests: number;
  sseRequests: number;
  statePollRequests: number;
  commandRequests: number;
}

function browserTypeForEngine(engine: BrowserDescriptor['engine']): BrowserType {
  switch (engine) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      return chromium;
  }
}

export function browserMatrixForProject(projectName: string): BrowserDescriptor[] {
  switch (projectName) {
    case 'chromium':
      return [
        { engine: 'chromium', clientId: 'chromium-a', clientLabel: 'chromium-a' },
        { engine: 'chromium', clientId: 'chromium-b', clientLabel: 'chromium-b' },
        { engine: 'chromium', clientId: 'chromium-c', clientLabel: 'chromium-c' },
      ];
    case 'firefox':
      return [
        { engine: 'firefox', clientId: 'firefox-a', clientLabel: 'firefox-a' },
        { engine: 'firefox', clientId: 'firefox-b', clientLabel: 'firefox-b' },
        { engine: 'firefox', clientId: 'firefox-c', clientLabel: 'firefox-c' },
      ];
    case 'webkit':
      return [
        { engine: 'webkit', clientId: 'webkit-a', clientLabel: 'webkit-a' },
        { engine: 'webkit', clientId: 'webkit-b', clientLabel: 'webkit-b' },
        { engine: 'webkit', clientId: 'webkit-c', clientLabel: 'webkit-c' },
      ];
    case 'mobile-chromium':
      return [
        {
          engine: 'chromium',
          clientId: 'mobile-chromium-a',
          clientLabel: 'mobile-chromium-a',
          viewport: { width: 390, height: 844 },
        },
        { engine: 'chromium', clientId: 'mobile-chromium-b', clientLabel: 'mobile-chromium-b' },
        { engine: 'chromium', clientId: 'mobile-chromium-c', clientLabel: 'mobile-chromium-c' },
      ];
    default:
      return [
        { engine: 'chromium', clientId: 'chromium-a', clientLabel: 'chromium-a' },
        { engine: 'firefox', clientId: 'firefox-a', clientLabel: 'firefox-a' },
        { engine: 'webkit', clientId: 'webkit-a', clientLabel: 'webkit-a' },
        { engine: 'chromium', clientId: 'chromium-b', clientLabel: 'chromium-b' },
      ];
  }
}

export class RemoteClient {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly clientId: string;
  readonly clientLabel: string;
  readonly engine: BrowserDescriptor['engine'];
  readonly network: RemoteNetworkSummary = {
    bootstrapRequests: 0,
    sseRequests: 0,
    statePollRequests: 0,
    commandRequests: 0,
  };
  readonly consoleLines: string[] = [];

  private constructor(
    browser: Browser,
    context: BrowserContext,
    page: Page,
    descriptor: BrowserDescriptor,
  ) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.clientId = descriptor.clientId;
    this.clientLabel = descriptor.clientLabel;
    this.engine = descriptor.engine;
  }

  static async launch(
    baseUrl: string,
    sessionId: string,
    descriptor: BrowserDescriptor,
  ): Promise<RemoteClient> {
    const browser = await browserTypeForEngine(descriptor.engine).launch({ headless: true });
    const context = await browser.newContext({
      viewport: descriptor.viewport,
    });
    const page = await context.newPage();
    const client = new RemoteClient(browser, context, page, descriptor);
    client.attachObservers();

    const url = new URL(baseUrl);
    url.searchParams.set('e2e', '1');
    url.searchParams.set('perf', '1');
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('clientId', descriptor.clientId);
    url.searchParams.set('clientLabel', descriptor.clientLabel);
    url.searchParams.set('clientKind', 'remote');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    return client;
  }

  private attachObservers(): void {
    this.page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/remote/state')) {
        this.network.bootstrapRequests += 1;
      } else if (url.includes('/api/remote/events')) {
        this.network.sseRequests += 1;
      } else if (url.includes('/api/state')) {
        this.network.statePollRequests += 1;
      } else if (url.includes('/api/command')) {
        this.network.commandRequests += 1;
      }
    });

    this.page.on('console', (message) => {
      this.consoleLines.push(`[${message.type()}] ${message.text()}`);
    });
  }

  async waitUntilReady(timeoutMs = 15_000): Promise<void> {
    await this.page.waitForSelector('[data-testid="remote-root"]', { timeout: timeoutMs });
    await this.page.waitForFunction(
      () => Boolean(window.__VIBECAST_E2E__?.getSnapshot?.()),
      undefined,
      { timeout: timeoutMs },
    );
  }

  async waitForConnectionPhase(target: 'degraded' | 'live', timeoutMs = 15_000): Promise<void> {
    await this.page.waitForFunction(
      (phase) => document.querySelector('[data-testid="remote-root"]')?.getAttribute('data-connection-phase') === phase,
      target,
      { timeout: timeoutMs },
    );
  }

  async selectPreset(presetId: string): Promise<void> {
    await this.page.getByTestId(`preset-${presetId}`).click();
  }

  async triggerMessage(messageId: string): Promise<void> {
    await this.page.getByTestId(`message-${messageId}`).click();
  }

  async stopMessage(messageId: string): Promise<void> {
    await this.page.getByTestId(`message-stop-${messageId}`).click();
  }

  async playFolder(folderId: string): Promise<void> {
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.page.getByTestId(`folder-play-${folderId}`).click();
  }

  async captureSnapshot(): Promise<RemoteSnapshot | null> {
    return this.page.evaluate(() => window.__VIBECAST_E2E__?.getSnapshot?.() ?? null);
  }

  async setOffline(offline: boolean): Promise<void> {
    await this.context.setOffline(offline);
  }

  async persistArtifacts(testInfo: TestInfo, failed: boolean): Promise<void> {
    if (failed) {
      await this.page.screenshot({
        path: testInfo.outputPath(`${this.clientLabel}.png`),
        fullPage: true,
      });
    }

    try {
      await this.context.tracing.stop({
        path: testInfo.outputPath(`${this.clientLabel}-trace.zip`),
      });
    } catch {
      // tracing may not be active for manually launched contexts
    }

    if (this.consoleLines.length > 0) {
      await testInfo.attach(`${this.clientLabel}-console`, {
        body: this.consoleLines.join('\n'),
        contentType: 'text/plain',
      });
    }
  }

  async close(): Promise<void> {
    try {
      await this.browser.close();
    } catch {
      // ignore close races during teardown
    }
  }
}
