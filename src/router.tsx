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

  // Determine API base URL
  // In Tauri windows, we need to hit localhost:8080
  // In browser (remote), we're already on that origin
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const apiBase = isTauri ? 'http://localhost:8080' : '';

  const response = await fetch(`${apiBase}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, payload }),
    signal: request.signal, // Enable cancellation
  });

  if (!response.ok) {
    throw new Response('Command failed', { status: response.status });
  }

  return response.json();
}

// Router is created dynamically in App.tsx based on window context
// This file exports the shared action handler

