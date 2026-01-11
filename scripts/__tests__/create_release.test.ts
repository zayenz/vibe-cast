// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-expect-error - module not found in TS environment but exists at runtime
import { updateFiles } from '../create_release.mjs';
import fs from 'fs';

vi.mock('fs', async () => {
  return {
    default: {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('create_release script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update tauri.conf.json and Cargo.toml with the new version', async () => {
    const newVersion = '1.2.3';
    
    // Mock file content
    const tauriConfig = JSON.stringify({ version: '0.0.0' });
    const cargoToml = `[package]\nversion = "0.0.0"\nname = "vibe_cast"`;

    vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('tauri.conf.json')) return tauriConfig;
      if (p.includes('Cargo.toml')) return cargoToml;
      return '';
    });

    await updateFiles(newVersion);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    
    // Verify tauri.conf.json update
    const tauriCall = vi.mocked(fs.writeFileSync).mock.calls.find(call => call[0].toString().includes('tauri.conf.json'));
    expect(tauriCall).toBeDefined();
    expect(JSON.parse(tauriCall![1] as string).version).toBe(newVersion);

    // Verify Cargo.toml update
    const cargoCall = vi.mocked(fs.writeFileSync).mock.calls.find(call => call[0].toString().includes('Cargo.toml'));
    expect(cargoCall).toBeDefined();
    expect(cargoCall![1]).toContain('version = "1.2.3"');
  });
});
