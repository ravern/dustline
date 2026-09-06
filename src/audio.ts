import type { WeaponId } from '../shared/types';

export class AudioEngine {
  ctx?: AudioContext;
  master?: GainNode;
  volume = .45;
  private noise?: AudioBuffer;
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  setVolume(value: number) { this.volume = value; if (this.master) this.master.gain.value = value; }
  private burst(length: number, freq: number, volume: number, pan = 0) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const source = c.createBufferSource(); source.buffer = this.noise;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(freq, c.currentTime); filter.frequency.exponentialRampToValueAtTime(150, c.currentTime + length);
    const gain = c.createGain(); gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + length);
    const stereo = c.createStereoPanner(); stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(this.master); source.start(); source.stop(c.currentTime + length);
  }
  private tone(freq: number, length: number, volume: number, endFreq = freq, type: OscillatorType = 'sine') {
    const c = this.ctx; if (!c || !this.master) return;
    const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, c.currentTime); osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + length);
    const gain = c.createGain(); gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + length);
    osc.connect(gain).connect(this.master); osc.start(); osc.stop(c.currentTime + length);
  }
  shot(id: WeaponId, distance = 0, pan = 0) {
    const v = Math.max(.05, 1 / (1 + distance * .085));
    if (id === 'knife') { this.burst(.13, 2200, .3 * v, pan); return; }
    const heavy = id === 'intervention';
    this.burst(heavy ? .42 : .16, heavy ? 4500 : 6500, .75 * v, pan);
    this.tone(heavy ? 130 : 190, heavy ? .28 : .11, .65 * v, 35);
    if (heavy) setTimeout(() => this.burst(.09, 1200, .16 * v, pan), 370);
  }
  step(sprint = false) { this.burst(.065, 550, sprint ? .14 : .095); this.tone(80, .045, .045, 35); }
  land() { this.burst(.12, 600, .22); this.tone(65, .1, .12, 25); }
  slide() { this.burst(.48, 1500, .22); }
  hit(kill = false) { this.tone(kill ? 1100 : 720, kill ? .14 : .055, .1, kill ? 1500 : 420, 'triangle'); }
  reload() { this.burst(.08, 3200, .15); setTimeout(() => this.burst(.065, 2600, .18), 450); }
  click() { this.tone(700, .025, .035, 1200, 'triangle'); }
}
