/**
 * Router configuration for the app.
 * 
 * Note: This app has minimal routing - the main differentiation is between:
 * - Control Plane (Tauri main window)
 * - Visualizer (Tauri viz window) - uses Tauri events, not router
 * - Remote Control (mobile browser)
 * 
 * The router is primarily used to provide the infrastructure for useFetcher
 * and consistent data patterns between Control Plane and Remote Control.
 */

let tauriApiBasePromise: Promise<string> | null = null;

async function resolveCommandApiBase(): Promise<string> {
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  if (!isTauri) {
    return '';
  }

  tauriApiBasePromise ??= import('@tauri-apps/api/core')
    .then(async ({ invoke }) => {
      const info = await invoke<{ port: number }>('get_server_info');
      return `http://127.0.0.1:${info.port}`;
    })
    .catch(() => 'http://127.0.0.1:8080');

  return tauriApiBasePromise;
}

// Command action - shared between Control Plane and Remote Control
export async function commandAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const command = formData.get('command') as string;
  const payloadRaw = formData.get('payload') as string | null;
  
  // Parse payload - could be JSON string or plain string
  let payload: unknown = payloadRaw;
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      // Not JSON, use as-is
      payload = payloadRaw;
    }
  }

  // Determine API base URL and device type
  // In Tauri windows, resolve the active backend port dynamically because the
  // server may bind anywhere in the configured port range.
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const apiBase = await resolveCommandApiBase();
  const deviceType = isTauri ? 'control_plane' : 'mobile_remote';

  const response = await fetch(`${apiBase}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, payload, deviceType }),
    signal: request.signal, // Enable cancellation
  });

  if (!response.ok) {
    throw new Response('Command failed', { status: response.status });
  }

  return response.json();
}

// Router is created dynamically in App.tsx based on window context
// This file exports the shared action handler
