import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import defaultConfig from '../config/defaultConfig.json';
import { AppConfiguration } from '../plugins/types';

describe('configuration roundtrip', () => {
  beforeEach(() => {
    // reset to defaults without syncing to backend
    useStore.getState().resetToDefaults(false);
  });

  it('preserves messages, messageTree, and messageStats through load/save', () => {
    const sampleConfig: AppConfiguration = {
      version: 1,
      activeVisualization: 'fireplace',
      activeVisualizationPreset: 'blue-glow-preset',
      enabledVisualizations: ['fireplace', 'techno'],
      commonSettings: defaultConfig.commonSettings,
      visualizationSettings: {},
      visualizationPresets: [],
      messages: [
        { id: 'a', text: 'One', textStyle: 'scrolling-capitals' },
        { id: 'b', text: 'Two', textStyle: 'scrolling-capitals' },
      ],
      messageTree: [
        {
          type: 'folder' as const,
          id: 'folder-1',
          name: 'Folder',
          children: [
            { type: 'message' as const, id: 'a', message: { id: 'a', text: 'One', textStyle: 'scrolling-capitals' } },
            { type: 'message' as const, id: 'b', message: { id: 'b', text: 'Two', textStyle: 'scrolling-capitals' } },
          ],
        },
      ],
      defaultTextStyle: 'scrolling-capitals',
      textStyleSettings: {},
      textStylePresets: [],
      messageStats: {
        a: { messageId: 'a', triggerCount: 2, lastTriggered: 111, history: [{ timestamp: 111 }] },
      },
    };

    // Load into store (no backend sync)
    useStore.getState().loadConfiguration(sampleConfig, false);

    // Save snapshot
    const saved = useStore.getState().getConfiguration();

    expect(saved.messages.length).toBe(2);
    expect(saved.messageTree?.length).toBe(1);
    expect(saved.messageStats?.a?.triggerCount).toBe(2);
    expect(saved.activeVisualizationPreset).toBe('blue-glow-preset');
  });
});

