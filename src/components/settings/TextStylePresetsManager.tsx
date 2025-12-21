/**
 * Text Style Presets Manager Component
 * 
 * Manages text style presets - named configurations of text styles with specific settings.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Save, Type } from 'lucide-react';
import { TextStylePreset } from '../../plugins/types';
import { textStyleRegistry, getTextStyle } from '../../plugins/textStyles';
import { SettingsRenderer } from './SettingsRenderer';
import { getDefaultsFromSchema } from '../../plugins/types';

interface TextStylePresetsManagerProps {
  presets: TextStylePreset[];
  onAddPreset: (preset: TextStylePreset) => void;
  onUpdatePreset: (id: string, updates: Partial<TextStylePreset>) => void;
  onDeletePreset: (id: string) => void;
}

export const TextStylePresetsManager: React.FC<TextStylePresetsManagerProps> = ({
  presets,
  onAddPreset,
  onUpdatePreset,
  onDeletePreset,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<Partial<TextStylePreset>>({
    name: '',
    textStyleId: textStyleRegistry[0]?.id || '',
    settings: {},
  });

  const handleCreatePreset = () => {
    if (!formData.name || !formData.textStyleId) return;
    
    const textStyle = getTextStyle(formData.textStyleId);
    if (!textStyle) return;

    const defaultSettings = getDefaultsFromSchema(textStyle.settingsSchema);
    const newPreset: TextStylePreset = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: formData.name,
      textStyleId: formData.textStyleId,
      settings: { ...defaultSettings, ...formData.settings },
    };

    onAddPreset(newPreset);
    setShowCreateModal(false);
    setFormData({ name: '', textStyleId: textStyleRegistry[0]?.id || '', settings: {} });
  };

  const handleUpdatePreset = (id: string) => {
    onUpdatePreset(id, formData);
    setEditingId(null);
    setFormData({ name: '', textStyleId: '', settings: {} });
  };

  const handleEditPreset = (preset: TextStylePreset) => {
    setEditingId(preset.id);
    setFormData({
      name: preset.name,
      textStyleId: preset.textStyleId,
      settings: preset.settings,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowCreateModal(false);
    setFormData({ name: '', textStyleId: '', settings: {} });
  };

  const handleTextStyleChange = (styleId: string) => {
    const textStyle = getTextStyle(styleId);
    if (!textStyle) return;

    const defaultSettings = getDefaultsFromSchema(textStyle.settingsSchema);
    setFormData({
      ...formData,
      textStyleId: styleId,
      settings: { ...defaultSettings, ...(formData.settings || {}) },
    });
  };

  const editingPreset = editingId ? presets.find(p => p.id === editingId) : null;
  const editingTextStyle = editingPreset ? getTextStyle(editingPreset.textStyleId) : null;
  const formTextStyle = formData.textStyleId ? getTextStyle(formData.textStyleId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">
          Text Style Presets
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-orange-600 transition-colors"
        >
          <Plus size={14} />
          Create
        </button>
      </div>

      <div className="space-y-2">
        {presets.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No presets yet. Create one to get started.
          </div>
        ) : (
          presets.map((preset) => {
            const textStyle = getTextStyle(preset.textStyleId);
            const isEditing = editingId === preset.id;

            return (
              <div
                key={preset.id}
                className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden transition-all"
              >
                {isEditing ? (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-zinc-300">Edit Preset</h4>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                        Name
                      </label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                        placeholder="Preset name"
                      />
                    </div>

                    {editingTextStyle && (
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                          Text Style
                        </label>
                        <select
                          value={formData.textStyleId || ''}
                          onChange={(e) => handleTextStyleChange(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                        >
                          {textStyleRegistry.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {editingTextStyle && editingTextStyle.settingsSchema.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                          Settings
                        </label>
                        <SettingsRenderer
                          schema={editingTextStyle.settingsSchema}
                          values={formData.settings || {}}
                          onChange={(key, value) => {
                            setFormData({
                              ...formData,
                              settings: { ...(formData.settings || {}), [key]: value },
                            });
                          }}
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdatePreset(preset.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                      >
                        <Save size={14} />
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => handleEditPreset(preset)}
                      className="flex-1 text-left text-zinc-300 hover:text-white"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Type size={16} className="text-zinc-500" />
                        <span className="font-medium text-sm">{preset.name}</span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {textStyle?.name || 'Unknown'} • {Object.keys(preset.settings).length} settings
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditPreset(preset)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Edit preset"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => onDeletePreset(preset.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleCancelEdit}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-zinc-200">Create Text Style Preset</h3>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                    placeholder="e.g., Bold Red Scroll"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                    Text Style
                  </label>
                  <select
                    value={formData.textStyleId || ''}
                    onChange={(e) => handleTextStyleChange(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                  >
                    {textStyleRegistry.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </div>

                {formTextStyle && formTextStyle.settingsSchema.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                      Settings
                    </label>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                      <SettingsRenderer
                        schema={formTextStyle.settingsSchema}
                        values={formData.settings || {}}
                        onChange={(key, value) => {
                          setFormData({
                            ...formData,
                            settings: { ...(formData.settings || {}), [key]: value },
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCreatePreset}
                    disabled={!formData.name || !formData.textStyleId}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    Create Preset
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-4 py-3 bg-zinc-800 text-zinc-300 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

