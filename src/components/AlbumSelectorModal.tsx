/**
 * Album Selector Modal
 * 
 * Searchable modal for selecting albums from Apple Photos
 */

import React, { useState, useMemo } from 'react';

interface AlbumSelectorModalProps {
  albums: string[];
  onSelect: (albumName: string) => void;
  onCancel: () => void;
}

export const AlbumSelectorModal: React.FC<AlbumSelectorModalProps> = ({
  albums,
  onSelect,
  onCancel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter albums based on search query
  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) {
      return albums;
    }
    
    const query = searchQuery.toLowerCase();
    return albums.filter(album => 
      album.toLowerCase().includes(query)
    );
  }, [albums, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-zinc-100">
              Select Album
            </h2>
            <button
              onClick={onCancel}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search albums..."
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 pl-11 text-zinc-200 placeholder-zinc-500 focus:border-orange-500 focus:outline-none transition-colors"
            />
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Results Count */}
          <div className="mt-3 text-sm text-zinc-400">
            {filteredAlbums.length === albums.length ? (
              <span>{albums.length} albums</span>
            ) : (
              <span>{filteredAlbums.length} of {albums.length} albums</span>
            )}
          </div>
        </div>

        {/* Album List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAlbums.length > 0 ? (
            <div className="space-y-1">
              {filteredAlbums.map((album) => (
                <button
                  key={album}
                  onClick={() => onSelect(album)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{album}</span>
                    <svg 
                      className="w-5 h-5 text-zinc-600 group-hover:text-orange-500 transition-colors flex-shrink-0 ml-2"
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg 
                className="w-16 h-16 mx-auto text-zinc-600 mb-4"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-zinc-500">No albums match your search</p>
              <p className="text-zinc-600 text-sm mt-2">Try a different search term</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

