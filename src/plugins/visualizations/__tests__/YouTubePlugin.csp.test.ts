/**
 * Property-Based Tests for YouTube Plugin CSP Compliance
 * 
 * Feature: youtube-player-production-fix
 * Property 8: CSP Compliance and Resource Access
 * Validates: Requirements 3.4, 3.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// CSP Policy from tauri.conf.json
const CSP_POLICY = {
  'default-src': "'self' tauri: asset: http://localhost:* https://localhost:*",
  'script-src': "'self' 'unsafe-inline' 'unsafe-eval' tauri: asset: http://localhost:* https://localhost:* https://www.youtube.com https://www.gstatic.com https://s.ytimg.com",
  'style-src': "'self' 'unsafe-inline' tauri: asset: http://localhost:* https://localhost:* https://fonts.googleapis.com",
  'font-src': "'self' tauri: asset: http://localhost:* https://localhost:* https://fonts.gstatic.com",
  'img-src': "'self' data: blob: tauri: asset: http://localhost:* https://localhost:* https://i.ytimg.com https://yt3.ggpht.com https://i9.ytimg.com",
  'media-src': "'self' data: blob: tauri: asset: http://localhost:* https://localhost:* https://googlevideo.com https://*.googlevideo.com",
  'frame-src': "'self' tauri: asset: http://localhost:* https://localhost:* https://www.youtube.com https://www.youtube-nocookie.com",
  'connect-src': "'self' tauri: asset: http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https://www.youtube.com https://googlevideo.com https://*.googlevideo.com https://www.gstatic.com",
  'worker-src': "'self' blob:",
  'child-src': "'self' tauri: asset: https://www.youtube.com https://www.youtube-nocookie.com",
  'object-src': "'none'",
  'base-uri': "'self'"
};

// YouTube resource patterns that should be allowed
const YOUTUBE_RESOURCES = {
  scripts: [
    'https://www.youtube.com/iframe_api',
    'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
    'https://s.ytimg.com/yts/jsbin/player_ias-vflset/en_US/base.js'
  ],
  frames: [
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  ],
  images: [
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    'https://yt3.ggpht.com/ytc/channel-avatar.jpg',
    'https://i9.ytimg.com/vi/dQw4w9WgXcQ/1.jpg'
  ],
  media: [
    'https://googlevideo.com/videoplayback?id=123',
    'https://r1---sn-4g5e6nez.googlevideo.com/videoplayback'
  ],
  connections: [
    'https://www.youtube.com/api/stats/watchtime',
    'https://googlevideo.com/videoplayback',
    'https://www.gstatic.com/hostedimg/382a91be01d4d49c_large'
  ]
};

// CSP directive matching functions
function matchesCSPDirective(url: string, directive: string): boolean {
  const sources = directive.split(' ');
  
  for (const source of sources) {
    if (source === "'self'") continue;
    if (source === "'unsafe-inline'" || source === "'unsafe-eval'") continue;
    if (source === "'none'") return false;
    if (source === "data:" && url.startsWith('data:')) return true;
    if (source === "blob:" && url.startsWith('blob:')) return true;
    
    // Handle wildcard patterns
    if (source.includes('*')) {
      // Convert CSP wildcard pattern to regex
      // https://*.googlevideo.com -> https://.*\.googlevideo\.com
      let pattern = source
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '[^/]*'); // * matches any characters except /
      
      const regex = new RegExp(`^${pattern}(/.*)?$`);
      if (regex.test(url)) return true;
    } else if (url.startsWith(source)) {
      return true;
    }
  }
  
  return false;
}

function isYouTubeResourceAllowed(url: string, resourceType: keyof typeof CSP_POLICY): boolean {
  const directive = CSP_POLICY[resourceType];
  if (!directive) return false;
  
  return matchesCSPDirective(url, directive);
}

describe('Feature: youtube-player-production-fix, Property 8: CSP Compliance and Resource Access', () => {
  it('should allow all required YouTube script resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...YOUTUBE_RESOURCES.scripts),
        (scriptUrl) => {
          const isAllowed = isYouTubeResourceAllowed(scriptUrl, 'script-src');
          expect(isAllowed).toBe(true);
          return isAllowed;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow all required YouTube frame resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...YOUTUBE_RESOURCES.frames),
        (frameUrl) => {
          const isAllowed = isYouTubeResourceAllowed(frameUrl, 'frame-src');
          expect(isAllowed).toBe(true);
          return isAllowed;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow all required YouTube image resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...YOUTUBE_RESOURCES.images),
        (imageUrl) => {
          const isAllowed = isYouTubeResourceAllowed(imageUrl, 'img-src');
          expect(isAllowed).toBe(true);
          return isAllowed;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow all required YouTube media resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...YOUTUBE_RESOURCES.media),
        (mediaUrl) => {
          const isAllowed = isYouTubeResourceAllowed(mediaUrl, 'media-src');
          expect(isAllowed).toBe(true);
          return isAllowed;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow all required YouTube connection resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...YOUTUBE_RESOURCES.connections),
        (connectUrl) => {
          const isAllowed = isYouTubeResourceAllowed(connectUrl, 'connect-src');
          expect(isAllowed).toBe(true);
          return isAllowed;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow localhost resources for development and production fallback', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1024, max: 65535 }),
        fc.constantFrom('http', 'https'),
        fc.constantFrom('script', 'frame', 'img', 'media', 'connect'),
        (port, protocol, resourceType) => {
          const url = `${protocol}://localhost:${port}/youtube_player.html`;
          const cspKey = `${resourceType}-src` as keyof typeof CSP_POLICY;
          
          if (CSP_POLICY[cspKey]) {
            const isAllowed = isYouTubeResourceAllowed(url, cspKey);
            expect(isAllowed).toBe(true);
            return isAllowed;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow Tauri asset protocol resources', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('tauri:', 'asset:'),
        fc.constantFrom('script', 'frame', 'img', 'media'),
        (protocol, resourceType) => {
          const url = `${protocol}//localhost/youtube_player.html`;
          const cspKey = `${resourceType}-src` as keyof typeof CSP_POLICY;
          
          if (CSP_POLICY[cspKey]) {
            const isAllowed = isYouTubeResourceAllowed(url, cspKey);
            expect(isAllowed).toBe(true);
            return isAllowed;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should block non-YouTube external resources appropriately', () => {
    const maliciousUrls = [
      'https://evil.com/script.js',
      'https://malware.net/iframe.html',
      'https://tracker.ads/pixel.gif',
      'https://phishing.site/video.mp4'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...maliciousUrls),
        fc.constantFrom('script-src', 'frame-src', 'img-src', 'media-src'),
        (maliciousUrl, directive) => {
          // These should NOT be allowed by our CSP
          const isAllowed = isYouTubeResourceAllowed(maliciousUrl, directive as keyof typeof CSP_POLICY);
          expect(isAllowed).toBe(false);
          return !isAllowed; // Return true if correctly blocked
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain security while enabling YouTube functionality', () => {
    fc.assert(
      fc.property(
        fc.record({
          youtubeScript: fc.constantFrom(...YOUTUBE_RESOURCES.scripts),
          youtubeFrame: fc.constantFrom(...YOUTUBE_RESOURCES.frames),
          maliciousUrl: fc.constantFrom('https://evil.com/script.js', 'https://malware.net/iframe.html')
        }),
        ({ youtubeScript, youtubeFrame, maliciousUrl }) => {
          // Test script resources
          const scriptAllowed = isYouTubeResourceAllowed(youtubeScript, 'script-src');
          const scriptBlocked = !isYouTubeResourceAllowed(maliciousUrl, 'script-src');
          
          // Test frame resources  
          const frameAllowed = isYouTubeResourceAllowed(youtubeFrame, 'frame-src');
          const frameBlocked = !isYouTubeResourceAllowed(maliciousUrl, 'frame-src');
          
          // YouTube should be allowed AND malicious content should be blocked
          expect(scriptAllowed).toBe(true);
          expect(scriptBlocked).toBe(true);
          expect(frameAllowed).toBe(true);
          expect(frameBlocked).toBe(true);
          
          return scriptAllowed && scriptBlocked && frameAllowed && frameBlocked;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have consistent CSP policy structure', () => {
    const requiredDirectives = [
      'default-src',
      'script-src', 
      'frame-src',
      'img-src',
      'media-src',
      'connect-src'
    ];

    requiredDirectives.forEach(directive => {
      expect(CSP_POLICY).toHaveProperty(directive);
      expect(typeof CSP_POLICY[directive as keyof typeof CSP_POLICY]).toBe('string');
      expect(CSP_POLICY[directive as keyof typeof CSP_POLICY].length).toBeGreaterThan(0);
    });
  });
});