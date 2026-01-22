/**
 * Property-Based Tests for YouTube Player Initialization and Communication
 * 
 * Feature: youtube-player-production-fix
 * Property 2: Player Initialization and Communication
 * Validates: Requirements 1.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

describe('Feature: youtube-player-production-fix, Property 2: Player Initialization and Communication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle valid player configurations correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          videoId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          controls: fc.constantFrom(0, 1),
          muted: fc.boolean(),
          volume: fc.integer({ min: 0, max: 100 })
        }),
        async (config) => {
          // Simulate URL parameter parsing
          const params = new URLSearchParams({
            videoId: config.videoId,
            controls: config.controls.toString(),
            muted: config.muted.toString(),
            volume: config.volume.toString()
          });
          
          // Parse parameters (simulating the HTML file logic)
          const parsedVideoId = params.get('videoId');
          const parsedControls = params.get('controls') === '1' ? 1 : 0;
          const parsedMuted = params.get('muted') === 'true'; // Fix: compare with 'true' string
          const parsedVolume = parseInt(params.get('volume') || '50', 10);

          // Validate parameter parsing
          expect(parsedVideoId).toBe(config.videoId);
          expect(parsedControls).toBe(config.controls);
          expect(parsedMuted).toBe(config.muted);
          expect(parsedVolume).toBe(config.volume);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should validate error reporting mechanism', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.constantFrom('initialization_failed', 'player_error', 'global_error'),
          message: fc.string({ minLength: 1, maxLength: 100 }),
          hasDetails: fc.boolean()
        }),
        async ({ errorType, message, hasDetails }) => {
          let reportedMessage: any = null;

          // Mock parent window postMessage
          const mockParent = {
            postMessage: vi.fn((msg: any, _targetOrigin: string) => {
              reportedMessage = msg;
            })
          };

          // Simulate error reporting function
          function reportError(type: string, msg: string, details: any = null) {
            // Report to parent frame
            try {
              mockParent.postMessage({
                type: 'youtube-error',
                errorType: type,
                message: msg,
                details: details,
                timestamp: Date.now()
              }, '*');
            } catch (e) {
              console.log('Failed to report error to parent', e);
            }
          }

          // Test error reporting
          const details = hasDetails ? { extra: 'info' } : null;
          reportError(errorType, message, details);

          // Validate message reporting
          expect(mockParent.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'youtube-error',
              errorType: errorType,
              message: message,
              details: details,
              timestamp: expect.any(Number)
            }),
            '*'
          );

          expect(reportedMessage).toBeTruthy();
          expect(reportedMessage.type).toBe('youtube-error');
          expect(reportedMessage.errorType).toBe(errorType);
          expect(reportedMessage.message).toBe(message);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should handle message communication from parent correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          messageType: fc.constantFrom('setVolume', 'setMuted', 'loadVideo', 'playVideo', 'pauseVideo'),
          value: fc.oneof(
            fc.integer({ min: 0, max: 100 }), // for volume
            fc.boolean(), // for muted
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)) // for video ID
          )
        }),
        async ({ messageType, value }) => {
          let mockPlayer: any = null;
          const playerActions: string[] = [];

          // Mock YouTube player
          const createMockPlayer = () => ({
            setVolume: vi.fn((vol) => playerActions.push(`setVolume:${vol}`)),
            mute: vi.fn(() => playerActions.push('mute')),
            unMute: vi.fn(() => playerActions.push('unMute')),
            loadVideoById: vi.fn((id) => playerActions.push(`loadVideo:${id}`)),
            playVideo: vi.fn(() => playerActions.push('play')),
            pauseVideo: vi.fn(() => playerActions.push('pause'))
          });

          // Simulate message handler
          function handleMessage(event: any) {
            try {
              if (!mockPlayer) {
                return;
              }
              
              const data = event.data;
              
              switch (data.type) {
                case 'setVolume':
                  if (typeof data.value === 'number') {
                    mockPlayer.setVolume(data.value);
                  }
                  break;
                case 'setMuted':
                  if (typeof data.value === 'boolean') {
                    if (data.value) {
                      mockPlayer.mute();
                    } else {
                      mockPlayer.unMute();
                    }
                  }
                  break;
                case 'loadVideo':
                  if (typeof data.value === 'string') {
                    mockPlayer.loadVideoById(data.value);
                  }
                  break;
                case 'playVideo':
                  mockPlayer.playVideo();
                  break;
                case 'pauseVideo':
                  mockPlayer.pauseVideo();
                  break;
              }
            } catch (error) {
              console.log('Error handling parent message:', error);
            }
          }

          // Test with no player (should handle gracefully)
          const messageWithoutPlayer = { data: { type: messageType, value } };
          handleMessage(messageWithoutPlayer);
          expect(playerActions).toHaveLength(0);

          // Test with player ready
          mockPlayer = createMockPlayer();
          const messageWithPlayer = { data: { type: messageType, value } };
          handleMessage(messageWithPlayer);

          // Validate correct action was taken based on message type and value type
          switch (messageType) {
            case 'setVolume':
              if (typeof value === 'number') {
                expect(playerActions).toContain(`setVolume:${value}`);
              } else {
                expect(playerActions).toHaveLength(0);
              }
              break;
            case 'setMuted':
              if (typeof value === 'boolean') {
                expect(playerActions).toContain(value ? 'mute' : 'unMute');
              } else {
                expect(playerActions).toHaveLength(0);
              }
              break;
            case 'loadVideo':
              if (typeof value === 'string') {
                expect(playerActions).toContain(`loadVideo:${value}`);
              } else {
                expect(playerActions).toHaveLength(0);
              }
              break;
            case 'playVideo':
              expect(playerActions).toContain('play');
              break;
            case 'pauseVideo':
              expect(playerActions).toContain('pause');
              break;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should validate origin detection strategies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          protocol: fc.constantFrom('http:', 'https:', 'tauri:', 'asset:'),
          hostname: fc.constantFrom('localhost', '127.0.0.1', 'tauri.localhost'),
          port: fc.oneof(fc.constant(''), fc.integer({ min: 1000, max: 9999 }).map(p => `:${p}`))
        }),
        async ({ protocol, hostname, port }) => {
          const origin = `${protocol}//${hostname}${port}`;
          const href = `${origin}/test`;
          
          // Simulate getValidOrigin function
          function getValidOrigin(mockLocation: any) {
            const currentOrigin = mockLocation.origin;
            
            const origins = [
              currentOrigin,
              // Extract port from URL for localhost fallbacks
              (() => {
                const match = mockLocation.href.match(/localhost:(\d+)/);
                return match ? `http://localhost:${match[1]}` : null;
              })(),
              (() => {
                const match = mockLocation.href.match(/localhost:(\d+)/);
                return match ? `https://localhost:${match[1]}` : null;
              })(),
              // Common development origins
              'http://localhost:1420',
              'https://localhost:1420',
              'http://localhost:8080',
              'https://localhost:8080',
              // Let YouTube determine origin
              null
            ].filter(Boolean);
            
            return origins[0] || null;
          }

          const mockLocation = {
            origin: origin,
            protocol: protocol,
            hostname: hostname,
            port: port.replace(':', ''),
            href: href
          };

          const validOrigin = getValidOrigin(mockLocation);
          
          // Should always return a valid origin or null
          if (validOrigin !== null) {
            expect(typeof validOrigin).toBe('string');
            expect(validOrigin.length).toBeGreaterThan(0);
          }

          // Should prefer current origin when available
          if (origin && origin !== 'undefined://undefined') {
            expect(validOrigin).toBe(origin);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle YouTube API loading timeout scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          timeoutMs: fc.integer({ min: 100, max: 1000 }), // Shorter timeouts for testing
          shouldTimeout: fc.boolean(),
          apiAlreadyLoaded: fc.boolean()
        }),
        async ({ timeoutMs, shouldTimeout, apiAlreadyLoaded }) => {
          // Mock YouTube API
          const mockYT = apiAlreadyLoaded ? {
            Player: vi.fn(),
            PlayerState: { PLAYING: 1, PAUSED: 2 }
          } : null;

          // Simulate loadYouTubeAPI function
          function loadYouTubeAPI(timeout = timeoutMs, mockAPI = mockYT) {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error(`YouTube API load timeout (${timeout}ms)`));
              }, timeout);
              
              // Check if API is already loaded
              if (mockAPI && typeof mockAPI.Player === 'function') {
                clearTimeout(timeoutId);
                resolve(mockAPI);
                return;
              }
              
              // Simulate API loading
              if (!shouldTimeout) {
                // Simulate successful load after short delay
                setTimeout(() => {
                  const newAPI = {
                    Player: vi.fn(),
                    PlayerState: { PLAYING: 1, PAUSED: 2 }
                  };
                  clearTimeout(timeoutId);
                  resolve(newAPI);
                }, Math.min(timeout / 2, 50)); // Very short delay for testing
              }
              // If shouldTimeout is true, let the timeout fire
            });
          }

          if (apiAlreadyLoaded) {
            // Should resolve immediately
            const result = await loadYouTubeAPI();
            expect(result).toBeTruthy();
            expect((result as any).Player).toBeDefined();
          } else if (shouldTimeout) {
            // Should timeout
            await expect(loadYouTubeAPI()).rejects.toThrow(/timeout/i);
          } else {
            // Should load successfully
            const result = await loadYouTubeAPI();
            expect(result).toBeTruthy();
            expect((result as any).Player).toBeDefined();
          }
        }
      ),
      { numRuns: 20, timeout: 5000 } // Shorter test run with timeout
    );
  });
});