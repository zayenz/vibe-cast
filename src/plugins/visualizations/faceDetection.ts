/**
 * Face Detection Utility
 * 
 * Uses face-api.js to detect faces in images and calculate optimal
 * crop positions to keep faces visible when using object-fit: cover.
 */

import * as faceapi from 'face-api.js';

// Track model loading state
let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;

// Cache for face positions (path -> position)
const facePositionCache = new Map<string, FacePosition>();

export interface FacePosition {
  x: number;  // Percentage (0-100) for object-position X
  y: number;  // Percentage (0-100) for object-position Y
  hasFaces: boolean;
  isPortrait: boolean;
  
  // Face region info (for smart cropping)
  faceRegion: {
    x: number;      // Left edge as percentage (0-100)
    y: number;      // Top edge as percentage (0-100)
    width: number;  // Width as percentage (0-100)
    height: number; // Height as percentage (0-100)
  };
}

/**
 * Load the TinyFaceDetector model.
 * This is the smallest and fastest face detection model.
 * Models are loaded from a CDN.
 */
export async function loadFaceDetectionModels(): Promise<void> {
  if (modelsLoaded) return;
  
  if (modelsLoading) {
    return modelsLoading;
  }
  
  modelsLoading = (async () => {
    try {
      console.log('[FaceDetection] Loading TinyFaceDetector model...');
      
      // Load from jsDelivr CDN (face-api.js models)
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      
      modelsLoaded = true;
      console.log('[FaceDetection] Model loaded successfully');
    } catch (error) {
      console.error('[FaceDetection] Failed to load model:', error);
      modelsLoading = null;
      throw error;
    }
  })();
  
  return modelsLoading;
}

/**
 * Check if models are loaded
 */
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Load an image from URL and create an HTMLImageElement
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    
    img.src = src;
  });
}

/**
 * Detect faces in an image and calculate optimal crop position.
 * 
 * @param imageSrc - The image URL (can be asset:// protocol)
 * @returns FacePosition with x, y percentages for object-position
 */
export async function detectFacePosition(imageSrc: string): Promise<FacePosition> {
  // Check cache first
  if (facePositionCache.has(imageSrc)) {
    return facePositionCache.get(imageSrc)!;
  }
  
  // Default position (center, full image)
  const defaultPosition: FacePosition = {
    x: 50,
    y: 50,
    hasFaces: false,
    isPortrait: false,
    faceRegion: { x: 0, y: 0, width: 100, height: 100 }
  };
  
  try {
    // Ensure models are loaded
    if (!modelsLoaded) {
      await loadFaceDetectionModels();
    }
    
    // Load the image
    const img = await loadImage(imageSrc);
    
    // Check if portrait
    const isPortrait = img.height > img.width;
    
    // Detect faces using TinyFaceDetector with improved settings
    // - inputSize: 512 for better accuracy (was 320)
    // - scoreThreshold: 0.3 to catch faces with sunglasses (was 0.5)
    const detections = await faceapi.detectAllFaces(
      img,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 512,  // Larger = more accurate, especially for small/occluded faces
        scoreThreshold: 0.3  // Lower threshold to catch faces with sunglasses
      })
    );
    
    console.log(`[FaceDetection] Found ${detections.length} faces in image (${img.width}x${img.height})`);
    
    if (detections.length === 0) {
      // No faces detected - show upper portion for portraits (where faces usually are)
      const result: FacePosition = {
        x: 50,
        y: isPortrait ? 25 : 50,
        hasFaces: false,
        isPortrait,
        faceRegion: isPortrait 
          ? { x: 0, y: 0, width: 100, height: 60 }  // Upper 60% for portraits
          : { x: 0, y: 0, width: 100, height: 100 } // Full image for landscape
      };
      facePositionCache.set(imageSrc, result);
      return result;
    }
    
    // Calculate the bounding box that contains all faces (with padding)
    const FACE_PADDING = 0.3;  // 30% padding around faces
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const detection of detections) {
      const box = detection.box;
      const padW = box.width * FACE_PADDING;
      const padH = box.height * FACE_PADDING;
      minX = Math.min(minX, box.x - padW);
      minY = Math.min(minY, box.y - padH);
      maxX = Math.max(maxX, box.x + box.width + padW);
      maxY = Math.max(maxY, box.y + box.height + padH);
    }
    
    // Clamp to image bounds
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(img.width, maxX);
    maxY = Math.min(img.height, maxY);
    
    // Calculate face region as percentages
    const faceRegion = {
      x: (minX / img.width) * 100,
      y: (minY / img.height) * 100,
      width: ((maxX - minX) / img.width) * 100,
      height: ((maxY - minY) / img.height) * 100
    };
    
    console.log(`[FaceDetection] Face region: ${faceRegion.width.toFixed(1)}% x ${faceRegion.height.toFixed(1)}% at (${faceRegion.x.toFixed(1)}%, ${faceRegion.y.toFixed(1)}%)`);
    
    // Calculate center of all faces
    const faceCenterX = (minX + maxX) / 2;
    const faceCenterY = (minY + maxY) / 2;
    
    // Convert to percentage
    const x = (faceCenterX / img.width) * 100;
    const y = (faceCenterY / img.height) * 100;
    
    const result: FacePosition = {
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(10, Math.min(90, y)),
      hasFaces: true,
      isPortrait,
      faceRegion
    };
    
    console.log(`[FaceDetection] Result: center=${result.x.toFixed(1)}%,${result.y.toFixed(1)}%`);
    
    console.log(`[FaceDetection] Face position: ${result.x.toFixed(1)}% x ${result.y.toFixed(1)}%`);
    
    facePositionCache.set(imageSrc, result);
    return result;
    
  } catch (error) {
    console.error('[FaceDetection] Error detecting faces:', error);
    facePositionCache.set(imageSrc, defaultPosition);
    return defaultPosition;
  }
}

/**
 * Detect face positions for multiple images in parallel.
 * Useful for batch preloading.
 */
export async function detectFacePositionsBatch(
  imageSrcs: string[],
  concurrency: number = 2
): Promise<Map<string, FacePosition>> {
  const results = new Map<string, FacePosition>();
  
  // Process in batches to avoid overwhelming the browser
  for (let i = 0; i < imageSrcs.length; i += concurrency) {
    const batch = imageSrcs.slice(i, i + concurrency);
    const promises = batch.map(async (src) => {
      const position = await detectFacePosition(src);
      results.set(src, position);
    });
    
    await Promise.all(promises);
  }
  
  return results;
}

/**
 * Clear the face position cache
 */
export function clearFacePositionCache(): void {
  facePositionCache.clear();
}

/**
 * Get cached position if available
 */
export function getCachedFacePosition(imageSrc: string): FacePosition | undefined {
  return facePositionCache.get(imageSrc);
}

