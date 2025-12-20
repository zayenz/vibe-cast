import { useEffect, useState, useCallback } from 'react';

/**
 * Application state from the SSE stream
 */
export interface AppState {
  mode: 'fireplace' | 'techno';
  messages: string[];
  triggered_message?: string | null;
}

/**
 * Hook configuration
 */
interface UseAppStateOptions {
  /** Base URL for API calls. Defaults to '' for same-origin */
  apiBase?: string;
}

/**
 * Custom hook that subscribes to the SSE event stream for real-time state updates.
 * This is the single source of truth for app state - no local mutations, only SSE updates.
 * 
 * @param options Configuration options
 * @returns Current app state and connection status
 */
export function useAppState(options: UseAppStateOptions = {}) {
  const { apiBase = '' } = options;
  
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      
      eventSource = new EventSource(`${apiBase}/api/events`);

      eventSource.addEventListener('state', (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data) as AppState;
          setState(data);
          setError(null);
          setIsConnected(true);
        } catch (e) {
          console.error('Failed to parse SSE state:', e);
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) return;
        setIsConnected(false);
        eventSource?.close();
        
        // Reconnect after 2 seconds
        reconnectTimer = setTimeout(connect, 2000);
      };

      eventSource.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        setError(null);
      };
    };

    connect();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [apiBase]);

  return { state, error, isConnected };
}

/**
 * Hook for sending commands to the server.
 * Uses the standard fetch API - can be used alongside useFetcher for form-based submissions.
 */
export function useSendCommand(options: UseAppStateOptions = {}) {
  const { apiBase = '' } = options;
  const [isPending, setIsPending] = useState(false);

  const sendCommand = useCallback(async (command: string, payload?: unknown) => {
    setIsPending(true);
    try {
      const response = await fetch(`${apiBase}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      
      return await response.json();
    } finally {
      setIsPending(false);
    }
  }, [apiBase]);

  return { sendCommand, isPending };
}

