/**
 * Visualization Presets Manager Component
 * 
 * Manages visualization presets - named configurations of visualizations with specific settings.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Save, Settings2 } from 'lucide-react';
import { VisualizationPreset } from '../../plugins/types';
import { visualizationRegistry, getVisualization } from '../../plugins/visualizations';
import { SettingsRenderer } from './SettingsRenderer';
import { getDefaultsFromSchema } from '../../plugins/types';

interface VisualizationPresetsManagerProps {
  presets: VisualizationPreset[];
  activePresetId: string | null;
  onAddPreset: (preset: VisualizationPreset) => void;
  onUpdatePreset: (id: string, updates: Partial<VisualizationPreset>) => void;
  onDeletePreset: (id: string) => void;
  onSetActivePreset: (id: string | null) => void;
}

export const VisualizationPresetsManager: React.FC<VisualizationPresetsManagerProps> = ({
  presets,
  activePresetId,
  onAddPreset,
  onUpdatePreset,
  onDeletePreset,
  onSetActivePreset,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<Partial<VisualizationPreset>>({
    name: '',
    visualizationId: visualizationRegistry[0]?.id || '',
    settings: {},
  });

  const handleCreatePreset = () => {
    if (!formData.name || !formData.visualizationId) return;
    
    const visualization = getVisualization(formData.visualizationId);
    if (!visualization) return;

    const defaultSettings = getDefaultsFromSchema(visualization.settingsSchema);
    const newPreset: VisualizationPreset = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: formData.name,
      visualizationId: formData.visualizationId,
      settings: { ...defaultSettings, ...formData.settings },
    };

    onAddPreset(newPreset);
    setShowCreateModal(false);
    setFormData({ name: '', visualizationId: visualizationRegistry[0]?.id || '', settings: {} });
  };

  const handleUpdatePreset = (id: string) => {
    onUpdatePreset(id, formData);
    setEditingId(null);
    // Reset to default values, not empty - ensures next Create modal works
    setFormData({ name: '', visualizationId: visualizationRegistry[0]?.id || '', settings: {} });
  };

  const handleEditPreset = (preset: VisualizationPreset) => {
    setEditingId(preset.id);
    setFormData({
      name: preset.name,
      visualizationId: preset.visualizationId,
      settings: preset.settings,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowCreateModal(false);
    // Reset to default values, not empty - ensures next Create modal works
    setFormData({ name: '', visualizationId: visualizationRegistry[0]?.id || '', settings: {} });
  };

  const handleVisualizationChange = (vizId: string) => {
    const visualization = getVisualization(vizId);
    if (!visualization) return;

    const defaultSettings = getDefaultsFromSchema(visualization.settingsSchema);
    setFormData({
      ...formData,
      visualizationId: vizId,
      settings: { ...defaultSettings, ...(formData.settings || {}) },
    });
  };

  const editingPreset = editingId ? presets.find(p => p.id === editingId) : null;
  const editingVisualization = editingPreset ? getVisualization(editingPreset.visualizationId) : null;
  const formVisualization = formData.visualizationId ? getVisualization(formData.visualizationId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">
          Visualization Presets
        </h3>
        <button
          onClick={() => {
            // Reset form data to defaults when opening create modal
            const defaultVizId = visualizationRegistry[0]?.id || '';
            const defaultViz = getVisualization(defaultVizId);
            const defaultSettings = defaultViz ? getDefaultsFromSchema(defaultViz.settingsSchema) : {};
            setFormData({ name: '', visualizationId: defaultVizId, settings: defaultSettings });
            setShowCreateModal(true);
          }}
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
            const visualization = getVisualization(preset.visualizationId);
            const isActive = preset.id === activePresetId;
            const isEditing = editingId === preset.id;

            return (
              <div
                key={preset.id}
                className={`bg-zinc-950 border rounded-lg overflow-hidden transition-all ${
                  isActive ? 'border-orange-500' : 'border-zinc-800'
                }`}
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

                    {editingVisualization && (
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                          Visualization
                        </label>
                        <select
                          value={formData.visualizationId || ''}
                          onChange={(e) => handleVisualizationChange(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                        >
                          {visualizationRegistry.map((viz) => (
                            <option key={viz.id} value={viz.id}>
                              {viz.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {editingVisualization && editingVisualization.settingsSchema.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                          Settings
                        </label>
                        <SettingsRenderer
                          schema={editingVisualization.settingsSchema}
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
                  <>
                    <div className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={preset.enabled !== false}
                        onChange={(e) => {
                          onUpdatePreset(preset.id, { enabled: e.target.checked });
                        }}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-900 cursor-pointer"
                        title="Show in visualization list"
                      />
                      <button
                        onClick={() => onSetActivePreset(isActive ? null : preset.id)}
                        className={`flex-1 text-left ${
                          isActive ? 'text-orange-500' : 'text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {visualization && (
                            <Settings2 size={16} className={isActive ? 'text-orange-500' : 'text-zinc-500'} />
                          )}
                          <span className="font-medium text-sm">{preset.name}</span>
                          {isActive && (
                            <span className="text-xs text-orange-500 font-bold">ACTIVE</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {visualization?.name || 'Unknown'} • {Object.keys(preset.settings).length} settings
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
                  </>
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
                <h3 className="text-lg font-bold text-zinc-200">Create Visualization Preset</h3>
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
                    placeholder="e.g., Fireplace - Cozy"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                    Visualization
                  </label>
                  <select
                    value={formData.visualizationId || ''}
                    onChange={(e) => handleVisualizationChange(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                  >
                    {visualizationRegistry.map((viz) => (
                      <option key={viz.id} value={viz.id}>
                        {viz.name}
                      </option>
                    ))}
                  </select>
                </div>

                {formVisualization && formVisualization.settingsSchema.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                      Settings
                    </label>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                      <SettingsRenderer
                        schema={formVisualization.settingsSchema}
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
                    disabled={!formData.name || !formData.visualizationId}
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

