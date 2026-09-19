import type { WeaponId } from '../shared/types';
import { limiterCurve, ReloadAudioSequence, SHOT_VARIANTS, synthesizeReload, synthesizeShot, WEAPON_AUDIO_RATE } from './weapon-audio';

const MAX_VOICES = 64;
interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[]; level: number; reload: boolean; dispose: () => void }

export class AudioEngine {
  ctx?: AudioContext;
  master?: GainNode;
  volume = .45;
  private noise?: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private reloadSequence = new ReloadAudioSequence();
  private shotVariant = 0;
  unlock() {
    if (!this.ctx) {
      const c = this.ctx = new AudioContext();
      this.master = c.createGain(); this.master.gain.value = this.volume;
      // Shared dynamics leave headroom for a crowded room. The final soft
      // ceiling also bounds sudden, correlated volleys before compressor attack.
      const dynamics = c.createDynamicsCompressor();
      dynamics.threshold.value = -9; dynamics.knee.value = 6; dynamics.ratio.value = 12;
      dynamics.attack.value = .002; dynamics.release.value = .14;
      const ceiling = c.createWaveShaper(); ceiling.curve = limiterCurve(); ceiling.oversample = '2x';
      this.master.connect(dynamics).connect(ceiling).connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const store = (key: string, samples: Float32Array) => {
        const buffer = c.createBuffer(1, samples.length, WEAPON_AUDIO_RATE);
        buffer.getChannelData(0).set(samples); this.buffers.set(key, buffer);
      };
      for (const id of ['intervention', 'ak47', 'scar', 'm9', 'deagle', 'glock', 'knife'] as const) {
        for (let variant = 0; variant < SHOT_VARIANTS; variant++) store(`${id}:shot:${variant}`, synthesizeShot(id, variant));
        if (id !== 'knife') for (const cue of ['remove', 'seat', 'latch'] as const) store(`${id}:${cue}`, synthesizeReload(id, cue));
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .45;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .015);
  }
  private register(source: AudioScheduledSourceNode, nodes: AudioNode[], level: number, reload = false): boolean {
    if (this.voices.size >= MAX_VOICES) {
      const quietest = [...this.voices].reduce((a, b) => a.level <= b.level ? a : b);
      if (quietest.level > level) { nodes.forEach(node => node.disconnect()); return false; }
      quietest.source.stop(); quietest.dispose();
    }
    const voice: Voice = { source, nodes, level, reload, dispose: () => {
      source.onended = null; nodes.forEach(node => node.disconnect()); this.voices.delete(voice);
    } };
    source.onended = voice.dispose; this.voices.add(voice); return true;
  }
  private play(key: string, volume: number, pan = 0, reload = false) {
    const c = this.ctx, buffer = this.buffers.get(key); if (!c || !this.master || !buffer || this.volume <= 0) return;
    const source = c.createBufferSource(); source.buffer = buffer;
    const gain = c.createGain(); gain.gain.value = volume;
    const stereo = c.createStereoPanner(); stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain).connect(stereo).connect(this.master);
    if (this.register(source, [source, gain, stereo], volume, reload)) source.start();
  }
  private burst(length: number, freq: number, volume: number, pan = 0) {
    const c = this.ctx; if (!c || !this.master || !this.noise || this.volume <= 0) return;
    const source = c.createBufferSource(); source.buffer = this.noise;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(freq, c.currentTime); filter.frequency.exponentialRampToValueAtTime(150, c.currentTime + length);
    const gain = c.createGain(); gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + length);
    const stereo = c.createStereoPanner(); stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(this.master);
    if (this.register(source, [source, filter, gain, stereo], volume)) { source.start(); source.stop(c.currentTime + length); }
  }
  private tone(freq: number, length: number, volume: number, endFreq = freq, type: OscillatorType = 'sine') {
    const c = this.ctx; if (!c || !this.master || this.volume <= 0) return;
    const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, c.currentTime); osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + length);
    const gain = c.createGain(); gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + length);
    osc.connect(gain).connect(this.master);
    if (this.register(osc, [osc, gain], volume)) { osc.start(); osc.stop(c.currentTime + length); }
  }
  shot(id: WeaponId, distance = 0, pan = 0) {
    const volume = 1 / (1 + Math.max(0, distance) * .085);
    this.play(`${id}:shot:${this.shotVariant++ % SHOT_VARIANTS}`, volume, pan);
  }
  updateReload(id: WeaponId, progress: number) {
    const { reset, cue } = this.reloadSequence.update(id, progress);
    if (reset) for (const voice of [...this.voices]) if (voice.reload) { voice.source.stop(); voice.dispose(); }
    if (cue) this.play(`${id}:${cue}`, 1, 0, true);
  }
  throwGrenade() { this.burst(.12, 1800, .12); }
  explosion(kind: 'frag' | 'flash', distance: number) {
    const volume = 1 / (1 + Math.max(0, distance) * .09);
    this.burst(kind === 'frag' ? .7 : .2, kind === 'frag' ? 2200 : 7000, .9 * volume);
    this.tone(kind === 'frag' ? 95 : 400, .32, .5 * volume, 25);
  }
  flash(strength: number) { this.tone(2400, .9, .035 * Math.max(0, Math.min(1, strength)), 1600); }
  step(sprint = false) { this.burst(.065, 550, sprint ? .14 : .095); this.tone(80, .045, .045, 35); }
  land() { this.burst(.12, 600, .22); this.tone(65, .1, .12, 25); }
  slide() { this.burst(.48, 1500, .22); }
  hit(kill = false) { this.tone(kill ? 1100 : 720, kill ? .14 : .055, .1, kill ? 1500 : 420, 'triangle'); }
  click() { this.tone(700, .025, .035, 1200, 'triangle'); }
}
