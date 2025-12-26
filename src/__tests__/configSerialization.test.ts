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
    expect(config.textStylePresets).toHaveLength(1);
    expect(config.textStylePresets![0].id).toBe('test-text-preset');
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
    expect(roundTrippedConfig.messageTree).toEqual(originalConfig.messageTree);
  });
});

