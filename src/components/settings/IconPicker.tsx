/**
 * Icon Picker Component
 * 
 * Allows users to select an icon from a comprehensive set of icons.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { IconName, iconOptions, getIcon } from '../../utils/iconSet';

interface IconPickerProps {
  selectedIcon?: string;
  onSelect: (icon: IconName | undefined) => void;
  size?: number;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  selectedIcon,
  onSelect,
  size = 24,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIcons = iconOptions.filter(icon =>
    icon.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    icon.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredByCategory: Record<string, typeof iconOptions> = {};
  filteredIcons.forEach(icon => {
    if (!filteredByCategory[icon.category]) {
      filteredByCategory[icon.category] = [];
    }
    filteredByCategory[icon.category].push(icon);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-12 h-12 bg-zinc-900 border border-zinc-700 rounded-lg hover:border-orange-500 transition-colors"
        title="Select icon"
      >
        {selectedIcon ? (
          <div className="text-zinc-300">
            {getIcon(selectedIcon as IconName, size)}
          </div>
        ) : (
          <div className="text-zinc-500 text-xs">Icon</div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-zinc-200">Select Icon</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search icons..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {Object.keys(filteredByCategory).length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm">
                    No icons found
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(filteredByCategory).map(([category, icons]) => (
                      <div key={category}>
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">
                          {category}
                        </h4>
                        <div className="grid grid-cols-8 gap-2">
                          {icons.map((icon) => {
                            const IconComponent = icon.component;
                            const isSelected = selectedIcon === icon.name;
                            return (
                              <button
                                key={icon.name}
                                type="button"
                                onClick={() => {
                                  onSelect(isSelected ? undefined : icon.name);
                                  setIsOpen(false);
                                }}
                                className={`flex items-center justify-center h-12 bg-zinc-950 border rounded-lg transition-all ${
                                  isSelected
                                    ? 'border-orange-500 bg-orange-500/10'
                                    : 'border-zinc-800 hover:border-zinc-700'
                                }`}
                                title={icon.label}
                              >
                                <IconComponent
                                  size={20}
                                  className={isSelected ? 'text-orange-500' : 'text-zinc-400'}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedIcon && (
                <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Selected: {selectedIcon}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(undefined);
                      setIsOpen(false);
                    }}
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

