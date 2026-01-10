/**
 * Photo Slideshow Visualization Plugin
 * 
 * Displays a slideshow of images and videos from local folders or Apple Photos shared albums.
 * Features multiple transition effects, configurable display duration, and
 * face-aware cropping to keep faces visible in portrait images.
 * Videos play to completion before advancing to the next item.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../utils/settings';
import { FacePosition } from './faceDetection';
import { 
  TransitionType, 
  getAvailableTransitions, 
  getTransitionStyles 
} from './utils/transitions';
import { usePhotoSlideshow, isVideoFile } from './hooks/usePhotoSlideshow';

// ============================================================================
// Settings Schema
// ============================================================================

export const settingsSchema: SettingDefinition[] = [
  {
    type: 'select',
    id: 'sourceType',
    label: 'Media Source',
    options: [
      { value: 'local', label: 'Local Folder' }
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
    default: true
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
    label: 'Media Fit',
    options: [
      { value: 'cover', label: 'Cover (fill screen)' },
      { value: 'contain', label: 'Contain (show full media)' },
      { value: 'mosaic', label: 'Mosaic (2 portraits side-by-side)' },
      { value: 'fill', label: 'Fill (stretch)' }
    ],
    default: 'contain'
  },
  {
    type: 'boolean',
    id: 'smartCrop',
    label: 'Smart Crop (Face Detection)',
    default: false
  },
  {
    type: 'boolean',
    id: 'videoSound',
    label: 'Play Video Sound',
    default: true
  },
  {
    type: 'range',
    id: 'videoVolume',
    label: 'Video Volume',
    min: 0,
    max: 100,
    step: 5,
    default: 50
  },
  {
    type: 'text',
    id: 'markerText',
    label: 'Marker Text',
    default: '',
    placeholder: 'Optional overlay text (e.g., "Using default photos")'
  }
];

// ============================================================================
// Component
// ============================================================================

const PhotoSlideshowVisualization: React.FC<VisualizationProps> = ({
  commonSettings,
  customSettings,
}) => {
  const { dim } = commonSettings;
  const sourceType = getStringSetting(customSettings.sourceType, 'local');
  const transitionDuration = getNumberSetting(customSettings.transitionDuration, 0.8, 0.2, 3);
  const fitMode = getStringSetting(customSettings.fitMode, 'cover');
  const smartCrop = getBooleanSetting(customSettings.smartCrop, true);
  const videoSound = getBooleanSetting(customSettings.videoSound, true);
  const videoVolume = getNumberSetting(customSettings.videoVolume, 50, 0, 100);
  const markerText = getStringSetting(customSettings.markerText, '');
  
  const [currentTransition, setCurrentTransition] = useState<TransitionType>('fade');
  const [enterPhase, setEnterPhase] = useState<'enter' | 'active'>('enter');

  const onBeforeAdvance = useCallback(() => {
    const availableTransitions = getAvailableTransitions(customSettings);
    const nextTransition = availableTransitions[Math.floor(Math.random() * availableTransitions.length)];
    setCurrentTransition(nextTransition);
    
    // Set enterPhase to 'enter' BEFORE isTransitioning so entering element renders in enter position first
    setEnterPhase('enter');
  }, [customSettings]);

  const {
    loading,
    error,
    usingExamplePhotos,
    images,
    currentIndex,
    nextIndex,
    isTransitioning,
    currentImage,
    nextImage,
    currentBlobUrl,
    nextBlobUrl,
    useMosaic,
    mosaicPartner,
    mosaicPartnerUrl,
    currentFacePosition,
    nextFacePosition,
    onVideoRef,
    readyImages
  } = usePhotoSlideshow(customSettings, onBeforeAdvance);
  
  // Trigger enter animation: transition from 'enter' to 'active' after initial render
  useEffect(() => {
    if (isTransitioning && enterPhase === 'enter') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEnterPhase('active');
        });
      });
    }
  }, [isTransitioning, enterPhase]);
  
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
    
    const faceCenterX = faceRegion.x + faceRegion.width / 2;
    const faceCenterY = faceRegion.y + faceRegion.height / 2;
    const faceSpan = Math.max(faceRegion.width, faceRegion.height);
    
    if (faceSpan > 65) {
      return {
        objectFit: 'contain',
        objectPosition: 'center center',
        width: '100%',
        height: '100%',
      };
    }
    
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
            Reading images from folder...
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
      
      {!error && !loading && markerText && (
        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2 z-20 pointer-events-none">
          <span className="text-xs text-white/60 font-medium">{markerText}</span>
        </div>
      )}
      
      {!error && !loading && images.length > 0 && currentImage && currentBlobUrl && (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          {/* Mosaic mode: Two portrait images side by side, always contain (never stretched) */}
          {useMosaic && mosaicPartner && mosaicPartnerUrl ? (
            <div className="absolute inset-0 flex justify-between items-center bg-black">
              {/* Left image - anchored to left, contained within its half */}
              <div className="h-full flex items-center" style={{ width: '49%' }}>
                <img
                  key={`mosaic-left-${currentIndex}`}
                  src={currentBlobUrl}
                  alt={`Photo ${currentIndex + 1}`}
                  loading="eager"
                  style={{
                    maxHeight: '100%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    imageRendering: 'auto',
                    willChange: 'opacity, transform',
                    transition: `opacity ${transitionDuration}s ease-in-out`,
                    ...getTransitionStyles(currentTransition, isTransitioning ? 'exit' : 'active'),
                  }}
                  onError={(e) => console.error('[Photo Slideshow] Failed to display image:', currentImage, e)}
                />
              </div>
              {/* Right image - anchored to right, contained within its half */}
              <div className="h-full flex items-center justify-end" style={{ width: '49%' }}>
                <img
                  key={`mosaic-right-${nextIndex}`}
                  src={mosaicPartnerUrl}
                  alt={`Photo ${nextIndex! + 1}`} // Note: nextIndex here is conceptually "current + 1" for mosaic partner
                  loading="eager"
                  style={{
                    maxHeight: '100%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    imageRendering: 'auto',
                    willChange: 'opacity',
                    transition: `opacity ${transitionDuration}s ease-in-out`,
                  }}
                  onError={(e) => console.error('[Photo Slideshow] Failed to display mosaic partner:', mosaicPartner, e)}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Current media (exiting during transition) - uses pre-decoded blob URL */}
              {isVideoFile(currentImage) ? (
                <video
                  ref={(el) => {
                    onVideoRef(el);
                    if (el) el.volume = videoVolume / 100;
                  }}
                  key={`current-video-${currentIndex}`}
                  src={currentBlobUrl}
                  autoPlay
                  playsInline
                  muted={!videoSound}
                  className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : fitMode === 'fill' ? 'object-fill' : 'object-cover'}`}
                  style={{
                    transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                    ...getTransitionStyles(currentTransition, isTransitioning ? 'exit' : 'active'),
                  }}
                  onError={(e) => console.error('[Photo Slideshow] Failed to display video:', currentImage, e)}
                />
              ) : (
                <>
                  <img
                    key={`current-${currentIndex}`}
                    src={currentBlobUrl}
                    alt={`Photo ${currentIndex + 1} of ${images.length}`}
                    loading="eager"
                    className="absolute inset-0"
                    style={{
                      ...getSmartCropStyle(currentFacePosition),
                      imageRendering: 'auto',
                      willChange: 'opacity, transform',
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(currentTransition, isTransitioning ? 'exit' : 'active'),
                    }}
                    onError={(e) => console.error('[Photo Slideshow] Failed to display image:', currentImage, e)}
                  />
                  {/* Subtle loading indicator for images still decoding */}
                  {currentImage && readyImages && !readyImages.has(currentImage) && (
                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                      <span className="text-xs text-white/80 font-medium">Decoding...</span>
                    </div>
                  )}
                </>
              )}
              
              {/* Next media (entering during transition) - uses pre-decoded blob URL */}
              {isTransitioning && nextImage && nextBlobUrl && !useMosaic && (
                isVideoFile(nextImage) ? (
                  <video
                    ref={(el) => {
                      if (el) el.volume = videoVolume / 100;
                    }}
                    key={`next-video-${nextIndex}`}
                    src={nextBlobUrl}
                    autoPlay
                    playsInline
                    muted={!videoSound}
                    className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : fitMode === 'fill' ? 'object-fill' : 'object-cover'}`}
                    style={{
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(currentTransition, enterPhase),
                    }}
                    onError={(e) => console.error('[Photo Slideshow] Failed to display next video:', nextImage, e)}
                  />
                ) : (
                  <img
                    key={`next-${nextIndex}`}
                    src={nextBlobUrl}
                    alt={`Photo ${nextIndex! + 1} of ${images.length}`}
                    loading="eager"
                    className="absolute inset-0"
                    style={{
                      ...getSmartCropStyle(nextFacePosition),
                      imageRendering: 'auto',
                      willChange: 'opacity, transform',
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(currentTransition, enterPhase),
                    }}
                    onError={(e) => console.error('[Photo Slideshow] Failed to display next image:', nextImage, e)}
                  />
                )
              )}
            </>
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
  description: 'Display photos and videos from folders or Apple Photos with smooth transitions',
  icon: 'Image',
  settingsSchema,
  component: PhotoSlideshowVisualization,
};
