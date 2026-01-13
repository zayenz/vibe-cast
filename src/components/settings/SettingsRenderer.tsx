/**
 * Settings Renderer Component
 * 
 * Dynamically renders settings controls based on a schema definition.
 * Supports range sliders, color pickers, select dropdowns, and toggles.
 */

import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { SettingDefinition } from '../../plugins/types';
import { AlbumSelectorModal } from '../AlbumSelectorModal';

interface SettingsRendererProps {
  schema: SettingDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export const SettingsRenderer: React.FC<SettingsRendererProps> = ({
  schema,
  values,
  onChange,
  className = '',
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {schema.map((setting) => (
        <SettingControl
          key={setting.id}
          setting={setting}
          value={values[setting.id] ?? setting.default}
          onChange={(value) => onChange(setting.id, value)}
        />
      ))}
    </div>
  );
};

interface SettingControlProps {
  setting: SettingDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

const SettingControl: React.FC<SettingControlProps> = ({ setting, value, onChange }) => {
  switch (setting.type) {
    case 'range':
      return (
        <RangeControl
          label={setting.label}
          value={value as number}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          onChange={onChange}
        />
      );
    case 'color':
      return (
        <ColorControl
          label={setting.label}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'select':
      return (
        <SelectControl
          label={setting.label}
          value={value as string}
          options={setting.options}
          onChange={onChange}
        />
      );
    case 'boolean':
      return (
        <BooleanControl
          label={setting.label}
          value={value as boolean}
          onChange={onChange}
        />
      );
    case 'text':
      return (
        <TextControl
          label={setting.label}
          value={value as string}
          placeholder={setting.placeholder}
          actionButton={setting.actionButton}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
};

// ============================================================================
// Individual Control Components
// ============================================================================

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const RangeControl: React.FC<RangeControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-xs font-mono text-zinc-500">
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
      />
    </div>
  );
};

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorControl: React.FC<ColorControlProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex justify-between items-center">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
        />
        <span className="text-xs font-mono text-zinc-500 w-16">{value}</span>
      </div>
    </div>
  );
};

interface SelectControlProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const SelectControl: React.FC<SelectControlProps> = ({ label, value, options, onChange }) => {
  return (
    <div className="flex justify-between items-center">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

interface BooleanControlProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const BooleanControl: React.FC<BooleanControlProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex justify-between items-center">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        {label}
      </label>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          value ? 'bg-orange-500' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-md ${
            value ? 'left-7' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
};

interface TextControlProps {
  label: string;
  value: string;
  placeholder?: string;
  actionButton?: 'folder' | 'album';
  onChange: (value: string) => void;
}

const TextControl: React.FC<TextControlProps> = ({ label, value, placeholder, actionButton, onChange }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [albumList, setAlbumList] = useState<string[]>([]);
  
  const handleAction = async () => {
    if (isLoading) {
      console.log('[Action Button] Already loading, ignoring click');
      return;
    }
    
    setIsLoading(true);
    try {
      await handleActionInternal();
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleActionInternal = async () => {
    if (actionButton === 'folder') {
      try {
        console.log('[SettingsRenderer] Opening folder picker...');
        const selected = await open({
          directory: true,
          multiple: false,
        });
        console.log('[SettingsRenderer] Folder picker result:', selected);
        if (selected && typeof selected === 'string') {
          console.log('[SettingsRenderer] Selected folder:', selected);
          onChange(selected);
        } else if (selected === null) {
          console.log('[SettingsRenderer] Folder picker cancelled');
        } else {
          console.warn('[SettingsRenderer] Unexpected folder picker result type:', typeof selected, selected);
        }
      } catch (err) {
        console.error('[SettingsRenderer] Failed to open folder picker:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : 'No stack trace';
        console.error('[SettingsRenderer] Error details:', { message: errorMsg, stack: errorStack });
        window.alert(`Failed to open folder browser: ${errorMsg}\n\nCheck console for details.`);
      }
    } else if (actionButton === 'album') {
      try {
        console.log('[Album Picker] Button clicked, requesting albums from Photos app...');
        const albums = await invoke<string[]>('get_photos_albums');
        console.log('[Album Picker] Received albums:', albums);
        console.log('[Album Picker] Album count:', albums?.length);
        
        if (!albums || albums.length === 0) {
          console.log('[Album Picker] No albums found');
          window.alert('No albums found in Apple Photos.\n\nMake sure you have albums in the Photos app and have granted access.');
          return;
        }
        
        console.log('[Album Picker] Found albums:', albums.length, '- showing modal');
        
        // Show the searchable modal
        setAlbumList(albums);
        setShowAlbumModal(true);
        
      } catch (err) {
        console.error('[Album Picker] ERROR:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        window.alert(`Error getting albums: ${errorMsg}\n\nMake sure you're running on macOS and have granted Photos access.`);
      }
    }
  };

  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-orange-500 outline-none transition-colors"
          />
          {actionButton && (
            <button
              onClick={handleAction}
              disabled={isLoading}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {isLoading ? 'Loading...' : (actionButton === 'folder' ? 'Browse...' : 'Select Album')}
            </button>
          )}
        </div>
      </div>

      {/* Album Selector Modal */}
      {showAlbumModal && (
        <AlbumSelectorModal
          albums={albumList}
          onSelect={(album) => {
            console.log('[Album Picker] Album selected:', album);
            onChange(album);
            setShowAlbumModal(false);
          }}
          onCancel={() => {
            console.log('[Album Picker] Selection cancelled');
            setShowAlbumModal(false);
          }}
        />
      )}
    </>
  );
};

// ============================================================================
// Common Settings Component
// ============================================================================

interface CommonSettingsProps {
  intensity: number;
  dim: number;
  onIntensityChange: (value: number) => void;
  onDimChange: (value: number) => void;
}

export const CommonSettings: React.FC<CommonSettingsProps> = ({
  intensity,
  dim,
  onIntensityChange,
  onDimChange,
}) => {
  return (
    <div className="space-y-4">
      <RangeControl
        label="Intensity"
        value={intensity}
        min={0}
        max={1}
        step={0.05}
        onChange={onIntensityChange}
      />
      <RangeControl
        label="Dim"
        value={dim}
        min={0}
        max={1}
        step={0.05}
        onChange={onDimChange}
      />
    </div>
  );
};

export default SettingsRenderer;
