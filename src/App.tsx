import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ControlPlane } from "./components/ControlPlane";
import { VisualizerWindow } from "./components/VisualizerWindow";
import { RemoteControl } from "./components/RemoteControl";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { commandAction } from "./router";
import "./App.css";

/**
 * Create router with the appropriate component based on context.
 * The router provides useFetcher infrastructure even for single-page views.
 */
function createAppRouter(component: React.ReactNode) {
  return createBrowserRouter([
    {
      path: "/",
      element: component,
      action: commandAction,
    },
    {
      // Catch-all for any other paths
      path: "*",
      element: component,
      action: commandAction,
    },
  ]);
}

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [isRemote, setIsRemote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we are running in a mobile browser (Remote Control)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTauri = !!(window as any).__TAURI_INTERNALS__;
    
    if (!isTauri) {
      setIsRemote(true);
      setIsLoading(false);
      return;
    }

    // Otherwise check Tauri window label
    const checkLabel = async () => {
      try {
        const label = await getCurrentWebviewWindow().label;
        setWindowLabel(label);
      } catch (e) {
        console.error('Failed to get window label:', e);
        // If this fails, we might be in the browser but tauri is injected
        setIsRemote(true);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.warn('Window label check timed out, defaulting to Control Plane');
      setIsLoading(false);
    }, 2000);
    
    checkLabel();
    
    return () => clearTimeout(timeout);
  }, []); // Empty dependency array - only run once on mount

  // Show loading screen while detecting context
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Visualizer window doesn't use the router - it stays on Tauri events for performance
  if (windowLabel === "viz") {
    return (
      <ErrorBoundary>
        <VisualizerWindow />
      </ErrorBoundary>
    );
  }

  // Remote Control in browser - uses router for useFetcher
  if (isRemote) {
    const router = createAppRouter(
      <ErrorBoundary>
        <RemoteControl />
      </ErrorBoundary>
    );
    return <RouterProvider router={router} />;
  }

  // Control Plane in Tauri - uses router for useFetcher
  const router = createAppRouter(
    <ErrorBoundary>
      <ControlPlane />
    </ErrorBoundary>
  );
  return <RouterProvider router={router} />;
}

export default App;
