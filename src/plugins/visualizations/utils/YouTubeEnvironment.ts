/**
 * YouTube Environment Detection and Server URL Resolution
 * 
 * Handles environment detection, server URL resolution, and asset serving
 * strategy selection for the YouTube player component.
 */

import { invoke } from '@tauri-apps/api/core';
import {
  EnvironmentInfo,
  ServerInfo,
  AssetServingStrategy,
  AssetServingResult,
  YouTubeErrorType,
  createYouTubeError,
  detectEnvironment
} from '../types/YouTubeTypes';

// Server availability validation timeout
const SERVER_VALIDATION_TIMEOUT = 5000;

/**
 * Resolves the appropriate server URL for serving YouTube player HTML
 * based on the current environment and available serving strategies.
 */
export class YouTubeEnvironmentResolver {
  private environmentInfo: EnvironmentInfo;
  private serverInfo: ServerInfo | null = null;
  private lastValidationTime: number = 0;
  private validationCacheMs: number = 30000; // Cache for 30 seconds

  constructor() {
    this.environmentInfo = detectEnvironment();
  }

  /**
   * Get the optimal server URL for the current environment
   */
  async getServerUrl(): Promise<AssetServingResult> {
    try {
      // For HTTP protocols (dev/web remote), use current origin
      if (this.environmentInfo.isHttpProtocol) {
        return await this.tryDirectHttpServing();
      }

      // For custom protocols (production), try asset protocol first, then HTTP fallback
      const assetResult = await this.tryAssetProtocolServing();
      if (assetResult.success) {
        return assetResult;
      }

      // Fallback to HTTP server
      return await this.tryHttpServerFallback();
    } catch (error) {
      return {
        strategy: AssetServingStrategy.HTTP_SERVER,
        url: '',
        success: false,
        error: createYouTubeError(
          YouTubeErrorType.SERVER_UNAVAILABLE,
          'Failed to resolve server URL',
          { originalError: error }
        )
      };
    }
  }

  /**
   * Try serving via direct HTTP (development/web remote)
   */
  private async tryDirectHttpServing(): Promise<AssetServingResult> {
    const url = `${this.environmentInfo.origin}/youtube_player.html`;
    
    try {
      const isAvailable = await this.validateAssetAvailability(url);
      
      return {
        strategy: AssetServingStrategy.DIRECT_HTTP,
        url,
        success: isAvailable,
        error: isAvailable ? undefined : createYouTubeError(
          YouTubeErrorType.ASSET_NOT_FOUND,
          'YouTube player HTML not found at direct HTTP URL',
          { url }
        )
      };
    } catch (error) {
      return {
        strategy: AssetServingStrategy.DIRECT_HTTP,
        url,
        success: false,
        error: createYouTubeError(
          YouTubeErrorType.NETWORK_UNREACHABLE,
          'Failed to validate direct HTTP asset availability',
          { url, originalError: error }
        )
      };
    }
  }

  /**
   * Try serving via Tauri asset protocol (production primary)
   */
  private async tryAssetProtocolServing(): Promise<AssetServingResult> {
    // In production, try to serve directly via asset protocol
    const assetUrl = 'asset://localhost/youtube_player.html';
    
    try {
      // For asset protocol, we can't easily validate availability
      // so we assume it's available if we're in the right environment
      const isAvailable = this.environmentInfo.isCustomProtocol;
      
      return {
        strategy: AssetServingStrategy.TAURI_ASSET_PROTOCOL,
        url: assetUrl,
        success: isAvailable,
        error: isAvailable ? undefined : createYouTubeError(
          YouTubeErrorType.ASSET_NOT_FOUND,
          'Asset protocol not available in current environment',
          { url: assetUrl, environment: this.environmentInfo }
        )
      };
    } catch (error) {
      return {
        strategy: AssetServingStrategy.TAURI_ASSET_PROTOCOL,
        url: assetUrl,
        success: false,
        error: createYouTubeError(
          YouTubeErrorType.ASSET_NOT_FOUND,
          'Failed to access asset protocol',
          { url: assetUrl, originalError: error }
        )
      };
    }
  }

  /**
   * Try serving via HTTP server fallback (production fallback)
   */
  private async tryHttpServerFallback(): Promise<AssetServingResult> {
    try {
      const serverInfo = await this.getServerInfo();
      const url = `http://localhost:${serverInfo.port}/youtube_player.html`;
      
      const isAvailable = await this.validateAssetAvailability(url);
      
      return {
        strategy: AssetServingStrategy.HTTP_SERVER,
        url,
        success: isAvailable,
        error: isAvailable ? undefined : createYouTubeError(
          YouTubeErrorType.ASSET_NOT_FOUND,
          'YouTube player HTML not found at HTTP server URL',
          { url, serverInfo }
        )
      };
    } catch (error) {
      return {
        strategy: AssetServingStrategy.HTTP_SERVER,
        url: '',
        success: false,
        error: createYouTubeError(
          YouTubeErrorType.SERVER_UNAVAILABLE,
          'HTTP server fallback failed',
          { originalError: error }
        )
      };
    }
  }

  /**
   * Get server information from Tauri backend with caching
   */
  private async getServerInfo(): Promise<ServerInfo> {
    const now = Date.now();
    
    // Return cached result if still valid
    if (this.serverInfo && (now - this.lastValidationTime) < this.validationCacheMs) {
      return this.serverInfo;
    }

    try {
      const result = await Promise.race([
        invoke<ServerInfo>('get_server_info'),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Server info timeout')), SERVER_VALIDATION_TIMEOUT)
        )
      ]);

      this.serverInfo = result;
      this.lastValidationTime = now;
      
      return result;
    } catch (error) {
      throw createYouTubeError(
        YouTubeErrorType.SERVER_UNAVAILABLE,
        'Failed to get server information from Tauri backend',
        { originalError: error }
      );
    }
  }

  /**
   * Validate that an asset is available at the given URL
   */
  private async validateAssetAvailability(url: string): Promise<boolean> {
    try {
      const response = await Promise.race([
        fetch(url, { method: 'HEAD' }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Asset validation timeout')), SERVER_VALIDATION_TIMEOUT)
        )
      ]);

      return response.ok;
    } catch (error) {
      // In some environments, HEAD requests might fail even if GET would work
      // So we'll be optimistic and assume availability for certain cases
      if (this.environmentInfo.isDevelopment && url.includes('localhost:1420')) {
        return true; // Assume Vite dev server has the asset
      }
      
      return false;
    }
  }

  /**
   * Get current environment information
   */
  getEnvironmentInfo(): EnvironmentInfo {
    return this.environmentInfo;
  }

  /**
   * Refresh environment detection (useful after navigation or protocol changes)
   */
  refreshEnvironment(): void {
    this.environmentInfo = detectEnvironment();
    this.serverInfo = null; // Clear cached server info
    this.lastValidationTime = 0;
  }

  /**
   * Check if server is available and responsive
   */
  async validateServerHealth(serverUrl: string): Promise<boolean> {
    try {
      const healthUrl = serverUrl.replace('/youtube_player.html', '/api/status');
      const response = await Promise.race([
        fetch(healthUrl),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 3000)
        )
      ]);

      if (response.ok) {
        const data = await response.json();
        return data.status === 'online';
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get diagnostic information for debugging
   */
  getDiagnosticInfo(): Record<string, any> {
    return {
      environment: this.environmentInfo,
      serverInfo: this.serverInfo,
      lastValidationTime: this.lastValidationTime,
      cacheAge: this.serverInfo ? Date.now() - this.lastValidationTime : null,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    };
  }
}

// Singleton instance for global use
let environmentResolver: YouTubeEnvironmentResolver | null = null;

/**
 * Get the global environment resolver instance
 */
export function getEnvironmentResolver(): YouTubeEnvironmentResolver {
  if (!environmentResolver) {
    environmentResolver = new YouTubeEnvironmentResolver();
  }
  return environmentResolver;
}

/**
 * Reset the global environment resolver (useful for testing)
 */
export function resetEnvironmentResolver(): void {
  environmentResolver = null;
}

/**
 * Quick helper to get server URL with error handling
 */
export async function resolveYouTubePlayerUrl(): Promise<string> {
  try {
    const resolver = getEnvironmentResolver();
    const result = await resolver.getServerUrl();
    
    if (result.success) {
      return result.url;
    }
    
    throw result.error || new Error('Failed to resolve YouTube player URL');
  } catch (error) {
    console.error('[YouTube] Failed to resolve player URL:', error);
    throw error;
  }
}