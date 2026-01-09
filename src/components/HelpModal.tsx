import React from 'react';
import { X, Keyboard, Smartphone, Monitor } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-2xl font-bold text-white tracking-tight">Vibe Cast Help</h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          
          {/* Intro */}
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-orange-500 flex items-center gap-2">
              <Monitor size={20} />
              Setup & Windows
            </h3>
            <p className="text-zinc-300 leading-relaxed">
              Vibe Cast operates with two main windows:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-400 ml-2">
              <li><strong>Control Plane:</strong> This window (where you are now). Use it to manage playlists, settings, and visualizations.</li>
              <li><strong>Visualizer Stage:</strong> A dedicated, borderless window meant for your secondary display (TV, Projector).</li>
            </ul>
            <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50 text-sm text-zinc-400">
              <span className="text-orange-400 font-bold">Tip:</span> If you lose the Visualizer window, use the "Toggle Stage" or "Restart Stage" buttons in the top right.
            </div>
          </section>

          {/* Remote Control */}
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-blue-500 flex items-center gap-2">
              <Smartphone size={20} />
              Remote Control
            </h3>
            <p className="text-zinc-300 leading-relaxed">
              Control the vibe from your couch!
            </p>
            <ol className="list-decimal list-inside space-y-2 text-zinc-400 ml-2">
              <li>Ensure your phone is on the same Wi-Fi network.</li>
              <li>Scan the <strong>QR Code</strong> shown in the Control Plane.</li>
              <li>The remote app works directly in your mobile browser.</li>
            </ol>
          </section>

          {/* Shortcuts */}
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-purple-500 flex items-center gap-2">
              <Keyboard size={20} />
              Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-800/30 p-4 rounded-lg border border-zinc-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-300 font-medium">Toggle Debug Overlay</span>
                  <kbd className="bg-zinc-900 px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-400 font-mono">Cmd+Shift+D</kbd>
                </div>
                <p className="text-xs text-zinc-500">Shows performance stats and logs on the Visualizer.</p>
              </div>
            </div>
          </section>

          {/* Docs Link */}
          <section className="pt-4 border-t border-zinc-800">
            <p className="text-zinc-400 text-sm">
              For more advanced configuration (creating custom plugins, etc.), check the technical documentation in the project repository.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 text-center">
          <p className="text-zinc-500 text-xs">
            Vibe Cast v{import.meta.env.PACKAGE_VERSION || '0.1.0'}
          </p>
        </div>
      </div>
    </div>
  );
};
