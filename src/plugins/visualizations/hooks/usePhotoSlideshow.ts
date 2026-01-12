import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { resolveResource } from '@tauri-apps/api/path';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../../utils/settings';
import { 
  loadFaceDetectionModels, 
  detectFacePosition, 
  FacePosition
} from '../faceDetection';

// Helper to convert file paths to displayable URLs
function getMediaUrl(filePath: string): string {
  // Use Tauri's convertFileSrc for asset protocol
  const converted = convertFileSrc(filePath);
  return converted;
}

// Video file extensions
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'];

// Check if a file path is a video
export function isVideoFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTENSIONS.includes(ext);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function usePhotoSlideshow(
  customSettings: Record<string, unknown>,
  onBeforeAdvance?: (nextIndex: number) => void
) {
  const folderPath = getStringSetting(customSettings.folderPath, '');
  const displayDuration = getNumberSetting(customSettings.displayDuration, 5, 1, 60);
  const transitionDuration = getNumberSetting(customSettings.transitionDuration, 0.8, 0.2, 3);
  const randomOrder = getBooleanSetting(customSettings.randomOrder, false);
  const fitMode = getStringSetting(customSettings.fitMode, 'cover');
  const smartCrop = getBooleanSetting(customSettings.smartCrop, true);
  // Video settings logic handled here? 
  // videoSound/videoVolume are used by the renderer (video tag), not the logic, except for identifying video files.
  
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [facePositions, setFacePositions] = useState<Map<string, FacePosition>>(new Map());
  // Map from image path to ready-to-display blob URL
  const [readyImages, setReadyImages] = useState<Map<string, string>>(new Map());
  // Track whether images are portrait (height > width)
  const [imageOrientations, setImageOrientations] = useState<Map<string, boolean>>(new Map());
  const [usingExamplePhotos, setUsingExamplePhotos] = useState(false);
  
  const timerRef = useRef<number | null>(null);
  // Store blob URLs for cleanup
  const blobUrls = useRef<Map<string, string>>(new Map());
  // Track in-progress loading to avoid duplicates
  const loadingPromises = useRef<Map<string, Promise<string | null>>>(new Map());
  // Track current video element to listen for 'ended' event
  // We need to expose a ref callback or something for the video element? 
  // Or just expose a function "registerVideoElement(el)"?
  // Actually, we can just return a ref logic or expose a "videoEnded" callback.
  const currentVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Generate a unique key for this slideshow instance based on source
  const storageKey = `photo-slideshow-${folderPath}`;
  
  // Preload media: fetch as blob, create URL, decode/preload, and return ready URL
  const preloadMedia = useCallback(async (path: string): Promise<string | null> => {
    // Already have a ready blob URL
    if (blobUrls.current.has(path)) {
      return blobUrls.current.get(path)!;
    }
    
    // Already loading - wait for it
    if (loadingPromises.current.has(path)) {
      return loadingPromises.current.get(path)!;
    }
    
    const isVideo = isVideoFile(path);
    
    // Start loading with timeout to prevent promise accumulation
    const promise = (async (): Promise<string | null> => {
      const timeoutMs = 30000; // 30 second timeout
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      
      try {
        const mediaUrl = getMediaUrl(path);
        
        // Set up timeout that will reject the promise if it takes too long
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Preload timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        });
        
        // Fetch media as blob
        const fetchPromise = (async () => {
          const response = await fetch(mediaUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          if (isVideo) {
            // For videos, preload enough data to start playing
            const video = document.createElement('video');
            video.preload = 'auto';
            video.src = blobUrl;
            
            // Wait for video to be ready to play
            await new Promise<void>((resolve, reject) => {
              video.oncanplaythrough = () => resolve();
              video.onerror = () => reject(new Error('Video load failed'));
              // Timeout after 10 seconds
              setTimeout(() => resolve(), 10000);
            });
          } else {
            // For images, ensure complete load and decode
            const img = new Image();
            img.src = blobUrl;
            
            // Wait for complete load AND decode
            await new Promise<void>((resolve, reject) => {
              img.onload = async () => {
                try {
                  // Ensure decode is complete
                  await img.decode();
                  
                  // Detect orientation for mosaic mode
                  const isPortrait = img.naturalHeight > img.naturalWidth;
                  setImageOrientations(prev => new Map(prev).set(path, isPortrait));
                  resolve();
                } catch (err) {
                  reject(err);
                }
              };
              img.onerror = () => reject(new Error('Image load failed'));
              // Timeout after 10 seconds
              setTimeout(() => resolve(), 10000);
            });
          }
          
          return blobUrl;
        })();
        
        // Race between fetch and timeout
        const blobUrl = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Clear timeout if we succeeded
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Only mark as ready after everything is complete
        blobUrls.current.set(path, blobUrl);
        setReadyImages(prev => new Map(prev).set(path, blobUrl));
        loadingPromises.current.delete(path);
        return blobUrl;
      } catch (err) {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error('[Photo Slideshow] Failed to preload:', path, err);
        loadingPromises.current.delete(path);
        return null;
      }
    })();
    
    loadingPromises.current.set(path, promise);
    return promise;
  }, []);
  
  // Cleanup
  useEffect(() => {
    const urls = blobUrls.current;
    const promises = loadingPromises.current;
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urls.clear();
      promises.clear();
    };
  }, []);
  
  // Load face detection models
  useEffect(() => {
    if (smartCrop && !faceModelsLoaded) {
      loadFaceDetectionModels()
        .then(() => setFaceModelsLoaded(true))
        .catch(console.error);
    }
  }, [smartCrop, faceModelsLoaded]);
  
  // Load images from source
  const loadImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let imagePaths: string[] = [];
      let isExample = false;
      
      let targetPath = folderPath;
      
      if (!targetPath) {
        try {
          targetPath = await resolveResource('kittens');
          console.log('[Photo Slideshow] Resolved kittens resource path:', targetPath);
          isExample = true;
        } catch (_e) {
          console.warn('[Photo Slideshow] Failed to resolve kittens resource:', _e);
        }
      }
      
      if (targetPath) {
        imagePaths = await invoke<string[]>('list_images_in_folder', { folderPath: targetPath });
        console.log(`[Photo Slideshow] Found ${imagePaths.length} images in ${targetPath}`);
      }
      
      setUsingExamplePhotos(isExample);
      
      if (imagePaths.length === 0) {
        setError(isExample 
          ? 'No default images found.' 
          : 'No images found. Please select a folder or album with images.');
        setImages([]);
        setLoading(false);
        return;
      }
      
      const orderedImages = randomOrder ? shuffleArray(imagePaths) : imagePaths;
      setImages(orderedImages);
      
      // Restore saved position
      let startIndex = 0;
      try {
        const savedPosition = localStorage.getItem(storageKey);
        if (savedPosition) {
          const savedIndex = parseInt(savedPosition, 10);
          if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < orderedImages.length) {
            startIndex = savedIndex;
          }
        }
      } catch (_err) {
        // ignore
      }
      
      setCurrentIndex(startIndex);
      setError(null);
      
      // Preload first image
      const firstPath = orderedImages[startIndex];
      const firstImgUrl = getMediaUrl(firstPath);
      
      try {
        const response = await fetch(firstImgUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        blobUrls.current.set(firstPath, blobUrl);
        setLoading(false);
        
        // Decode in background
        const firstImg = new Image();
        firstImg.src = blobUrl;
        firstImg.decode()
          .then(() => {
            const isPortrait = firstImg.naturalHeight > firstImg.naturalWidth;
            setImageOrientations(prev => new Map(prev).set(firstPath, isPortrait));
            setReadyImages(prev => new Map(prev).set(firstPath, blobUrl));
          })
          .catch(() => {
            setReadyImages(prev => new Map(prev).set(firstPath, blobUrl));
          });
        
        if (smartCrop) {
          detectFacePosition(blobUrl).then(facePos => {
            setFacePositions(prev => new Map(prev).set(firstPath, facePos));
          }).catch(console.error);
        }
      } catch (_e) {
        console.error(_e);
        setLoading(false);
      }
      
    } catch (err) {
      setError(`Failed to load images: ${err instanceof Error ? err.message : String(err)}`);
      setImages([]);
      setLoading(false);
    }
  }, [folderPath, randomOrder, storageKey, smartCrop]);
  
  // Trigger load
  useEffect(() => {
    loadImages();
  }, [loadImages, folderPath]);
  
  // Save position
  useEffect(() => {
    if (images.length === 0) return;
    try {
      localStorage.setItem(storageKey, currentIndex.toString());
    } catch {
      // ignore
    }
  }, [currentIndex, images.length, storageKey]);
  
  // Preload next
  useEffect(() => {
    if (images.length === 0) return;
    
    const indicesToPreload = [0, 1, 2, 3].map(i => (currentIndex + i) % images.length);
    
    indicesToPreload.forEach(async (idx) => {
      const path = images[idx];
      const blobUrl = await preloadMedia(path);
      
      if (blobUrl && smartCrop && faceModelsLoaded && !facePositions.has(path)) {
        detectFacePosition(blobUrl).then(facePos => {
          setFacePositions(prev => new Map(prev).set(path, facePos));
        }).catch(console.error);
      }
    });
    
    // Cleanup old blobUrls not in preload window
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
    
  }, [currentIndex, images, smartCrop, faceModelsLoaded, facePositions, preloadMedia]);
  
  // Advance function
  const advanceToNext = useCallback(async () => {
    if (images.length === 0) return;
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    const currentImage = images[currentIndex];
    
    // Check mosaic logic
    const currentIsPortrait = currentImage ? imageOrientations.get(currentImage) : false;
    const nextIdx = (currentIndex + 1) % images.length;
    const nextPath = images[nextIdx];
    const nextIsPortrait = imageOrientations.get(nextPath);
    const wasMosaic = fitMode === 'mosaic' && currentIsPortrait && nextIsPortrait && !isVideoFile(currentImage);
    
    const targetIdx = wasMosaic ? (currentIndex + 2) % images.length : nextIdx;
    const targetPath = images[targetIdx];
    
    if (!blobUrls.current.has(targetPath)) {
      const blobUrl = await preloadMedia(targetPath);
      if (!blobUrl) {
        setCurrentIndex(targetIdx);
        return;
      }
    }
    
    if (onBeforeAdvance) {
      onBeforeAdvance(targetIdx);
    }
    
    setNextIndex(targetIdx);
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(targetIdx);
      setNextIndex(null);
      setIsTransitioning(false);
    }, transitionDuration * 1000);
  }, [images, currentIndex, fitMode, imageOrientations, preloadMedia, transitionDuration, onBeforeAdvance]);

  // Auto-advance timer
  const currentPath = images[currentIndex];
  const isCurrentImageReady = currentPath ? readyImages.has(currentPath) : false;

  useEffect(() => {
    if (images.length === 0 || isTransitioning || !isCurrentImageReady) return;
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    const nextIdx = (currentIndex + 1) % images.length;
    const nextPath = images[nextIdx];
    preloadMedia(nextPath);
    
    const isVideo = isVideoFile(currentPath);
    
    if (isVideo) {
      const handleVideoEnded = () => {
        advanceToNext();
      };
      
      if (currentVideoRef.current) {
        currentVideoRef.current.addEventListener('ended', handleVideoEnded);
      }
      
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (currentVideoRef.current) {
          currentVideoRef.current.removeEventListener('ended', handleVideoEnded);
        }
      };
    } else {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        advanceToNext();
      }, displayDuration * 1000);
      
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [currentIndex, images, displayDuration, isTransitioning, isCurrentImageReady, currentPath, preloadMedia, advanceToNext]);
  
  // Computed values for rendering
  const currentImage = images[currentIndex];
  const nextImage = nextIndex !== null ? images[nextIndex] : null;
  
  const getBlobUrl = (path: string | null): string | undefined => {
    if (!path) return undefined;
    return readyImages.get(path) || blobUrls.current.get(path);
  };
  
  const currentBlobUrl = getBlobUrl(currentImage);
  const nextBlobUrl = getBlobUrl(nextImage);
  
  const currentIsPortrait = currentImage ? imageOrientations.get(currentImage) : false;
  const nextIsPortrait = nextImage ? imageOrientations.get(nextImage) : false;
  const useMosaic = fitMode === 'mosaic' && 
                    currentIsPortrait && 
                    !isVideoFile(currentImage) &&
                    images.length > 1;
                    
  const mosaicNextIdx = (currentIndex + 1) % images.length;
  const mosaicPartnerPath = images[mosaicNextIdx];
  const mosaicPartnerLoaded = mosaicPartnerPath ? readyImages.has(mosaicPartnerPath) : false;
  const mosaicPartner = useMosaic && nextIsPortrait && mosaicPartnerLoaded ? mosaicPartnerPath : null;
  const mosaicPartnerUrl = mosaicPartner ? readyImages.get(mosaicPartner) : undefined;
  
  const currentFacePosition = currentImage ? facePositions.get(currentImage) : undefined;
  const nextFacePosition = nextImage ? facePositions.get(nextImage) : undefined;
  
  // Video ref callback
  const onVideoRef = useCallback((el: HTMLVideoElement | null) => {
    currentVideoRef.current = el;
  }, []);

  return {
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
    advanceToNext,
    readyImages
  };
}
