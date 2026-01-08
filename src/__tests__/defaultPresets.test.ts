import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('Default Presets', () => {
  beforeEach(() => {
    const store = useStore.getState();
    store.resetToDefaults(false); // Reset to defaults without sync (to avoid backend noise in tests)
  });

  it('should have the required visualization presets', () => {
    const store = useStore.getState();
    const presets = store.visualizationPresets;
    
    // 1. Standard Fireplace
    const fireplace = presets.find(p => p.name === 'Fireplace' && p.visualizationId === 'fireplace');
    expect(fireplace).toBeDefined();
    expect(fireplace?.settings).toHaveProperty('showLogs', true);

    // 2. Blue Glow Fireplace
    const blueGlow = presets.find(p => p.name === 'Blue Glow Fireplace' || p.name === 'Blue glow');
    expect(blueGlow).toBeDefined();
    expect(blueGlow?.visualizationId).toBe('fireplace');
    expect(blueGlow?.settings).toMatchObject({
      showLogs: false,
      emberCount: 0,
      flameCount: 0,
      glowColor: '#1e3a8a'
    });

    // 3. Slideshow
    const slideshow = presets.find(p => p.visualizationId === 'photo-slideshow');
    expect(slideshow).toBeDefined();

    // 4. Particles (Calm/Large)
    const particles = presets.find(p => p.visualizationId === 'particles');
    expect(particles).toBeDefined();
    // Verify settings for "slightly larger and slower"
    // Default size is 3, speed is 1.5. New: size 5, speed 0.5
    expect(particles?.settings).toMatchObject({
      particleSize: 5,
      speed: 0.5
    });

    // 5. YouTube
    const youtube = presets.find(p => p.visualizationId === 'youtube');
    expect(youtube).toBeDefined();

    // 6. Techno (No Blob)
    const techno = presets.find(p => p.visualizationId === 'techno');
    expect(techno).toBeDefined();
    expect(techno?.settings).toMatchObject({
      showSphere: false,
      showBars: true
    });
  });

  it('should have the centered scrolling capitals text style preset', () => {
    const store = useStore.getState();
    const presets = store.textStylePresets;
    
    const centered = presets.find(p => p.textStyleId === 'scrolling-capitals' && p.settings.position === 'center');
    expect(centered).toBeDefined();
    expect(centered?.settings).toMatchObject({
      fontSize: 12
    });
  });

  it('should have the Party Countdown message folder', () => {
    const store = useStore.getState();
    const tree = store.messageTree;
    
    // Find folder
    const folder = tree.find(n => n.type === 'folder' && n.name === 'Party Countdown');
    expect(folder).toBeDefined();
    expect(folder?.children).toHaveLength(3);
    
    // Message 1: Countdown initiated... (Typewriter)
    const msg1 = folder?.children?.[0];
    expect(msg1?.type).toBe('message');
    expect(msg1?.message?.text).toBe('Countdown initiated...');
    expect(msg1?.message?.textStyle).toBe('typewriter');
    
    // Message 2: 3, 2, 1 (Bounce, Split)
    const msg2 = folder?.children?.[1];
    expect(msg2?.type).toBe('message');
    expect(msg2?.message?.text).toBe('3, 2, 1');
    expect(msg2?.message?.textStyle).toBe('bounce');
    expect(msg2?.message?.splitEnabled).toBe(true);
    expect(msg2?.message?.splitSeparator).toBe(',');
    
    // Message 3: It's time to party (Scrolling Capitals Centered)
    const msg3 = folder?.children?.[2];
    expect(msg3?.type).toBe('message');
    expect(msg3?.message?.text).toContain("It's time to party");
    expect(msg3?.message?.textStyle).toBe('scrolling-capitals');
    // Should use the centered preset OR have settings override
    const preset = store.textStylePresets.find(p => p.id === msg3?.message?.textStylePreset);
    if (preset) {
        expect(preset.settings.position).toBe('center');
    } else {
        // Or specific overrides if implemented that way (but requirement said "uses it")
        // But store normalization might apply defaults. 
        // Let's assume it should use the preset we defined.
        expect(msg3?.message?.textStylePreset).toBeDefined();
    }
  });
});
