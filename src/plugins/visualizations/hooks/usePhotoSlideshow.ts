import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../../utils/settings';
import { 
  loadFaceDetectionModels, 
  detectFacePosition, 
  FacePosition
} from '../faceDetection';

// Helper to convert file paths to displayable URLs
function getMediaUrl(filePath: string): string {
  // If running via HTTP in production (Remote Web Interface), use the server endpoint
  // In Dev (Vite), we use Tauri's asset protocol support via invoke/convertFileSrc
  const isWebRemote = window.location.protocol.startsWith('http') && !import.meta.env.DEV;
  
  if (isWebRemote) {
    // Determine API base - use empty string for relative path (same origin)
    const apiBase = ''; 
    return `${apiBase}/api/images/serve?path=${encodeURIComponent(filePath)}`;
  }
  
  // Use Tauri's convertFileSrc for asset protocol (Desktop Dev & Prod)
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
  
  // Network resilience utilities
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  const isRetryableError = (error: unknown): boolean => {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network errors (connection failed, timeout, etc.)
      return true;
    }
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on network-related errors
      if (message.includes('network') || 
          message.includes('timeout') || 
          message.includes('connection') ||
          message.includes('fetch')) {
        return true;
      }
      
      // Check for HTTP status codes that are retryable
      const httpMatch = message.match(/http (\d+)/);
      if (httpMatch) {
        const status = parseInt(httpMatch[1], 10);
        // Retry on server errors (5xx) and some client errors
        return status >= 500 || status === 408 || status === 429;
      }
    }
    
    return false;
  };
  
  const fetchWithRetry = useCallback(async (
    url: string, 
    options: RequestInit = {},
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<Response> => {
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add timeout to fetch request
        const timeoutMs = 10000; // 10 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // If response is ok, return it
        if (response.ok) {
          return response;
        }
        
        // For non-ok responses, throw an error to trigger retry logic or final error
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
        
      } catch (error) {
        lastError = error;
        
        // If this is the last attempt or error is not retryable, throw
        if (attempt === maxRetries || !isRetryableError(error)) {
          throw error;
        }
        
        // Calculate exponential backoff delay with jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`[Photo Slideshow] Fetch attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms:`, error);
        
        await sleep(delay);
      }
    }
    
    // This should never be reached, but just in case
    throw lastError;
  }, []);

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
          const mediaUrl = getMediaUrl(path);
          const response = await fetchWithRetry(mediaUrl, {}, 2, 500); // Fewer retries for individual images
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
  }, [fetchWithRetry]);
  
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
    let imagePaths: string[] = [];
    let isExample = false;
    let fallbackAttempted = false;
    
    try {
      setLoading(true);
      setError(null);
      
      let targetPath = folderPath;
      
      // Enhanced fallback logic: try user folder first, then fallback to default
      const attemptLoadFromPath = async (path: string, isDefaultFallback: boolean = false): Promise<string[]> => {
        console.log(`[Photo Slideshow] Attempting to load images from: ${path}${isDefaultFallback ? ' (fallback)' : ''}`);
        
        // Check if we should use HTTP (Axum) or Tauri Invoke
        const isWebRemote = window.location.protocol.startsWith('http') && !import.meta.env.DEV;

        if (isWebRemote) {
          try {
            const response = await fetchWithRetry(`/api/images/list?folder=${encodeURIComponent(path)}`);
            return await parseApiResponse(response, path, isDefaultFallback);
          } catch (fetchError) {
            // Enhanced error reporting for network failures
            let errorMessage = 'Failed to connect to the photo slideshow API.';
            let diagnosticInfo = `Attempted URL: /api/images/list?folder=${encodeURIComponent(path)}`;
            
            if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
              errorMessage = 'Network connection failed after multiple retry attempts.';
              diagnosticInfo += '\nThis could be due to network issues or the server not running properly.';
            } else if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              errorMessage = 'Request timed out after multiple retry attempts.';
              diagnosticInfo += '\nThe server is taking too long to respond.';
            } else if (fetchError instanceof Error) {
              // Check if this was a retryable error that exhausted retries
              if (isRetryableError(fetchError)) {
                errorMessage = `Server error persisted after multiple retry attempts: ${fetchError.message}`;
                diagnosticInfo += '\nThe server appears to be experiencing issues.';
              } else {
                // Non-retryable error - pass through the original parsing error
                throw fetchError;
              }
            }
            
            throw new Error(
              `${errorMessage}\n\n` +
              'Please check your network connection and try again.\n\n' +
              `Diagnostic Information:\n${diagnosticInfo}\n` +
              `Network Error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
            );
          }
        } else {
          try {
            const result = await invoke<string[]>('list_images_in_folder', { folderPath: path });
            return Array.isArray(result) ? result : [];
          } catch (invokeError) {
            // Enhanced error handling for Tauri invoke errors
            const errorMessage = invokeError instanceof Error ? invokeError.message : String(invokeError);
            let guidance = '';
            
            if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
              guidance = isDefaultFallback 
                ? 'The default photo resources may not be properly bundled with the application.'
                : 'Please check that the selected folder exists and is accessible.';
            } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
              guidance = 'Please check folder permissions and ensure the application has access to read the directory.';
            } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
              guidance = 'The folder path may be invalid or contain unsupported characters.';
            } else {
              guidance = 'Please try selecting a different folder or restart the application if the issue persists.';
            }
            
            throw new Error(
              `Failed to load images via desktop API: ${errorMessage}\n\n` +
              `${guidance}\n\n` +
              'Diagnostic Information:\n' +
              `Tauri Command: list_images_in_folder\n` +
              `Folder Path: ${path}\n` +
              `Environment: Desktop (${import.meta.env.DEV ? 'Development' : 'Production'})`
            );
          }
        }
      };
      
      // Enhanced error detection for API responses
      const parseApiResponse = async (response: Response, targetPath: string, isDefaultFallback: boolean = false): Promise<string[]> => {
        // First, check if response is ok
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status} ${response.statusText}`;
          let diagnosticInfo = `Request: GET /api/images/list?folder=${encodeURIComponent(targetPath)}`;
          
          try {
            // Check content type to determine if we got JSON or HTML
            const contentType = response.headers.get('content-type') || '';
            
            if (contentType.includes('application/json')) {
              // Try to parse JSON error response
              const errorData = await response.json();
              if (errorData.error) {
                errorMessage = errorData.error;
                if (errorData.details) {
                  diagnosticInfo += `\nDetails: ${errorData.details}`;
                }
                if (errorData.code) {
                  diagnosticInfo += `\nError Code: ${errorData.code}`;
                }
              }
            } else if (contentType.includes('text/html')) {
              // Server returned HTML instead of JSON - likely SPA fallback
              errorMessage = 'Server returned HTML instead of JSON - API endpoint may not be working correctly';
              diagnosticInfo += `\nReceived Content-Type: ${contentType}`;
              diagnosticInfo += '\nThis usually indicates the API route is not properly configured or the server fell back to serving the SPA';
            } else {
              // Unknown content type - try to read as text
              const responseText = await response.text();
              if (responseText && responseText.trim().startsWith('<!DOCTYPE') || responseText && responseText.trim().startsWith('<html')) {
                errorMessage = 'Server returned HTML instead of JSON - API endpoint configuration issue detected';
                diagnosticInfo += '\nReceived HTML content when expecting JSON';
              } else {
                errorMessage = `Unexpected response format (Content-Type: ${contentType})`;
                const preview = responseText ? responseText.substring(0, 200) : 'No response content';
                diagnosticInfo += `\nResponse preview: ${preview}...`;
              }
            }
          } catch (parseError) {
            // If we can't parse the error response, provide diagnostic info
            diagnosticInfo += `\nFailed to parse error response: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
          }
          
          // Provide actionable guidance based on error type
          let guidance = '';
          if (response.status === 404) {
            guidance = isDefaultFallback 
              ? 'The default photo resources may not be properly bundled with the application.'
              : 'Please check that the selected folder exists and is accessible.';
          } else if (response.status === 403) {
            guidance = 'Please check folder permissions and ensure the application has access to read the directory.';
          } else if (response.status === 400) {
            guidance = 'The folder path may be invalid or contain unsupported characters.';
          } else if (response.status >= 500) {
            guidance = 'This appears to be a server error. Please try again or contact support if the issue persists.';
          } else if (errorMessage.includes('HTML instead of JSON')) {
            guidance = 'This is likely a configuration issue with the photo slideshow API. Please restart the application or contact support.';
          }
          
          const fullError = guidance 
            ? `${errorMessage}\n\n${guidance}\n\nDiagnostic Information:\n${diagnosticInfo}`
            : `${errorMessage}\n\nDiagnostic Information:\n${diagnosticInfo}`;
          
          throw new Error(fullError);
        }
        
        // Response is ok, now validate content type and parse JSON
        const contentType = response.headers.get('content-type') || '';
        
        if (!contentType.includes('application/json')) {
          // Got successful response but wrong content type
          let diagnosticInfo = `Expected: application/json, Received: ${contentType}`;
          
          if (contentType.includes('text/html')) {
            try {
              const responseText = await response.text();
              if (responseText && (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html'))) {
                throw new Error(
                  'Server returned HTML instead of JSON despite successful status code.\n\n' +
                  'This indicates the API endpoint is not properly configured.\n\n' +
                  `Diagnostic Information:\n${diagnosticInfo}\n` +
                  'Response appears to be the SPA fallback page.'
                );
              }
            } catch (_textError) {
              // If we can't read the text, just use the content type info
            }
          }
          
          throw new Error(
            'Server returned unexpected content type for image list.\n\n' +
            'Expected JSON response but received different format.\n\n' +
            `Diagnostic Information:\n${diagnosticInfo}`
          );
        }
        
        try {
          const data = await response.json();
          
          // Validate that we got an array
          if (!Array.isArray(data)) {
            const dataStr = JSON.stringify(data);
            const preview = dataStr ? dataStr.substring(0, 200) : 'Unable to stringify data';
            throw new Error(
              'Server returned invalid data format.\n\n' +
              'Expected an array of image paths but received different data structure.\n\n' +
              `Diagnostic Information:\nReceived data type: ${typeof data}\n` +
              `Data preview: ${preview}...`
            );
          }
          
          return data;
        } catch (jsonError) {
          if (jsonError instanceof SyntaxError) {
            // JSON parsing failed - we need to get a fresh response to read as text
            // Since we can't re-read the same response, we'll provide a generic error
            throw new Error(
              'Server returned malformed JSON response.\n\n' +
              'The response could not be parsed as valid JSON.\n\n' +
              'Diagnostic Information:\n' +
              `JSON Parse Error: ${jsonError.message}\n` +
              `Content-Type header: ${contentType}\n` +
              'This suggests the server returned invalid JSON or HTML disguised as JSON.'
            );
          } else {
            // Re-throw validation errors (like array validation)
            throw jsonError;
          }
        }
      };
      
      // First attempt: use specified folder or default to fallback
      if (!targetPath) {
        // No folder specified - go directly to fallback
        targetPath = '$RESOURCES/kittens';
        isExample = true;
        fallbackAttempted = true;
        console.log('[Photo Slideshow] No folder specified, using default fallback');
      }
      
      // Check if we should use HTTP (Axum) or Tauri Invoke
      const isWebRemote = window.location.protocol.startsWith('http') && !import.meta.env.DEV;
      
      try {
        imagePaths = await attemptLoadFromPath(targetPath, isExample);
      } catch (primaryError) {
        console.warn(`[Photo Slideshow] Primary load failed for path: ${targetPath}`, primaryError);
        
        // Check if this is an API configuration error that would affect fallback too
        const isApiConfigError = primaryError instanceof Error && (
          primaryError.message.includes('Server returned HTML instead of JSON') ||
          primaryError.message.includes('API endpoint may not be working') ||
          primaryError.message.includes('API endpoint configuration issue') ||
          primaryError.message.includes('text/html') ||
          primaryError.message.includes('<!DOCTYPE') ||
          primaryError.message.includes('<html')
        );
        
        // If the primary load failed and we haven't tried the fallback yet, try it now
        // But skip fallback if this looks like an API configuration issue that would affect all requests
        if (!fallbackAttempted && !isApiConfigError) {
          console.log('[Photo Slideshow] Attempting fallback to default photos');
          fallbackAttempted = true;
          
          try {
            imagePaths = await attemptLoadFromPath('$RESOURCES/kittens', true);
            isExample = true;
            
            // Log successful fallback for debugging
            console.log('[Photo Slideshow] Successfully fell back to default photos');
            
            // Enhance error message to indicate fallback was used
            const originalError = primaryError instanceof Error ? primaryError.message : String(primaryError);
            const fallbackMessage = `Original folder could not be loaded, using default photos instead.\n\nOriginal error: ${originalError}`;
            
            // Don't set this as an error since fallback succeeded, but log it
            console.warn('[Photo Slideshow] Fallback succeeded after primary failure:', fallbackMessage);
            
          } catch (fallbackError) {
            // Both primary and fallback failed - this is a critical error
            console.error('[Photo Slideshow] Both primary and fallback loading failed', { primaryError, fallbackError });
            
            const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
            const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            
            // Provide comprehensive error message explaining both failures
            const criticalError = new Error(
              'Failed to load images from both the selected folder and default fallback.\n\n' +
              `Selected folder error: ${primaryErrorMsg}\n\n` +
              `Default fallback error: ${fallbackErrorMsg}\n\n` +
              'This indicates a critical issue with the photo slideshow system. ' +
              'Please restart the application or contact support if the problem persists.\n\n' +
              'Diagnostic Information:\n' +
              `Primary path: ${targetPath}\n` +
              `Fallback path: $RESOURCES/kittens\n` +
              `Environment: ${isWebRemote ? 'Web Remote' : 'Desktop'} (${import.meta.env.DEV ? 'Development' : 'Production'})`
            );
            
            throw criticalError;
          }
        } else {
          // Either fallback was already attempted and failed, or this is an API config error
          console.error('[Photo Slideshow] Primary load failed, fallback not attempted', { 
            fallbackAttempted, 
            isApiConfigError, 
            error: primaryError 
          });
          
          if (isApiConfigError) {
            // API configuration errors should be shown immediately since fallback would likely fail too
            throw primaryError;
          } else {
            // Fallback was already attempted and failed
            const fallbackErrorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
            
            const fallbackFailureError = new Error(
              'Failed to load default photos from the application resources.\n\n' +
              `Error: ${fallbackErrorMsg}\n\n` +
              'This indicates the default photo resources may not be properly bundled with the application. ' +
              'Please restart the application or reinstall if the problem persists.\n\n' +
              'Diagnostic Information:\n' +
              `Fallback path: $RESOURCES/kittens\n` +
              `Environment: ${isWebRemote ? 'Web Remote' : 'Desktop'} (${import.meta.env.DEV ? 'Development' : 'Production'})\n` +
              'This is a critical system error that should not occur in normal operation.'
            );
            
            throw fallbackFailureError;
          }
        }
      }
      
      
      setUsingExamplePhotos(isExample);
      
      // Ensure imagePaths is always a valid array
      if (!Array.isArray(imagePaths)) {
        imagePaths = [];
      }
      
      if (imagePaths.length === 0) {
        const errorMsg = isExample 
          ? 'No default images found in the application resources.' 
          : 'No images found in the selected folder. Please select a folder containing images, or the system will use default photos.';
        
        // If we have no images and haven't tried fallback yet, try it now
        if (!isExample && !fallbackAttempted) {
          console.log('[Photo Slideshow] No images found in user folder, attempting fallback');
          try {
            imagePaths = await attemptLoadFromPath('$RESOURCES/kittens', true);
            isExample = true;
            setUsingExamplePhotos(true);
            
            if (imagePaths.length > 0) {
              console.log('[Photo Slideshow] Successfully loaded default photos after empty folder');
              // Continue with the default photos - don't set error
            } else {
              throw new Error('Default photos folder is empty');
            }
          } catch (fallbackError) {
            const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            setError(
              'No images found in the selected folder and default photos could not be loaded.\n\n' +
              `Selected folder: Empty\n` +
              `Default photos error: ${fallbackErrorMsg}\n\n` +
              'Please select a folder containing images or restart the application.'
            );
            setImages([]);
            setLoading(false);
            return;
          }
        } else {
          setError(errorMsg);
          setImages([]);
          setLoading(false);
          return;
        }
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
        const response = await fetchWithRetry(firstImgUrl, {}, 2, 500);
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
  }, [folderPath, randomOrder, storageKey, smartCrop, fetchWithRetry]);
  
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
