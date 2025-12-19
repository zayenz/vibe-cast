import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ControlPlane } from "./components/ControlPlane";
import { VisualizerWindow } from "./components/VisualizerWindow";
import { RemoteControl } from "./components/RemoteControl";
import "./App.css";

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [isRemote, setIsRemote] = useState(false);

  useEffect(() => {
    // Check if we are running in a mobile browser (Remote Control)
    const isTauri = !!(window as any).__TAURI_INTERNALS__;
    
    if (!isTauri) {
      setIsRemote(true);
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
    };
    checkLabel();
  }, []);

  if (isRemote) {
    return <RemoteControl />;
  }

  if (windowLabel === "viz") {
    return <VisualizerWindow />;
  }

  return <ControlPlane />;
}

export default App;
