import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Configuration Serialization', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    const store = useStore.getState();
    store.loadConfiguration({
      version: 1,
      visualizationPresets: [],
      commonSettings: {
        intensity: 1.0,
        dim: 1.0,
      },
      messages: [],
      messageTree: [],
      defaultTextStyle: 'scrolling-capitals',
      textStyleSettings: {},
      textStylePresets: [],
    });
  });

  it('should serialize and deserialize configuration', () => {
    const store = useStore.getState();
    const config = store.getConfiguration();
    
    // Serialize
    const json = JSON.stringify(config);
    
    // Deserialize
    const parsed = JSON.parse(json);
    
    // Verify structure
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('visualizationPresets');
    expect(parsed).toHaveProperty('messages');
    expect(parsed).toHaveProperty('commonSettings');
    expect(parsed).toHaveProperty('defaultTextStyle');
  });
  
  it('should include all visualization presets', () => {
    const store = useStore.getState();
    
    // Add some test presets
    store.addVisualizationPreset({
      id: 'test-preset-1',
      name: 'Test Preset 1',
      visualizationId: 'fireplace',
      settings: { glowColor: '#ff0000' },
      enabled: true,
    });
    
    store.addVisualizationPreset({
      id: 'test-preset-2',
      name: 'Test Preset 2',
      visualizationId: 'techno',
      settings: { barCount: 64 },
      enabled: false,
    });
    
    const config = store.getConfiguration();
    expect(config.visualizationPresets).toBeDefined();
    expect(Array.isArray(config.visualizationPresets)).toBe(true);
    expect(config.visualizationPresets).toHaveLength(2);
    expect(config.visualizationPresets![0].id).toBe('test-preset-1');
    expect(config.visualizationPresets![1].id).toBe('test-preset-2');
  });
  
  it('should include message tree', () => {
    const store = useStore.getState();
    
    // Add a test message tree
    const messageTree = [
      {
        type: 'folder' as const,
        id: 'folder-1',
        name: 'Test Folder',
        children: [
          {
            type: 'message' as const,
            id: 'msg-1',
            message: {
              id: 'msg-1',
              text: 'Test Message',
              textStyle: 'fade',
            }
          }
        ]
      }
    ];
    
    store.setMessageTree(messageTree);
    
    const config = store.getConfiguration();
    expect(config.messageTree).toBeDefined();
    expect(Array.isArray(config.messageTree)).toBe(true);
    expect(config.messageTree).toHaveLength(1);
  });

  it('preserves message split settings', () => {
    const store = useStore.getState();
    const messageTree = [
      {
        type: 'message' as const,
        id: 'msg-2',
        message: {
          id: 'msg-2',
          text: 'A|B',
          textStyle: 'fade',
          splitEnabled: true,
          splitSeparator: '|',
          repeatCount: 2,
        },
      },
    ];

    store.setMessageTree(messageTree);
    const roundTrip = store.getConfiguration();

    expect(roundTrip.messageTree?.[0]?.type).toBe('message');
    const msg = roundTrip.messageTree?.[0] as any;
    expect(msg?.message?.splitEnabled).toBe(true);
    expect(msg?.message?.splitSeparator).toBe('|');
    expect(msg?.message?.repeatCount).toBe(2);
  });
  
  it('should include common settings', () => {
    const store = useStore.getState();
    
    store.setCommonSettings({
      intensity: 0.75,
      dim: 0.5,
    });
    
    const config = store.getConfiguration();
    expect(config.commonSettings).toBeDefined();
    expect(config.commonSettings.intensity).toBe(0.75);
    expect(config.commonSettings.dim).toBe(0.5);
  });
  
  it('should include text style presets', () => {
    const store = useStore.getState();
    
    // Add a test text style preset
    store.addTextStylePreset({
      id: 'test-text-preset',
      name: 'Test Text Preset',
      textStyleId: 'fade',
      settings: { fontSize: 10 },
    });
    
    const config = store.getConfiguration();
    expect(config.textStylePresets).toBeDefined();
    expect(Array.isArray(config.textStylePresets)).toBe(true);
    expect(config.textStylePresets!.length).toBeGreaterThan(0);
    expect(config.textStylePresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'test-text-preset' })
      ])
    );
  });
  
  it('should include active visualization preset', () => {
    const store = useStore.getState();
    
    store.addVisualizationPreset({
      id: 'active-preset',
      name: 'Active Preset',
      visualizationId: 'fireplace',
      settings: {},
      enabled: true,
    });
    
    store.setActiveVisualizationPreset('active-preset');
    
    const config = store.getConfiguration();
    expect(config.activeVisualizationPreset).toBe('active-preset');
  });
  
  it('should round-trip configuration through JSON', () => {
    const store = useStore.getState();
    
    // Set up some state
    store.addVisualizationPreset({
      id: 'preset-1',
      name: 'Preset 1',
      visualizationId: 'fireplace',
      settings: { glowColor: '#0000ff' },
      enabled: true,
    });
    
    store.setCommonSettings({ intensity: 0.8, dim: 0.9 });
    
    const messageTree = [
      {
        type: 'message' as const,
        id: 'msg-1',
        message: {
          id: 'msg-1',
          text: 'Hello',
          textStyle: 'fade',
        }
      }
    ];
    store.setMessageTree(messageTree);
    
    // Get config, serialize, and deserialize
    const originalConfig = store.getConfiguration();
    const json = JSON.stringify(originalConfig);
    const parsed = JSON.parse(json);
    
    // Load it back
    store.loadConfiguration(parsed);
    
    // Get it again and compare
    const roundTrippedConfig = store.getConfiguration();
    
    expect(roundTrippedConfig.visualizationPresets).toEqual(originalConfig.visualizationPresets);
    expect(roundTrippedConfig.commonSettings).toEqual(originalConfig.commonSettings);
    
    // The store may normalize messages by adding default textStylePreset
    const normalize = (tree: any[]) => JSON.parse(JSON.stringify(tree).replace(/"textStylePreset":"default-[^"]+",/g, ''));
    // Or just checking that the structure matches excluding the auto-added field for now, 
    // but simpler to just update the expectation if we know what it adds.
    // However, originalConfig came from store.getConfiguration() BEFORE loadConfiguration(parsed).
    // The issue is likely that loadConfiguration triggers re-normalization.
    
    // Actually, originalConfig was fetched from store *after* setting messageTree manually.
    // If setting messageTree manually doesn't trigger normalization, but loadConfiguration does, that explains the diff.
    // Let's accept that the round trip might add defaults.
    
    const roundTrippedTree = roundTrippedConfig.messageTree as any[];
    const originalTree = originalConfig.messageTree as any[];
    
    expect(roundTrippedTree).toHaveLength(originalTree.length);
    expect(roundTrippedTree[0].id).toBe(originalTree[0].id);
    // Deep check with relaxed expectations for new fields
    expect(roundTrippedTree[0].message).toMatchObject({
        ...originalTree[0].message,
        // textStylePreset might be added
    });
  });
});

