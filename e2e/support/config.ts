import fs from 'node:fs/promises';
import path from 'node:path';

const FIXTURE_CONFIG_PATH = path.resolve(process.cwd(), 'e2e/fixtures/configs/remote-suite.json');

export interface FixtureConfig {
  activeVisualization: string;
  activeVisualizationPreset?: string;
  enabledVisualizations?: string[];
  commonSettings?: Record<string, unknown>;
  visualizationPresets?: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  messageTree: Array<Record<string, unknown>>;
}

export async function loadFixtureConfig(): Promise<FixtureConfig> {
  const contents = await fs.readFile(FIXTURE_CONFIG_PATH, 'utf8');
  return JSON.parse(contents) as FixtureConfig;
}

export async function buildLargeFixtureConfig(messageCount = 180): Promise<FixtureConfig> {
  const base = await loadFixtureConfig();
  const messages = Array.from({ length: messageCount }, (_, index) => {
    const id = `large-message-${index + 1}`;
    return {
      id,
      text: `LOAD ${index + 1}`,
      textStyle: 'scrolling-capitals',
      speed: 30,
    };
  });

  return {
    ...base,
    visualizationPresets: [
      ...(base.visualizationPresets ?? []),
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `techno-variant-${index + 1}`,
        name: `Techno Variant ${index + 1}`,
        visualizationId: index % 2 === 0 ? 'techno' : 'fireplace',
        settings: {},
        enabled: true,
      })),
    ],
    messages,
    messageTree: [
      {
        type: 'folder',
        id: 'large-folder',
        name: 'Large Folder',
        children: messages.map((message) => ({
          type: 'message',
          id: message.id,
          message,
        })),
      },
    ],
  };
}
