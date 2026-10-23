const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Reused frame state: no allocations or React updates in the render loop. */
export class SceneAudio {
  spectrum = new Float32Array(32);
  bass = 0;
  mid = 0;
  treble = 0;
  energy = 0;
  pulse = 0;

  update(data: readonly number[], delta: number, intensity: number): void {
    const dt = Math.max(0, Math.min(delta, 0.1));
    const attack = 1 - Math.exp(-dt / (0.035 + (1 - clamp(intensity)) * 0.35));
    const release = 1 - Math.exp(-dt / (0.22 + (1 - clamp(intensity)) * 0.65));
    const smooth = (current: number, target: number) => current + (target - current) * (target > current ? attack : release);
    // Native FFT is linear, normalized 0..1. Logarithmic buckets retain bass detail.
    for (let band = 0; band < 32; band++) {
      const start = Math.floor(Math.pow(Math.max(2, data.length), band / 32));
      const end = Math.min(data.length, Math.max(start + 1, Math.ceil(Math.pow(Math.max(2, data.length), (band + 1) / 32))));
      let sum = 0;
      for (let i = start; i < end; i++) sum += clamp(data[i]) ** 2;
      const target = end > start ? Math.min(1, Math.sqrt(sum / (end - start)) * 2.5) : 0;
      this.spectrum[band] = smooth(this.spectrum[band], target);
    }
    const mean = (start: number, end: number) => {
      let sum = 0;
      for (let i = start; i < end; i++) sum += this.spectrum[i];
      return sum / (end - start);
    };
    this.bass = mean(0, 12);
    this.mid = mean(12, 24);
    this.treble = mean(24, 32);
    const nextEnergy = this.bass * 0.45 + this.mid * 0.35 + this.treble * 0.2;
    this.pulse = Math.max(this.pulse * Math.exp(-dt * 5), Math.min(1, Math.max(0, nextEnergy - this.energy) * 5));
    this.energy = nextEnergy;
  }
}
