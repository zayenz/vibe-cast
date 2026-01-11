import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { VisualizationPlugin, VisualizationProps } from '../types';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../utils/settings';
import { FacePosition } from './faceDetection';
import { 
  getAvailableTransitions, 
  getTransitionStyles 
} from './utils/transitions';
import { usePhotoSlideshow, isVideoFile } from './hooks/usePhotoSlideshow';
import { settingsSchema as photoSlideshowSettingsSchema } from './PhotoSlideshowPlugin';

// ============================================================================
// Component
// ============================================================================

const TransitionDemoVisualization: React.FC<VisualizationProps> = ({
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
  
  const [enterPhase, setEnterPhase] = useState<'enter' | 'active'>('enter');

  const onBeforeAdvance = useCallback(() => {
    // Set enterPhase to 'enter' BEFORE isTransitioning so entering element renders in enter position first
    setEnterPhase('enter');
  }, []);

  // Stabilize demo settings so they don't change every frame (audio updates)
  const fitModeSetting = getStringSetting(customSettings.fitMode, 'cover');
  const displayDurationSetting = getNumberSetting(customSettings.displayDuration, 2, 1, 60);

  const demoSettings = useMemo(() => ({
    ...customSettings,
    fitMode: fitModeSetting === 'mosaic' ? 'contain' : fitModeSetting,
    displayDuration: displayDurationSetting
  }), [customSettings, fitModeSetting, displayDurationSetting]);

  const {
    loading,
    error,
    images,
    currentIndex,
    nextIndex,
    isTransitioning,
    currentImage,
    nextImage,
    currentBlobUrl,
    nextBlobUrl,
    currentFacePosition,
    nextFacePosition,
    onVideoRef,
    readyImages
  } = usePhotoSlideshow(demoSettings, onBeforeAdvance);
  
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
  
  // Reset enterPhase when transition completes
  useEffect(() => {
    if (!isTransitioning && enterPhase === 'active') {
      // Reset to 'enter' so next transition starts correctly
      setTimeout(() => setEnterPhase('enter'), 0);
    }
  }, [isTransitioning, enterPhase]);

  // Get available transitions based on settings
  const transitions = useMemo(() => getAvailableTransitions(customSettings), [customSettings]);
  
  // Calculate grid dimensions
  const count = transitions.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  // Calculate smart crop (reused logic)
  const getSmartCropStyle = (facePosition: FacePosition | undefined): React.CSSProperties => {
    if (!smartCrop || fitMode !== 'cover' || !facePosition) {
      return {
        objectFit: fitMode as 'cover' | 'contain' | 'fill',
        objectPosition: 'center center',
        width: '100%',
        height: '100%',
      };
    }
    
    const { faceRegion, hasFaces, isPortrait } = facePosition;
    
    if (!hasFaces && isPortrait) {
      return {
        objectFit: 'cover',
        objectPosition: '50% 25%',
        width: '100%',
        height: '100%',
      };
    }
    
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
                Use the &quot;Browse&quot; button in settings to select a folder with images.
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
        </div>
      )}
      
      {!error && !loading && markerText && (
        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2 z-20 pointer-events-none">
          <span className="text-xs text-white/60 font-medium">{markerText}</span>
        </div>
      )}
      
      {!error && !loading && images.length > 0 && currentImage && currentBlobUrl && (
        <div 
          className="absolute inset-0 grid gap-1 p-1"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {transitions.map((transition, index) => (
            <div key={transition} className="relative overflow-hidden bg-zinc-900 rounded-sm">
              {/* Transition Label */}
              <div className="absolute bottom-2 left-2 z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white/90 font-mono tracking-wide uppercase">
                {transition}
              </div>

              {/* Current media */}
              {isVideoFile(currentImage) ? (
                <video
                  key={`current-video-${transition}-${currentIndex}`}
                  ref={index === 0 ? (el) => {
                    onVideoRef(el);
                    if (el) el.volume = videoVolume / 100;
                  } : undefined} // Only first video drives events
                  src={currentBlobUrl}
                  autoPlay
                  playsInline
                  muted={!videoSound} // Should we mute others? Probably yes to avoid echo.
                  className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : fitMode === 'fill' ? 'object-fill' : 'object-cover'}`}
                  style={{
                    transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                    ...getTransitionStyles(transition, isTransitioning ? 'exit' : 'active'),
                  }}
                />
              ) : (
                <>
                  <img
                    key={`current-${transition}-${currentIndex}`}
                    src={currentBlobUrl}
                    alt={`Photo ${currentIndex + 1}`}
                    loading="eager"
                    className="absolute inset-0"
                    style={{
                      ...getSmartCropStyle(currentFacePosition),
                      imageRendering: 'auto',
                      willChange: 'opacity, transform',
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(transition, isTransitioning ? 'exit' : 'active'),
                    }}
                  />
                  {/* Loading indicator only on first cell */}
                  {index === 0 && currentImage && readyImages && !readyImages.has(currentImage) && (
                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                    </div>
                  )}
                </>
              )}
              
              {/* Next media */}
              {isTransitioning && nextImage && nextBlobUrl && (
                isVideoFile(nextImage) ? (
                  <video
                    key={`next-video-${transition}-${nextIndex}`}
                    src={nextBlobUrl}
                    autoPlay
                    playsInline
                    muted={!videoSound}
                    className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : fitMode === 'fill' ? 'object-fill' : 'object-cover'}`}
                    style={{
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(transition, enterPhase),
                    }}
                  />
                ) : (
                  <img
                    key={`next-${transition}-${nextIndex}`}
                    src={nextBlobUrl}
                    alt={`Photo ${nextIndex! + 1}`}
                    loading="eager"
                    className="absolute inset-0"
                    style={{
                      ...getSmartCropStyle(nextFacePosition),
                      imageRendering: 'auto',
                      willChange: 'opacity, transform',
                      transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
                      ...getTransitionStyles(transition, enterPhase),
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const TransitionDemoPlugin: VisualizationPlugin = {
  id: 'transition-demo',
  name: 'Transition Demo',
  description: 'Demo all transitions in a grid',
  icon: 'Grid',
  settingsSchema: photoSlideshowSettingsSchema,
  component: TransitionDemoVisualization,
};