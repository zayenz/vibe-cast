import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ControlPlane } from "./components/ControlPlane";
import { VisualizerWindow } from "./components/VisualizerWindow";
import { RemoteControl } from "./components/RemoteControl";
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
        console.log('Detected window label:', label);
        setWindowLabel(label);
      } catch (e) {
        console.error('Failed to get window label:', e);
        // If this fails, we might be in the browser but tauri is injected
        setIsRemote(true);
      }
      setIsLoading(false);
    };
    checkLabel();
  }, []);

  // Show nothing while detecting context
  if (isLoading) {
    return null;
  }

  // Visualizer window doesn't use the router - it stays on Tauri events for performance
  if (windowLabel === "viz") {
    return <VisualizerWindow />;
  }

  // Remote Control in browser - uses router for useFetcher
  if (isRemote) {
    const router = createAppRouter(<RemoteControl />);
    return <RouterProvider router={router} />;
  }

  // Control Plane in Tauri - uses router for useFetcher
  const router = createAppRouter(<ControlPlane />);
  return <RouterProvider router={router} />;
}

export default App;
