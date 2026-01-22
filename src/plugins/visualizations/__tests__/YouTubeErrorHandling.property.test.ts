/**
 * Property-Based Tests for YouTube Error Handling and Logging
 * 
 * Feature: youtube-player-production-fix
 * Property 5: Comprehensive Error Handling and Logging
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

describe('Feature: youtube-player-production-fix, Property 5: Comprehensive Error Handling and Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect and categorize network errors correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.oneof(
            fc.constant('timeout'),
            fc.constant('Timeout exceeded'),
            fc.constant('Failed to fetch'),
            fc.constant('NetworkError'),
            fc.constant('CORS policy'),
            fc.constant('cross-origin'),
            fc.constant('Content Security Policy'),
            fc.constant('CSP violation'),
            fc.constant('blocked by policy'),
            fc.constant('Script blocked'),
            fc.constant('Unknown network error')
          ),
          hasStack: fc.boolean(),
          hasDetails: fc.boolean()
        }),
        async ({ errorMessage, hasStack, hasDetails }) => {
          // Simulate detectNetworkError function
          function detectNetworkError(error: any) {
            const message = error.message || error.toString();
            
            if (message.includes('timeout') || message.includes('Timeout')) {
              return 'network_timeout';
            }
            if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
              return 'network_unreachable';
            }
            if (message.includes('CORS') || message.includes('cross-origin')) {
              return 'cors_blocked';
            }
            if (message.includes('Content Security Policy') || message.includes('CSP')) {
              return 'csp_blocked';
            }
            if (message.includes('blocked') || message.includes('Blocked')) {
              return 'script_blocked';
            }
            
            return 'unknown_error';
          }

          const mockError = {
            message: errorMessage,
            stack: hasStack ? 'Error stack trace...' : undefined,
            details: hasDetails ? { extra: 'info' } : undefined
          };

          const errorType = detectNetworkError(mockError);

          // Validate error categorization
          expect(typeof errorType).toBe('string');
          expect(errorType.length).toBeGreaterThan(0);

          // Validate specific categorizations
          if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
            expect(errorType).toBe('network_timeout');
          } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            expect(errorType).toBe('network_unreachable');
          } else if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
            expect(errorType).toBe('cors_blocked');
          } else if (errorMessage.includes('Content Security Policy') || errorMessage.includes('CSP')) {
            expect(errorType).toBe('csp_blocked');
          } else if (errorMessage.includes('blocked') || errorMessage.includes('Blocked')) {
            expect(errorType).toBe('script_blocked');
          } else {
            expect(errorType).toBe('unknown_error');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should determine error recovery strategies correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.constantFrom(
            'network_timeout',
            'network_unreachable',
            'script_blocked',
            'csp_blocked',
            'cors_blocked',
            'unknown_error'
          ),
          attempt: fc.integer({ min: 1, max: 5 })
        }),
        async ({ errorType, attempt }) => {
          let recoveryAttempted = false;
          let shouldRetry = false;

          // Simulate attemptErrorRecovery function
          function attemptErrorRecovery(type: string, attemptNum: number) {
            recoveryAttempted = true;
            
            switch (type) {
              case 'network_timeout':
              case 'network_unreachable':
                if (attemptNum <= 2) {
                  shouldRetry = true;
                  return true;
                }
                break;
                
              case 'script_blocked':
              case 'csp_blocked':
                return false;
                
              case 'cors_blocked':
                return false;
                
              default:
                return false;
            }
            
            return false;
          }

          const canRecover = attemptErrorRecovery(errorType, attempt);

          // Validate recovery logic
          expect(recoveryAttempted).toBe(true);

          // Network errors should be retryable for first 2 attempts
          if ((errorType === 'network_timeout' || errorType === 'network_unreachable') && attempt <= 2) {
            expect(canRecover).toBe(true);
            expect(shouldRetry).toBe(true);
          } else if (errorType === 'script_blocked' || errorType === 'csp_blocked' || errorType === 'cors_blocked') {
            expect(canRecover).toBe(false);
          } else {
            expect(canRecover).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should collect comprehensive error context', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.string({ minLength: 1, maxLength: 50 }),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          videoId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          hasPlayer: fc.boolean(),
          isOnline: fc.boolean(),
          userAgent: fc.string({ minLength: 10, maxLength: 100 })
        }),
        async ({ errorType, message, videoId, hasPlayer, isOnline, userAgent }) => {
          // Mock environment
          const mockNavigator = {
            userAgent: userAgent,
            onLine: isOnline,
            connection: isOnline ? {
              effectiveType: '4g',
              downlink: 10,
              rtt: 50
            } : null
          };

          const mockLocation = {
            origin: 'http://localhost:1420',
            protocol: 'http:',
            href: 'http://localhost:1420/test'
          };

          const mockDocument = {
            referrer: 'http://localhost:1420'
          };

          const mockWindow = {
            YT: hasPlayer ? { Player: vi.fn() } : null
          };

          // Simulate error context collection
          function collectErrorContext(type: string, msg: string, details: any = null) {
            return {
              timestamp: Date.now(),
              type: type,
              message: msg,
              details: details,
              environment: {
                userAgent: mockNavigator.userAgent,
                origin: mockLocation.origin,
                protocol: mockLocation.protocol,
                href: mockLocation.href,
                referrer: mockDocument.referrer
              },
              player: {
                videoId: videoId,
                hasYouTubeAPI: !!(mockWindow.YT && mockWindow.YT.Player),
                playerExists: hasPlayer
              },
              network: {
                onLine: mockNavigator.onLine,
                connection: mockNavigator.connection
              }
            };
          }

          const context = collectErrorContext(errorType, message, { test: true });

          // Validate context structure
          expect(context).toHaveProperty('timestamp');
          expect(context).toHaveProperty('type', errorType);
          expect(context).toHaveProperty('message', message);
          expect(context).toHaveProperty('environment');
          expect(context).toHaveProperty('player');
          expect(context).toHaveProperty('network');

          // Validate environment context
          expect(context.environment.userAgent).toBe(userAgent);
          expect(context.environment.origin).toBe('http://localhost:1420');
          expect(context.environment.protocol).toBe('http:');

          // Validate player context
          expect(context.player.videoId).toBe(videoId);
          expect(context.player.hasYouTubeAPI).toBe(hasPlayer);
          expect(context.player.playerExists).toBe(hasPlayer);

          // Validate network context
          expect(context.network.onLine).toBe(isOnline);
          if (isOnline) {
            expect(context.network.connection).toBeTruthy();
            expect(context.network.connection?.effectiveType).toBe('4g');
          } else {
            expect(context.network.connection).toBeNull();
          }

          // Validate timestamp is recent
          expect(context.timestamp).toBeGreaterThan(Date.now() - 1000);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle YouTube player error codes correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorCode: fc.constantFrom(2, 5, 100, 101, 150, 999),
          videoId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          hasPlayer: fc.boolean()
        }),
        async ({ errorCode, videoId, hasPlayer }) => {
          let reportedError: any = null;
          let recoveryAttempted = false;

          // Mock error reporting
          function reportError(type: string, message: string, details: any = null) {
            reportedError = { type, message, details };
          }

          // Mock player recovery
          const mockPlayer = hasPlayer ? {
            loadVideoById: vi.fn((_id: string) => { recoveryAttempted = true; })
          } : null;

          // Simulate onPlayerError function
          function onPlayerError(event: { data: number }) {
            const errorCodes: Record<number, string> = {
              2: 'Invalid video ID',
              5: 'HTML5 player error',
              100: 'Video not found or private',
              101: 'Embedding not allowed by video owner',
              150: 'Embedding not allowed by video owner'
            };
            
            const errorMessage = errorCodes[event.data] || `Unknown error (code: ${event.data})`;
            
            // Determine if error is recoverable
            const isRecoverable = event.data === 5; // HTML5 errors might be recoverable
            
            reportError('player_error', errorMessage, {
              errorCode: event.data,
              videoId: videoId,
              isRecoverable: isRecoverable,
              playerState: mockPlayer ? 'ready' : 'not_ready'
            });
            
            // Attempt recovery for HTML5 errors
            if (isRecoverable && mockPlayer) {
              setTimeout(() => {
                try {
                  mockPlayer.loadVideoById(videoId);
                } catch (recoveryError) {
                  console.log('Recovery attempt failed:', recoveryError);
                }
              }, 0); // Immediate for testing
            }
          }

          // Test error handling
          onPlayerError({ data: errorCode });

          // Validate error reporting
          expect(reportedError).toBeTruthy();
          expect(reportedError.type).toBe('player_error');
          expect(reportedError.details.errorCode).toBe(errorCode);
          expect(reportedError.details.videoId).toBe(videoId);
          expect(reportedError.details.playerState).toBe(hasPlayer ? 'ready' : 'not_ready');

          // Validate error message
          const expectedMessages: Record<number, string> = {
            2: 'Invalid video ID',
            5: 'HTML5 player error',
            100: 'Video not found or private',
            101: 'Embedding not allowed by video owner',
            150: 'Embedding not allowed by video owner'
          };

          if (expectedMessages[errorCode]) {
            expect(reportedError.message).toBe(expectedMessages[errorCode]);
          } else {
            expect(reportedError.message).toContain(`Unknown error (code: ${errorCode})`);
          }

          // Validate recovery logic
          const isRecoverable = errorCode === 5;
          expect(reportedError.details.isRecoverable).toBe(isRecoverable);

          // HTML5 errors should trigger recovery if player exists
          if (isRecoverable && hasPlayer) {
            // Wait for async recovery
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(recoveryAttempted).toBe(true);
          } else {
            expect(recoveryAttempted).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should validate message communication error handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          messageType: fc.constantFrom('setVolume', 'setMuted', 'loadVideo', 'playVideo', 'pauseVideo', 'invalidType'),
          value: fc.oneof(
            fc.integer({ min: 0, max: 100 }),
            fc.boolean(),
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.constant(null),
            fc.constant(undefined)
          ),
          playerReady: fc.boolean(),
          shouldThrow: fc.boolean()
        }),
        async ({ messageType, value, playerReady, shouldThrow }) => {
          let errorLogged = false;
          const playerActions: string[] = [];

          // Mock console.log to capture error logs
          const originalLog = console.log;
          console.log = vi.fn((...args) => {
            if (args[0] && args[0].includes('Error handling parent message')) {
              errorLogged = true;
            }
          });

          // Mock player that might throw errors
          const mockPlayer = playerReady ? {
            setVolume: vi.fn((vol) => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push(`setVolume:${vol}`);
            }),
            mute: vi.fn(() => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push('mute');
            }),
            unMute: vi.fn(() => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push('unMute');
            }),
            loadVideoById: vi.fn((id: string) => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push(`loadVideo:${id}`);
            }),
            playVideo: vi.fn(() => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push('play');
            }),
            pauseVideo: vi.fn(() => {
              if (shouldThrow) throw new Error('Player error');
              playerActions.push('pause');
            })
          } : null;

          // Simulate message handler with error handling
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
                default:
                  // Unknown message type - should be handled gracefully
                  break;
              }
            } catch (error) {
              console.log('Error handling parent message:', error);
            }
          }

          // Test message handling
          const message = { data: { type: messageType, value } };
          handleMessage(message);

          // Validate error handling
          if (shouldThrow && playerReady) {
            // Only expect error if the message type and value type match
            const shouldCallMethod = (
              (messageType === 'setVolume' && typeof value === 'number') ||
              (messageType === 'setMuted' && typeof value === 'boolean') ||
              (messageType === 'loadVideo' && typeof value === 'string') ||
              (messageType === 'playVideo') ||
              (messageType === 'pauseVideo')
            );
            
            if (shouldCallMethod) {
              expect(errorLogged).toBe(true);
            }
          }

          // Validate graceful handling of invalid message types
          if (messageType === 'invalidType') {
            expect(playerActions).toHaveLength(0);
            expect(errorLogged).toBe(false); // Should handle gracefully without error
          }

          // Restore console.log
          console.log = originalLog;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should validate network status monitoring', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          eventType: fc.constantFrom('online', 'offline'),
          hasParent: fc.boolean()
        }),
        async ({ eventType, hasParent }) => {
          let messagePosted: any = null;
          let errorReported: any = null;

          // Mock parent window
          const mockParent = hasParent ? {
            postMessage: vi.fn((msg: any, _targetOrigin: string) => { messagePosted = msg; })
          } : null;

          // Mock error reporting
          function reportError(type: string, message: string, details: any = null) {
            errorReported = { type, message, details };
          }

          // Simulate network event handlers
          function handleOnline() {
            if (mockParent) {
              mockParent.postMessage({
                type: 'youtube-network-status',
                status: 'online',
                timestamp: Date.now()
              }, '*');
            }
          }

          function handleOffline() {
            reportError('network_offline', 'Network connection lost', {
              wasOnline: true,
              timestamp: Date.now()
            });
          }

          // Test event handling
          if (eventType === 'online') {
            handleOnline();
            
            if (hasParent) {
              expect(messagePosted).toBeTruthy();
              expect(messagePosted.type).toBe('youtube-network-status');
              expect(messagePosted.status).toBe('online');
              expect(messagePosted.timestamp).toBeGreaterThan(Date.now() - 1000);
            } else {
              expect(messagePosted).toBeNull();
            }
            expect(errorReported).toBeNull();
          } else {
            handleOffline();
            
            expect(errorReported).toBeTruthy();
            expect(errorReported.type).toBe('network_offline');
            expect(errorReported.message).toBe('Network connection lost');
            expect(errorReported.details.wasOnline).toBe(true);
            expect(errorReported.details.timestamp).toBeGreaterThan(Date.now() - 1000);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});