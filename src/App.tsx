import { useEffect, useState, lazy, Suspense } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./App.css";

// Lazy load components to ensure Tauri-specific code is only loaded when needed.
const ControlPlaneRouter = lazy(() => import("./components/ControlPlaneRouter").then(module => ({ default: module.ControlPlaneRouter })));
const VisualizerWindow = lazy(() => import("./components/VisualizerWindow").then(module => ({ default: module.VisualizerWindow })));
const RemoteControl = lazy(() => import("./components/RemoteControl").then(module => ({ default: module.RemoteControl })));

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

  if (view === "remote") {
    return (
      <ErrorBoundary>
        <Suspense fallback={LoadingScreen}>
          <RemoteControl />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={LoadingScreen}>
        <ControlPlaneRouter />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
