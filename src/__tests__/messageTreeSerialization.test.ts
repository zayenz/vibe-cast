import { describe, it, expect } from 'vitest';
import { useStore } from '../store';
import type { AppConfiguration, MessageTreeNode } from '../plugins/types';

describe('configuration serialization: messageTree', () => {
  it('round-trips messageTree via loadConfiguration/getConfiguration', () => {
    const tree: MessageTreeNode[] = [
      {
        type: 'folder',
        id: 'f1',
        name: 'Announcements',
        collapsed: false,
        children: [
          {
            type: 'message',
            id: 'm1',
            message: {
              id: 'm1',
              text: 'Hello',
              textStyle: 'scrolling-capitals',
              textStylePreset: 'preset-1',
              styleOverrides: { fontSize: 6 },
              repeatCount: 2,
              speed: 1.2,
          splitEnabled: true,
          splitSeparator: '|',
            },
          },
        ],
      },
    ];

    const config: AppConfiguration = {
      version: 1,
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace', 'techno'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      visualizationSettings: {},
      visualizationPresets: [],
      // messages is still required by type; backend treats it as flattened view
    messages: [{
      id: 'm1',
      text: 'Hello',
      textStyle: 'scrolling-capitals',
      splitEnabled: true,
      splitSeparator: '|',
      repeatCount: 2,
      speed: 1.2,
    }],
      messageTree: tree,
      defaultTextStyle: 'scrolling-capitals',
      textStyleSettings: {},
      textStylePresets: [{ id: 'preset-1', name: 'Scrolling Capitals', textStyleId: 'scrolling-capitals', settings: {} }],
      messageStats: {},
    };

    useStore.getState().loadConfiguration(config, false);
    const roundTrip = useStore.getState().getConfiguration();

    expect(roundTrip.messageTree).toEqual(tree);
  });

  it('derives a flat messageTree when config.messageTree is missing', () => {
    const config: AppConfiguration = {
      version: 1,
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [
        { id: 'a', text: 'A', textStyle: 'scrolling-capitals' },
        { id: 'b', text: 'B', textStyle: 'fade' },
      ],
      defaultTextStyle: 'scrolling-capitals',
    };

    useStore.getState().loadConfiguration(config, false);
    const roundTrip = useStore.getState().getConfiguration();

    expect(roundTrip.messageTree).toEqual([
      { 
        type: 'message', 
        id: 'a', 
        message: { 
          id: 'a', 
          text: 'A', 
          textStyle: 'scrolling-capitals',
          textStylePreset: 'default-scrolling-capitals' 
        } 
      },
      { 
        type: 'message', 
        id: 'b', 
        message: { 
          id: 'b', 
          text: 'B', 
          textStyle: 'fade',
          textStylePreset: 'default-fade'
        } 
      },
    ]);
  });

  it('resetMessageStats clears stats and is reflected in getConfiguration()', () => {
    const config: AppConfiguration = {
      version: 1,
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'm1', text: 'Hello', textStyle: 'scrolling-capitals' }],
      defaultTextStyle: 'scrolling-capitals',
      messageStats: {
        m1: {
          messageId: 'm1',
          triggerCount: 3,
          lastTriggered: 123,
          history: [{ timestamp: 1 }],
        },
      },
    };

    useStore.getState().loadConfiguration(config, false);
    useStore.getState().resetMessageStats(false);

    const roundTrip = useStore.getState().getConfiguration();
    expect(roundTrip.messageStats).toEqual({});
  });
});


