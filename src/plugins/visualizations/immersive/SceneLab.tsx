import { Suspense, useEffect, useState } from 'react';
import { visualizationRegistry } from '../registry';
import { getDefaultsFromSchema } from '../../types';
import { SettingsRenderer } from '../../../components/settings/SettingsRenderer';

const scenes = visualizationRegistry.filter(plugin => plugin.settingsSchema.some(setting => setting.id === 'audioResponse'));

/** Development-only workbench using exactly the same plugins and controls as the app. */
export default function SceneLab() {
  const initial = new URLSearchParams(window.location.search).get('scene');
  const [id, setId] = useState(initial || scenes[0].id);
  const plugin = scenes.find(scene => scene.id === id) || scenes[0];
  const [settings, setSettings] = useState(() => ({ ...getDefaultsFromSchema(plugin.settingsSchema),
    __previewTime: Number(new URLSearchParams(window.location.search).get('time')) || 0 } as Record<string, unknown>));
  const [music, setMusic] = useState(false);
  const [dim, setDim] = useState(1);
  const [audio, setAudio] = useState<number[]>([]);
  const [controls, setControls] = useState(true);
  useEffect(() => {
    if (!music) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      const beat = Math.exp(-((t * 2) % 1) * 9);
      setAudio(Array.from({ length: 512 }, (_, i) =>
        i < 10 ? beat * 0.65 : (0.5 + 0.5 * Math.sin(i * 0.16 + t * 3)) * (0.1 + beat * 0.15) * Math.exp(-i / 380)));
    }, 33);
    return () => clearInterval(timer);
  }, [music]);
  const Component = plugin.component;
  return <main style={{ position: 'fixed', inset: 0, background: '#000', color: '#eee' }}>
    <Suspense fallback={<p>Loading scene…</p>}>
      <Component key={id} audioData={music ? audio : []} commonSettings={{ intensity: 0.8, dim }} customSettings={settings} />
    </Suspense>
    <button onClick={() => setControls(value => !value)} style={{ position: 'absolute', right: 16, top: 16, background: '#111c', padding: '8px 12px', borderRadius: 8 }}>{controls ? 'Hide controls' : 'Show controls'}</button>
    {controls && <aside style={{ position: 'absolute', left: 16, top: 16, bottom: 16, width: 280, overflow: 'auto', padding: 20, background: '#0a1019ed', borderRadius: 12 }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Scene lab</h1>
      <p style={{ fontSize: 12, color: '#abb5c3', marginBottom: 16 }}>Development preview · synthetic music</p>
      <select aria-label="Scene" value={id} onChange={event => {
        const next = scenes.find(scene => scene.id === event.target.value)!;
        setId(next.id); setSettings(getDefaultsFromSchema(next.settingsSchema));
        window.history.replaceState(null, '', `/scene-lab?scene=${next.id}`);
      }} style={{ width: '100%', background: '#202936', padding: 8, marginBottom: 16 }}>
        {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
      </select>
      <p style={{ fontSize: 13, marginBottom: 16 }}>{plugin.description}</p>
      <label style={{ display: 'block', marginBottom: 16 }}><input type="checkbox" checked={music} onChange={event => setMusic(event.target.checked)} /> Simulated music</label>
      <label style={{ display: 'block', marginBottom: 16 }}>Brightness <input aria-label="Brightness" type="range" min="0" max="1" step="0.05" value={dim} onChange={event => setDim(Number(event.target.value))} /></label>
      <label style={{ display: 'block', marginBottom: 16 }}>Jump ahead · {String(settings.__previewTime ?? 0)} s <input aria-label="Preview time" type="range" min="0" max="600" step="1" value={Number(settings.__previewTime ?? 0)} onChange={event => setSettings(previous => ({ ...previous, __previewTime: Number(event.target.value) }))} /></label>
      <SettingsRenderer schema={plugin.settingsSchema} values={settings} onChange={(key, value) => setSettings(previous => ({ ...previous, [key]: value }))} />
    </aside>}
  </main>;
}
