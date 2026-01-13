import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsRenderer } from '../SettingsRenderer';
import { open } from '@tauri-apps/plugin-dialog';

// Mock Tauri plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('SettingsRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call open with correct parameters when Browse is clicked', async () => {
    const mockOnChange = vi.fn();
    const schema = [
      {
        type: 'text' as const,
        id: 'folderPath',
        label: 'Folder Path',
        default: '',
        placeholder: 'Select folder',
        actionButton: 'folder' as const,
      },
    ];
    const values = { folderPath: '' };

    render(
      <SettingsRenderer
        schema={schema}
        values={values}
        onChange={mockOnChange}
      />
    );

    const browseButton = screen.getByText('Browse...');
    fireEvent.click(browseButton);

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
      });
    });
  });
});
