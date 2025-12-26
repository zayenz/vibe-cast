/**
 * Photo Slideshow Visualization Plugin
 * 
 * Displays a slideshow of images from local folders or Apple Photos shared albums.
 * Features multiple transition effects, configurable display duration, and
 * face-aware cropping to keep faces visible in portrait images.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../utils/settings';
import { 
  loadFaceDetectionModels, 
  detectFacePosition, 
  FacePosition
} from './faceDetection';

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
  },
  {
    type: 'boolean',
    id: 'smartCrop',
    label: 'Smart Crop (Face Detection)',
    default: true
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
    // Symmetric slides: exit left → enter from right
    slideLeft: {
      enter: { transform: 'translateX(100%)', opacity: 1 },  // Enter from right
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(-100%)', opacity: 1 }   // Exit to left
    },
    // Symmetric slides: exit right → enter from left
    slideRight: {
      enter: { transform: 'translateX(-100%)', opacity: 1 }, // Enter from left
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(100%)', opacity: 1 }    // Exit to right
    },
    // Symmetric slides: exit up → enter from bottom
    slideUp: {
      enter: { transform: 'translateY(100%)', opacity: 1 },  // Enter from bottom
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(-100%)', opacity: 1 }   // Exit to top
    },
    // Symmetric slides: exit down → enter from top
    slideDown: {
      enter: { transform: 'translateY(-100%)', opacity: 1 }, // Enter from top
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(100%)', opacity: 1 }    // Exit to bottom
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
  const smartCrop = getBooleanSetting(customSettings.smartCrop, true);
  
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTransition, setCurrentTransition] = useState<TransitionType>('fade');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [facePositions, setFacePositions] = useState<Map<string, FacePosition>>(new Map());
  // Map from image path to ready-to-display blob URL
  const [readyImages, setReadyImages] = useState<Map<string, string>>(new Map());
  
  const timerRef = useRef<number | null>(null);
  // Store blob URLs for cleanup
  const blobUrls = useRef<Map<string, string>>(new Map());
  // Track in-progress loading to avoid duplicates
  const loadingPromises = useRef<Map<string, Promise<string | null>>>(new Map());
  
  // Preload an image: fetch as blob, create URL, decode, and return ready URL
  const preloadImage = useCallback(async (path: string): Promise<string | null> => {
    // Already have a ready blob URL
    if (blobUrls.current.has(path)) {
      return blobUrls.current.get(path)!;
    }
    
    // Already loading - wait for it
    if (loadingPromises.current.has(path)) {
      return loadingPromises.current.get(path)!;
    }
    
    // Start loading
    const promise = (async (): Promise<string | null> => {
      try {
        const imgUrl = getImageUrl(path);
        console.log('[Photo Slideshow] Fetching image:', path.split('/').pop());
        
        // Fetch image as blob
        const response = await fetch(imgUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // Decode to ensure fully ready for display
        const img = new Image();
        img.src = blobUrl;
        await img.decode();
        
        console.log('[Photo Slideshow] Image ready:', path.split('/').pop());
        blobUrls.current.set(path, blobUrl);
        setReadyImages(prev => new Map(prev).set(path, blobUrl));
        loadingPromises.current.delete(path);
        return blobUrl;
      } catch (err) {
        console.error('[Photo Slideshow] Failed to preload:', path, err);
        loadingPromises.current.delete(path);
        return null;
      }
    })();
    
    loadingPromises.current.set(path, promise);
    return promise;
  }, []);
  
  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      console.log('[Photo Slideshow] Cleaning up blob URLs');
      blobUrls.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrls.current.clear();
    };
  }, []);
  
  // Load face detection models on mount if smart crop is enabled
  useEffect(() => {
    if (smartCrop && !faceModelsLoaded) {
      console.log('[Photo Slideshow] Loading face detection models...');
      loadFaceDetectionModels()
        .then(() => {
          console.log('[Photo Slideshow] Face detection models loaded');
          setFaceModelsLoaded(true);
        })
        .catch((err) => {
          console.error('[Photo Slideshow] Failed to load face detection models:', err);
          // Continue without face detection
        });
    }
  }, [smartCrop, faceModelsLoaded]);
  
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
      setError(null);
      
      // Preload first image as blob before showing (so it appears instantly)
      const firstPath = orderedImages[0];
      const firstImgUrl = getImageUrl(firstPath);
      
      console.log('[Photo Slideshow] Fetching first image before display...');
      
      try {
        const response = await fetch(firstImgUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // Decode to ensure fully ready
        const firstImg = new Image();
        firstImg.src = blobUrl;
        await firstImg.decode();
        
        console.log('[Photo Slideshow] First image ready, showing slideshow');
        blobUrls.current.set(firstPath, blobUrl);
        setReadyImages(prev => new Map(prev).set(firstPath, blobUrl));
        setLoading(false);
        
        // Run face detection on first image
        if (smartCrop) {
          detectFacePosition(blobUrl).then(facePos => {
            setFacePositions(prev => new Map(prev).set(firstPath, facePos));
          }).catch(console.error);
        }
      } catch (err) {
        console.error('[Photo Slideshow] Failed to load first image:', err);
        setLoading(false);
      }
      
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
  
  // Proactively preload next 3 images and run face detection
  useEffect(() => {
    if (images.length === 0) return;
    
    // Preload current image and next 3
    const indicesToPreload = [0, 1, 2, 3].map(i => (currentIndex + i) % images.length);
    
    indicesToPreload.forEach(async (idx) => {
      const path = images[idx];
      
      // Preload image using the blob-based preload function
      const blobUrl = await preloadImage(path);
      
      // Run face detection if enabled, not already cached, and we have a blob URL
      if (blobUrl && smartCrop && faceModelsLoaded && !facePositions.has(path)) {
        try {
          const facePos = await detectFacePosition(blobUrl);
          setFacePositions(prev => new Map(prev).set(path, facePos));
        } catch (err) {
          console.error('[Photo Slideshow] Face detection failed:', err);
        }
      }
    });
    
    // Clean up old blob URLs that are far from current (but keep face positions cached)
    const keepIndices = new Set(indicesToPreload);
    keepIndices.add((currentIndex - 1 + images.length) % images.length);
    
    const keysToDelete: string[] = [];
    blobUrls.current.forEach((_, path) => {
      const idx = images.indexOf(path);
      if (idx >= 0 && !keepIndices.has(idx)) {
        keysToDelete.push(path);
      }
    });
    keysToDelete.forEach(key => {
      const blobUrl = blobUrls.current.get(key);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      blobUrls.current.delete(key);
      setReadyImages(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    });
    
  }, [currentIndex, images, smartCrop, faceModelsLoaded, facePositions, preloadImage]);
  
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
  
  const advanceToNext = async () => {
    if (images.length === 0) return;
    
    const nextIdx = (currentIndex + 1) % images.length;
    const nextPath = images[nextIdx];
    
    // Ensure next image has a ready blob URL before transitioning
    if (!readyImages.has(nextPath)) {
      console.log('[Photo Slideshow] Waiting for next image to be ready...');
      const blobUrl = await preloadImage(nextPath);
      if (!blobUrl) {
        console.error('[Photo Slideshow] Failed to prepare next image, skipping');
        // Skip to the one after if this one failed
        setCurrentIndex(nextIdx);
        return;
      }
    }
    
    const availableTransitions = getAvailableTransitions(customSettings);
    const nextTransition = availableTransitions[Math.floor(Math.random() * availableTransitions.length)];
    
    setCurrentTransition(nextTransition);
    setNextIndex(nextIdx);
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(nextIdx);
      setNextIndex(null);
      setIsTransitioning(false);
    }, transitionDuration * 1000);
  };
  
  const currentImage = images[currentIndex];
  const nextImage = nextIndex !== null ? images[nextIndex] : null;
  
  // Get face positions for both images
  const currentFacePosition = currentImage ? facePositions.get(currentImage) : undefined;
  const nextFacePosition = nextImage ? facePositions.get(nextImage) : undefined;
  
  // Pre-fetch face position for current image if not available
  useEffect(() => {
    const blobUrl = currentImage ? readyImages.get(currentImage) : undefined;
    if (smartCrop && faceModelsLoaded && currentImage && blobUrl && !facePositions.has(currentImage)) {
      detectFacePosition(blobUrl).then(facePos => {
        setFacePositions(prev => new Map(prev).set(currentImage, facePos));
      }).catch(console.error);
    }
  }, [currentImage, smartCrop, faceModelsLoaded, facePositions, readyImages]);
  
  // Container ref for the image display area
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate smart crop: pan and zoom to show all faces while maximizing fill
  const getSmartCropStyle = (facePosition: FacePosition | undefined): React.CSSProperties => {
    // If smart crop disabled or no face data, use standard object-fit
    if (!smartCrop || fitMode !== 'cover' || !facePosition) {
      return {
        objectFit: fitMode as 'cover' | 'contain' | 'fill',
        objectPosition: 'center center',
        width: '100%',
        height: '100%',
      };
    }
    
    const { faceRegion, hasFaces, isPortrait } = facePosition;
    
    // If no faces in portrait, show upper portion with cover
    if (!hasFaces && isPortrait) {
      return {
        objectFit: 'cover',
        objectPosition: '50% 25%',
        width: '100%',
        height: '100%',
      };
    }
    
    // If no faces and not portrait, use default cover
    if (!hasFaces) {
      return {
        objectFit: 'cover',
        objectPosition: 'center center',
        width: '100%',
        height: '100%',
      };
    }
    
    // Calculate center of face region
    const faceCenterX = faceRegion.x + faceRegion.width / 2;
    const faceCenterY = faceRegion.y + faceRegion.height / 2;
    
    // Simple strategy:
    // - If faces span >65% of image width or height → use contain (show full image with black bars if needed)
    // - Otherwise → use cover mode centered on faces (fill screen, may crop edges)
    
    const faceSpan = Math.max(faceRegion.width, faceRegion.height);
    
    console.log(`[Photo Slideshow] Face region: ${faceRegion.width.toFixed(1)}% x ${faceRegion.height.toFixed(1)}% at center (${faceCenterX.toFixed(1)}%, ${faceCenterY.toFixed(1)}%), span: ${faceSpan.toFixed(1)}%`);
    
    if (faceSpan > 65) {
      // Faces are spread wide - use contain to ensure all faces visible
      // This may show black bars, but that's OK to show all faces
      console.log(`[Photo Slideshow] Faces spread wide (${faceSpan.toFixed(1)}%), using contain mode`);
      return {
        objectFit: 'contain',
        objectPosition: 'center center',  // Center the whole image
        width: '100%',
        height: '100%',
      };
    }
    
    // Faces are concentrated in a region - use cover mode centered on faces
    // This fills the screen and keeps faces in view
    console.log(`[Photo Slideshow] Faces concentrated, using cover centered on faces`);
    return {
      objectFit: 'cover',
      objectPosition: `${faceCenterX}% ${faceCenterY}%`,
      width: '100%',
      height: '100%',
    };
  };
  
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
      
      {!error && !loading && images.length > 0 && currentImage && readyImages.has(currentImage) && (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          {/* Current image (exiting during transition) - uses pre-decoded blob URL */}
          <img
            key={`current-${currentIndex}`}
            src={readyImages.get(currentImage)!}
            alt={`Photo ${currentIndex + 1} of ${images.length}`}
            className="absolute inset-0"
            style={{
              ...getSmartCropStyle(currentFacePosition),
              transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
              ...getTransitionStyles(currentTransition, isTransitioning ? 'exit' : 'active'),
            }}
            onError={(e) => {
              console.error('[Photo Slideshow] Failed to display image:', currentImage);
              console.error('[Photo Slideshow] Error event:', e);
            }}
          />
          
          {/* Next image (entering during transition) - uses pre-decoded blob URL */}
          {isTransitioning && nextImage && readyImages.has(nextImage) && (
            <img
              key={`next-${nextIndex}`}
              src={readyImages.get(nextImage)!}
              alt={`Photo ${nextIndex! + 1} of ${images.length}`}
              className="absolute inset-0"
              style={{
                ...getSmartCropStyle(nextFacePosition),
                transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                ...getTransitionStyles(currentTransition, 'enter'),
              }}
              onError={(e) => {
                console.error('[Photo Slideshow] Failed to display next image:', nextImage);
                console.error('[Photo Slideshow] Error event:', e);
              }}
            />
          )}
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

