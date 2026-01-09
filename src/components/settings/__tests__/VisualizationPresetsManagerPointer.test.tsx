import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VisualizationPresetsManager } from '../VisualizationPresetsManager';
import { VisualizationPreset } from '../../../plugins/types';

// Mock getVisualization to return something
vi.mock('../../../plugins/visualizations', () => ({
  getVisualization: (id: string) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    settingsSchema: [],
  }),
  visualizationRegistry: [
    { id: 'fireplace', name: 'Fireplace', settingsSchema: [] },
    { id: 'techno', name: 'Techno', settingsSchema: [] },
  ],
}));

// Mock icon set
vi.mock('../../../utils/iconSet', () => ({
  getIcon: () => null,
}));

const mockPresets: VisualizationPreset[] = [
  { id: '1', name: 'Preset 1', visualizationId: 'fireplace', settings: {}, enabled: true, order: 0 },
  { id: '2', name: 'Preset 2', visualizationId: 'techno', settings: {}, enabled: true, order: 1 },
  { id: '3', name: 'Preset 3', visualizationId: 'waves', settings: {}, enabled: true, order: 2 },
];

describe('VisualizationPresetsManager (Pointer Events)', () => {
  it('reorders presets using pointer events', () => {
    const onReorderPresets = vi.fn();
    render(
      <VisualizationPresetsManager
        presets={mockPresets}
        activePresetId={null}
        onAddPreset={vi.fn()}
        onUpdatePreset={vi.fn()}
        onDeletePreset={vi.fn()}
        onSetActivePreset={vi.fn()}
        onReorderPresets={onReorderPresets}
      />
    );

    const dragHandles = screen.getAllByTitle('Drag to reorder');
    expect(dragHandles).toHaveLength(3);

    // Mock getBoundingClientRect on the container divs
    // The ref is attached to the parent div of the card
    const handle1 = dragHandles[0];
    // Traverse up to find the div with the ref. 
    // handle -> div -> div -> div (ref) ?? 
    // JSX: <div key={preset.id}> ... <div ref={...} ...> ... <div ... handle ...>
    // Wait, the ref is on the inner div: <div ref={...} className="bg-zinc-950...">
    // The handle is inside that.
    const presetDivs = dragHandles.map(h => h.closest('div.bg-zinc-950'));
    
    const mockRects = [
      { top: 0, height: 50, bottom: 50 },
      { top: 50, height: 50, bottom: 100 },
      { top: 100, height: 50, bottom: 150 },
    ];

    presetDivs.forEach((div, i) => {
        if (div) {
            div.getBoundingClientRect = vi.fn(() => ({
                top: mockRects[i].top,
                height: mockRects[i].height,
                bottom: mockRects[i].bottom,
                left: 0, right: 100, width: 100, x: 0, y: mockRects[i].top,
                toJSON: () => {}
            }));
        }
    });

    // Mock pointer capture methods
    handle1.setPointerCapture = vi.fn();
    handle1.releasePointerCapture = vi.fn();

    // Start drag on Item 1
    fireEvent.pointerDown(handle1, { clientX: 50, clientY: 25, button: 0, pointerId: 1 });
    expect(handle1.setPointerCapture).toHaveBeenCalledWith(1);

    // Move to bottom of Item 3 (y = 140)
    // This should target index 3 (after Item 3)
    fireEvent.pointerMove(handle1, { clientX: 50, clientY: 140, pointerId: 1 });
    
    // End drag
    fireEvent.pointerUp(handle1, { clientX: 50, clientY: 140, pointerId: 1 });

    expect(onReorderPresets).toHaveBeenCalled();
    const newOrder = onReorderPresets.mock.calls[0][0] as VisualizationPreset[];
    
    // Expected order: 2, 3, 1
    expect(newOrder).toHaveLength(3);
    expect(newOrder[0].id).toBe('2');
    expect(newOrder[1].id).toBe('3');
    expect(newOrder[2].id).toBe('1');
  });
});
