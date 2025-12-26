/**
 * Photo Slideshow Visualization Plugin
 * 
 * Displays a slideshow of images from local folders or Apple Photos shared albums.
 * Features multiple transition effects and configurable display duration.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../utils/settings';

// Helper to convert file paths to displayable URLs
function getImageUrl(filePath: string): string {
  // Use Tauri's convertFileSrc for asset protocol
  const converted = convertFileSrc(filePath);
  console.log(`[Photo Slideshow] Image URL conversion:
    Original: ${filePath}
    Converted: ${converted}`);
  return converted;
}

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'select',
    id: 'sourceType',
    label: 'Image Source',
    options: [
      { value: 'local', label: 'Local Folder' },
      { value: 'photos', label: 'Apple Photos (macOS only)' }
    ],
    default: 'local'
  },
  {
    type: 'text',
    id: 'folderPath',
    label: 'Folder Path',
    default: '',
    placeholder: 'Click Browse to select folder',
    actionButton: 'folder'
  },
  {
    type: 'text',
    id: 'photosAlbumName',
    label: 'Photos Album Name',
    default: '',
    placeholder: 'Click button to select album',
    actionButton: 'album'
  },
  {
    type: 'range',
    id: 'displayDuration',
    label: 'Display Duration (seconds)',
    min: 1,
    max: 60,
    step: 1,
    default: 5
  },
  {
    type: 'range',
    id: 'transitionDuration',
    label: 'Transition Duration (seconds)',
    min: 0.2,
    max: 3,
    step: 0.1,
    default: 0.8
  },
  {
    type: 'boolean',
    id: 'randomOrder',
    label: 'Random Order',
    default: false
  },
  {
    type: 'boolean',
    id: 'enableFade',
    label: 'Fade Transition',
    default: true
  },
  {
    type: 'boolean',
    id: 'enableSlide',
    label: 'Slide Transition',
    default: true
  },
  {
    type: 'boolean',
    id: 'enableZoom',
    label: 'Zoom Transition',
    default: true
  },
  {
    type: 'boolean',
    id: 'enable3DRotate',
    label: '3D Rotate Transition',
    default: true
  },
  {
    type: 'boolean',
    id: 'enableCube',
    label: 'Cube Transition',
    default: false
  },
  {
    type: 'boolean',
    id: 'enableFlip',
    label: 'Flip Transition',
    default: true
  },
  {
    type: 'select',
    id: 'fitMode',
    label: 'Image Fit',
    options: [
      { value: 'cover', label: 'Cover (fill screen)' },
      { value: 'contain', label: 'Contain (show full image)' },
      { value: 'fill', label: 'Fill (stretch)' }
    ],
    default: 'cover'
  }
];

// ============================================================================
// Types
// ============================================================================

type TransitionType = 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 
                      'zoomIn' | 'zoomOut' | 'rotate3DX' | 'rotate3DY' | 'cube' | 'flip';

interface TransitionStyle {
  opacity?: number;
  transform?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getAvailableTransitions(settings: Record<string, unknown>): TransitionType[] {
  const transitions: TransitionType[] = [];
  
  if (getBooleanSetting(settings.enableFade, true)) {
    transitions.push('fade');
  }
  if (getBooleanSetting(settings.enableSlide, true)) {
    transitions.push('slideLeft', 'slideRight', 'slideUp', 'slideDown');
  }
  if (getBooleanSetting(settings.enableZoom, true)) {
    transitions.push('zoomIn', 'zoomOut');
  }
  if (getBooleanSetting(settings.enable3DRotate, true)) {
    transitions.push('rotate3DX', 'rotate3DY');
  }
  if (getBooleanSetting(settings.enableCube, false)) {
    transitions.push('cube');
  }
  if (getBooleanSetting(settings.enableFlip, true)) {
    transitions.push('flip');
  }
  
  return transitions.length > 0 ? transitions : ['fade'];
}

function getTransitionStyles(
  transition: TransitionType,
  phase: 'enter' | 'active' | 'exit'
): TransitionStyle {
  const styles: Record<TransitionType, Record<string, TransitionStyle>> = {
    fade: {
      enter: { opacity: 0 },
      active: { opacity: 1 },
      exit: { opacity: 0 }
    },
    slideLeft: {
      enter: { transform: 'translateX(100%)', opacity: 1 },
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(-100%)', opacity: 1 }
    },
    slideRight: {
      enter: { transform: 'translateX(-100%)', opacity: 1 },
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(100%)', opacity: 1 }
    },
    slideUp: {
      enter: { transform: 'translateY(100%)', opacity: 1 },
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(-100%)', opacity: 1 }
    },
    slideDown: {
      enter: { transform: 'translateY(-100%)', opacity: 1 },
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(100%)', opacity: 1 }
    },
    zoomIn: {
      enter: { transform: 'scale(0.8)', opacity: 0 },
      active: { transform: 'scale(1)', opacity: 1 },
      exit: { transform: 'scale(1.2)', opacity: 0 }
    },
    zoomOut: {
      enter: { transform: 'scale(1.2)', opacity: 0 },
      active: { transform: 'scale(1)', opacity: 1 },
      exit: { transform: 'scale(0.8)', opacity: 0 }
    },
    rotate3DX: {
      enter: { transform: 'perspective(1000px) rotateX(90deg)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateX(0deg)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateX(-90deg)', opacity: 0 }
    },
    rotate3DY: {
      enter: { transform: 'perspective(1000px) rotateY(90deg)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateY(0deg)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateY(-90deg)', opacity: 0 }
    },
    cube: {
      enter: { transform: 'perspective(1000px) rotateY(90deg)', opacity: 1 },
      active: { transform: 'perspective(1000px) rotateY(0deg)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateY(-90deg)', opacity: 1 }
    },
    flip: {
      enter: { transform: 'perspective(1000px) rotateY(180deg)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateY(0deg)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateY(-180deg)', opacity: 0 }
    }
  };
  
  return styles[transition][phase];
}

// ============================================================================
// Component
// ============================================================================

const PhotoSlideshowVisualization: React.FC<VisualizationProps> = ({
  commonSettings,
  customSettings,
}) => {
  const { dim } = commonSettings;
  const sourceType = getStringSetting(customSettings.sourceType, 'local');
  const folderPath = getStringSetting(customSettings.folderPath, '');
  const photosAlbumName = getStringSetting(customSettings.photosAlbumName, '');
  const displayDuration = getNumberSetting(customSettings.displayDuration, 5, 1, 60);
  const transitionDuration = getNumberSetting(customSettings.transitionDuration, 0.8, 0.2, 3);
  const randomOrder = getBooleanSetting(customSettings.randomOrder, false);
  const fitMode = getStringSetting(customSettings.fitMode, 'cover');
  
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTransition, setCurrentTransition] = useState<TransitionType>('fade');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const timerRef = useRef<number | null>(null);
  const preloadedImages = useRef<Map<string, HTMLImageElement>>(new Map());
  
  // Load images from source
  const loadImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[Photo Slideshow] Loading images...', { sourceType, folderPath, photosAlbumName });
      
      let imagePaths: string[] = [];
      
      if (sourceType === 'local' && folderPath) {
        console.log('[Photo Slideshow] Listing images in folder:', folderPath);
        imagePaths = await invoke<string[]>('list_images_in_folder', { folderPath });
        console.log('[Photo Slideshow] Found', imagePaths.length, 'images in folder');
      } else if (sourceType === 'photos' && photosAlbumName) {
        console.log('[Photo Slideshow] Getting photos from album:', photosAlbumName);
        imagePaths = await invoke<string[]>('get_photos_from_album', { albumName: photosAlbumName });
        console.log('[Photo Slideshow] Found', imagePaths.length, 'photos in album');
      } else {
        console.log('[Photo Slideshow] No source configured');
        setLoading(false);
        return;
      }
      
      if (imagePaths.length === 0) {
        console.error('[Photo Slideshow] No images found');
        setError('No images found. Please select a folder or album with images.');
        setImages([]);
        setLoading(false);
        return;
      }
      
      console.log(`[Photo Slideshow] Successfully loaded ${imagePaths.length} images from ${sourceType}`);
      
      const orderedImages = randomOrder ? shuffleArray(imagePaths) : imagePaths;
      setImages(orderedImages);
      setCurrentIndex(0);
      
      // Start showing images immediately - no need to wait for preloading
      setLoading(false);
      setError(null);
      
      // Preload first few images in background
      setTimeout(() => {
        console.log('[Photo Slideshow] Preloading first 3 images');
        orderedImages.slice(0, 3).forEach((path, idx) => {
          const img = new Image();
          const imgUrl = getImageUrl(path);
          img.src = imgUrl;
          img.onload = () => console.log(`[Photo Slideshow] Preloaded image ${idx + 1}`);
          img.onerror = (e) => console.error(`[Photo Slideshow] Failed to preload image ${idx + 1}:`, imgUrl, e);
          preloadedImages.current.set(path, img);
        });
      }, 100);
      
    } catch (err) {
      console.error('[Photo Slideshow] ERROR loading images:', err);
      setError(`Failed to load images: ${err instanceof Error ? err.message : String(err)}`);
      setImages([]);
      setLoading(false);
    }
  }, [sourceType, folderPath, photosAlbumName, randomOrder]);
  
  // Load images when settings change
  useEffect(() => {
    if ((sourceType === 'local' && folderPath) || (sourceType === 'photos' && photosAlbumName)) {
      loadImages();
    }
  }, [loadImages, sourceType, folderPath, photosAlbumName]);
  
  // Preload next images
  useEffect(() => {
    if (images.length === 0) return;
    
    const nextIndices = [currentIndex + 1, currentIndex + 2].map(i => i % images.length);
    nextIndices.forEach(idx => {
      const path = images[idx];
      if (!preloadedImages.current.has(path)) {
        const img = new Image();
        img.src = convertFileSrc(path);
        preloadedImages.current.set(path, img);
      }
    });
    
    // Clean up old images
    const keepIndices = new Set([
      currentIndex,
      ...nextIndices,
      (currentIndex - 1 + images.length) % images.length
    ]);
    
    const keysToDelete: string[] = [];
    preloadedImages.current.forEach((_, path) => {
      const idx = images.indexOf(path);
      if (idx >= 0 && !keepIndices.has(idx)) {
        keysToDelete.push(path);
      }
    });
    keysToDelete.forEach(key => preloadedImages.current.delete(key));
    
  }, [currentIndex, images]);
  
  // Auto-advance timer
  useEffect(() => {
    if (images.length === 0 || isTransitioning) return;
    
    timerRef.current = window.setTimeout(() => {
      advanceToNext();
    }, displayDuration * 1000);
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentIndex, images.length, displayDuration, isTransitioning]);
  
  const advanceToNext = () => {
    if (images.length === 0) return;
    
    const availableTransitions = getAvailableTransitions(customSettings);
    const nextTransition = availableTransitions[Math.floor(Math.random() * availableTransitions.length)];
    
    setCurrentTransition(nextTransition);
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
      setIsTransitioning(false);
    }, transitionDuration * 1000);
  };
  
  const currentImage = images[currentIndex];
  const currentPhase = isTransitioning ? 'exit' : 'active';
  const currentStyles = currentImage ? getTransitionStyles(currentTransition, currentPhase) : {};
  
  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ opacity: dim }}
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8 max-w-lg">
            <div className="text-orange-500 text-3xl mb-4">📷</div>
            <div className="text-zinc-300 font-medium mb-2 text-lg">Unable to Load Images</div>
            <div className="text-zinc-400 text-sm mb-4 px-4">{error}</div>
            
            {sourceType === 'photos' && (
              <div className="text-zinc-600 text-xs mt-4 space-y-2 bg-zinc-900/50 rounded-lg p-4">
                <p className="font-medium text-zinc-500">Troubleshooting:</p>
                <ul className="text-left space-y-1">
                  <li>• Make sure Photos.app is running</li>
                  <li>• Try a different album</li>
                  <li>• For shared albums: export manually to a folder, then use "Local Folder" option</li>
                </ul>
              </div>
            )}
            
            {sourceType === 'local' && (
              <div className="text-zinc-600 text-xs mt-4">
                Use the "Browse" button in settings to select a folder with images.
              </div>
            )}
          </div>
        </div>
      )}
      
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="text-zinc-400 text-lg">Loading images...</div>
          <div className="text-zinc-600 text-sm max-w-md text-center px-4">
            {sourceType === 'photos' 
              ? (
                <>
                  <p>Exporting photos from Apple Photos...</p>
                  <p className="mt-2 text-zinc-500">Album: <span className="text-zinc-400">{photosAlbumName}</span></p>
                  <p className="mt-1 text-xs text-zinc-600">
                    First export may take several minutes for large albums.
                    <br />Results are cached for faster future loads.
                  </p>
                </>
              )
              : `Reading images from folder...`}
          </div>
          <div className="w-32 h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400 animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '100%' }} />
          </div>
          <style>{`
            @keyframes loading {
              0%, 100% { transform: translateX(-100%); }
              50% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}
      
      {!error && !loading && images.length > 0 && currentImage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={getImageUrl(currentImage)}
            alt={`Photo ${currentIndex + 1} of ${images.length}`}
            className="max-w-full max-h-full"
            style={{
              objectFit: fitMode as 'cover' | 'contain' | 'fill',
              width: fitMode === 'cover' || fitMode === 'fill' ? '100%' : 'auto',
              height: fitMode === 'cover' || fitMode === 'fill' ? '100%' : 'auto',
              transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
              opacity: currentStyles.opacity ?? 1,
              transform: currentStyles.transform ?? 'none',
            }}
            onError={(e) => {
              console.error('[Photo Slideshow] Failed to load image:', currentImage);
              console.error('[Photo Slideshow] Error event:', e);
            }}
            onLoad={() => {
              console.log('[Photo Slideshow] Image loaded successfully:', currentIndex + 1);
            }}
          />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const PhotoSlideshowPlugin: VisualizationPlugin = {
  id: 'photo-slideshow',
  name: 'Photo Slideshow',
  description: 'Display photos from folders or Apple Photos with smooth transitions',
  icon: 'Images',
  settingsSchema,
  component: PhotoSlideshowVisualization,
};

