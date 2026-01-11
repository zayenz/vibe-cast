import { useEffect, useState, lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { commandAction } from "./router";
import "./App.css";

// Lazy load components to ensure Tauri-specific code is only loaded when needed.
const ControlPlane = lazy(() => import("./components/ControlPlane").then(module => ({ default: module.ControlPlane })));
const VisualizerWindow = lazy(() => import("./components/VisualizerWindow").then(module => ({ default: module.VisualizerWindow })));
const RemoteControl = lazy(() => import("./components/RemoteControl").then(module => ({ default: module.RemoteControl })));

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
  const [view, setView] = useState<"loading" | "viz" | "control" | "remote">("loading");

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTauri = !!(window as any).__TAURI_INTERNALS__;

    if (!isTauri) {
      setView("remote");
      return;
    }

    // If in Tauri, dynamically import the webviewWindow API to get the window label.
    // This prevents the browser from ever trying to import Tauri APIs.
    import("@tauri-apps/api/webviewWindow")
      .then((webview) => {
        const label = webview.getCurrentWebviewWindow().label;
        if (label === "viz") {
          setView("viz");
        } else {
          // Default to control plane for any other label (e.g., "main")
          setView("control");
        }
      })
      .catch((e) => {
        console.error("Failed to determine Tauri window type, falling back to remote.", e);
        setView("remote");
      });
  }, []); // Empty dependency array - only run once on mount

  const LoadingScreen = (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-500 text-sm">Loading...</span>
      </div>
    </div>
  );

  // Render based on the determined view
  if (view === "loading") {
    return LoadingScreen;
  }

  // Visualizer window doesn't use the router for performance.
  if (view === "viz") {
    return (
      <ErrorBoundary>
        <Suspense fallback={LoadingScreen}>
          <VisualizerWindow />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Both Control Plane and Remote Control use the router.
  const router = createAppRouter(
    <ErrorBoundary>
      <Suspense fallback={LoadingScreen}>
        {view === "control" ? <ControlPlane /> : <RemoteControl />}
      </Suspense>
    </ErrorBoundary>
  );

  return <RouterProvider router={router} />;
}

export default App;
