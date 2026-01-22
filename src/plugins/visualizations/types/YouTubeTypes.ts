/**
 * YouTube Plugin Types and Interfaces
 * 
 * Defines error states, configuration, and player state management
 * for the enhanced YouTube visualization plugin.
 */

// Error classification for YouTube player issues
export enum YouTubeErrorType {
  // Network-related errors
  NETWORK_TIMEOUT = 'network_timeout',
  NETWORK_UNREACHABLE = 'network_unreachable',
  
  // Origin and CORS errors
  ORIGIN_REJECTED = 'origin_rejected',
  CORS_BLOCKED = 'cors_blocked',
  
  // API and loading errors
  API_LOAD_TIMEOUT = 'api_load_timeout',
  API_SCRIPT_BLOCKED = 'api_script_blocked',
  PLAYER_INIT_FAILED = 'player_init_failed',
  
  // Server and asset errors
  SERVER_UNAVAILABLE = 'server_unavailable',
  ASSET_NOT_FOUND = 'asset_not_found',
  
  // Security policy errors
  CSP_SCRIPT_BLOCKED = 'csp_script_blocked',
  CSP_FRAME_BLOCKED = 'csp_frame_blocked',
  
  // Configuration errors
  INVALID_CONFIG = 'invalid_config',
  INVALID_VIDEO_ID = 'invalid_video_id'
}

// Detailed error information with context
export interface YouTubeError {
  type: YouTubeErrorType;
  message: string;
  details?: any;
  timestamp: number;
  retryable: boolean;
  context?: ErrorContext;
}

// Error context for debugging and diagnostics
export interface ErrorContext {
  timestamp: number;
  environment: 'development' | 'production';
  protocol: string;
  origin: string;
  serverInfo: ServerInfo | null;
  userAgent: string;
  retryAttempt: number;
  previousErrors: YouTubeError[];
}

// Server information from Tauri backend
export interface ServerInfo {
  ip: string;
  port: number;
}

// YouTube player configuration
export interface YouTubePlayerConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  fallbackEnabled: boolean;
  debugMode: boolean;
}

// Default configuration values
export const DEFAULT_YOUTUBE_CONFIG: YouTubePlayerConfig = {
  maxRetries: 5,
  retryDelayMs: 1000, // Start with 1 second
  timeoutMs: 10000,   // 10 second timeout
  fallbackEnabled: true,
  debugMode: false
};

// Player state management
export interface YouTubePlayerState {
  status: 'loading' | 'ready' | 'error' | 'fallback' | 'retrying';
  serverUrl: string | null;
  error: YouTubeError | null;
  retryCount: number;
  isRetrying: boolean;
  config: YouTubePlayerConfig;
  serverInfo: ServerInfo | null;
}

// Initial player state
export const INITIAL_PLAYER_STATE: YouTubePlayerState = {
  status: 'loading',
  serverUrl: null,
  error: null,
  retryCount: 0,
  isRetrying: false,
  config: DEFAULT_YOUTUBE_CONFIG,
  serverInfo: null
};

// Environment detection result
export interface EnvironmentInfo {
  isHttpProtocol: boolean;
  isCustomProtocol: boolean;
  protocol: string;
  origin: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

// Asset serving strategy options
export enum AssetServingStrategy {
  TAURI_ASSET_PROTOCOL = 'tauri_asset_protocol',
  HTTP_SERVER = 'http_server',
  DIRECT_HTTP = 'direct_http'
}

// Asset serving result
export interface AssetServingResult {
  strategy: AssetServingStrategy;
  url: string;
  success: boolean;
  error?: YouTubeError;
}

// Retry configuration with exponential backoff
export interface RetryConfig {
  attempt: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// Calculate next retry delay with exponential backoff
export function calculateRetryDelay(config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, config.attempt),
    config.maxDelayMs
  );
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
}

// Create error with context
export function createYouTubeError(
  type: YouTubeErrorType,
  message: string,
  details?: any,
  context?: Partial<ErrorContext>
): YouTubeError {
  return {
    type,
    message,
    details,
    timestamp: Date.now(),
    retryable: isRetryableError(type),
    context: context as ErrorContext
  };
}

// Determine if error type is retryable
export function isRetryableError(type: YouTubeErrorType): boolean {
  const retryableErrors = [
    YouTubeErrorType.NETWORK_TIMEOUT,
    YouTubeErrorType.NETWORK_UNREACHABLE,
    YouTubeErrorType.API_LOAD_TIMEOUT,
    YouTubeErrorType.SERVER_UNAVAILABLE,
    YouTubeErrorType.ASSET_NOT_FOUND
  ];
  
  return retryableErrors.includes(type);
}

// Validate YouTube player configuration
export function validateYouTubeConfig(config: Partial<YouTubePlayerConfig>): YouTubePlayerConfig {
  return {
    maxRetries: Math.max(0, Math.min(config.maxRetries ?? DEFAULT_YOUTUBE_CONFIG.maxRetries, 10)),
    retryDelayMs: Math.max(100, Math.min(config.retryDelayMs ?? DEFAULT_YOUTUBE_CONFIG.retryDelayMs, 5000)),
    timeoutMs: Math.max(1000, Math.min(config.timeoutMs ?? DEFAULT_YOUTUBE_CONFIG.timeoutMs, 30000)),
    fallbackEnabled: config.fallbackEnabled ?? DEFAULT_YOUTUBE_CONFIG.fallbackEnabled,
    debugMode: config.debugMode ?? DEFAULT_YOUTUBE_CONFIG.debugMode
  };
}

// Environment detection helper
export function detectEnvironment(): EnvironmentInfo {
  const protocol = window.location.protocol;
  const origin = window.location.origin;
  
  return {
    isHttpProtocol: protocol.startsWith('http'),
    isCustomProtocol: protocol === 'tauri:' || protocol === 'asset:',
    protocol,
    origin,
    isDevelopment: protocol.startsWith('http') && origin.includes('localhost:1420'),
    isProduction: protocol === 'tauri:' || protocol === 'asset:'
  };
}