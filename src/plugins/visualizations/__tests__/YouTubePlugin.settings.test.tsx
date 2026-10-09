import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { YouTubePlugin } from '../YouTubePlugin';
import { DEFAULT_COMMON_SETTINGS } from '../../types';

it('changes sound settings without navigating and applies them when the player becomes ready', async () => {
  const Component = YouTubePlugin.component;
  const props = { audioData: [], commonSettings: DEFAULT_COMMON_SETTINGS };
  const { rerender } = render(<Component {...props} customSettings={{ videoUrl: 'https://youtu.be/abcdefghijk', volume: 20, muted: true }} />);
  const iframe = await screen.findByTitle('YouTube Video') as HTMLIFrameElement;
  const originalSrc = iframe.src;
  const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
  rerender(<Component {...props} customSettings={{ videoUrl: 'https://youtu.be/abcdefghijk', volume: 80, muted: false }} />);
  expect(iframe.src).toBe(originalSrc);
  expect(postMessage).toHaveBeenCalledWith({ type: 'setVolume', value: 80 }, '*');
  expect(postMessage).toHaveBeenCalledWith({ type: 'setMuted', value: false }, '*');
  postMessage.mockClear();
  act(() => window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, data: { type: 'youtube-ready' } })));
  expect(postMessage).toHaveBeenCalledWith({ type: 'setVolume', value: 80 }, '*');
  expect(postMessage).toHaveBeenCalledWith({ type: 'setMuted', value: false }, '*');
  rerender(<Component {...props} customSettings={{ videoUrl: 'https://youtu.be/lmnopqrstuv', volume: 80, muted: false }} />);
  expect((screen.getByTitle('YouTube Video') as HTMLIFrameElement).src).not.toBe(originalSrc);
  postMessage.mockRestore();
});
