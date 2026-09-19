import type { WeaponId } from '../shared/types';

// Original synthesized recordings, mixed once at unlock rather than layering
// oscillators and filters for every shot in a full multiplayer room.
export const WEAPON_AUDIO_RATE = 32000;
export const SHOT_VARIANTS = 2;
interface ShotProfile {
  length: number; peak: number; crack: number; body: number; end: number;
  decay: number; color: number; tail: number; metal: number;
}
const profiles: Record<Exclude<WeaponId, 'knife'>, ShotProfile> = {
  intervention: { length: .68, peak: .92, crack: .0042, body: 132, end: 48, decay: .090, color: 720, tail: .16, metal: .33 },
  deagle: { length: .43, peak: .89, crack: .0034, body: 168, end: 62, decay: .069, color: 1050, tail: .115, metal: .065 },
  scar: { length: .33, peak: .82, crack: .0028, body: 174, end: 72, decay: .055, color: 980, tail: .085, metal: .072 },
  ak47: { length: .28, peak: .78, crack: .0024, body: 225, end: 95, decay: .043, color: 1500, tail: .068, metal: .062 },
  m9: { length: .23, peak: .70, crack: .0020, body: 270, end: 112, decay: .034, color: 1850, tail: .052, metal: .041 },
  glock: { length: .17, peak: .66, crack: .0015, body: 325, end: 145, decay: .025, color: 2400, tail: .035, metal: .028 },
};
const seeds: Record<WeaponId, number> = { intervention: 193, ak47: 479, scar: 863, m9: 997, deagle: 1283, glock: 1811, knife: 2029 };
const randomSource = (seed: number) => () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 2147483648 - 1;
};
const tau = Math.PI * 2;
function finish(samples: Float32Array, peak: number, sampleRate: number) {
  // Remove DC, retain headroom, and taper the last few milliseconds so a short
  // automatic-weapon tail doesn't end in a discontinuity.
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  let largest = 0;
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / (sampleRate * .0003), (samples.length - 1 - i) / (sampleRate * .007));
    samples[i] = (samples[i] - mean) * fade; largest = Math.max(largest, Math.abs(samples[i]));
  }
  if (largest) for (let i = 0; i < samples.length; i++) samples[i] *= peak / largest;
  return samples;
}

export function synthesizeShot(id: WeaponId, variant = 0, sampleRate = WEAPON_AUDIO_RATE): Float32Array {
  const random = randomSource(seeds[id] + variant * 7919);
  if (id === 'knife') {
    const samples = new Float32Array(Math.ceil(.15 * sampleRate)); let low = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate, n = random(); low += .19 * (n - low);
      const sweep = Math.sin(Math.PI * t / .15) ** 2;
      samples[i] = (n - low) * sweep * Math.exp(-t * 15) + low * .28 * sweep;
    }
    return finish(samples, .32, sampleRate);
  }
  const p = profiles[id], samples = new Float32Array(Math.ceil(p.length * sampleRate));
  const direct = new Float32Array(samples.length), color = 1 - Math.exp(-tau * p.color / sampleRate);
  const reflections = [[.023, .19], [.047, .12], [.083, .07]].map(([delay, gain]) => [Math.round(delay * sampleRate), gain]);
  let low = 0, room = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, noise = random(); low += color * (noise - low); room += .065 * (noise - room);
    const attack = 1 - Math.exp(-t / .00022);
    const crack = (noise - low * .42) * Math.exp(-t / p.crack) * 1.5;
    const bark = low * Math.exp(-t / (p.decay * .6)) * 1.25;
    const phase = tau * (p.end * t + (p.body - p.end) * .025 * (1 - Math.exp(-t / .025)));
    const body = (Math.sin(phase) + Math.sin(phase * 1.91) * .2) * Math.exp(-t / p.decay) * .62;
    direct[i] = (crack + bark + body) * attack;
    // Diffuse room tail and three short, filtered reflections are baked into
    // the same voice. They give the report depth without a long reverb wash.
    let reflected = 0;
    for (const [delay, gain] of reflections) {
      const at = i - delay;
      if (at >= 0) reflected += direct[at] * gain;
    }
    const tail = room * .40 * (1 - Math.exp(-t / .012)) * Math.exp(-t / p.tail);
    const m = t - p.metal;
    const click = m >= 0 ? (noise * .25 + Math.sin(tau * 2650 * m) * .12 + Math.sin(tau * 4170 * m) * .06) * Math.exp(-m / .013) * (1 - Math.exp(-m / .0003)) : 0;
    const latch = id === 'intervention' && m > .055 ? (noise * .22 + Math.sin(tau * 1850 * (m - .055)) * .12) * Math.exp(-(m - .055) / .02) : 0;
    samples[i] = direct[i] + reflected + tail + click + latch;
  }
  return finish(samples, p.peak, sampleRate);
}

export type ReloadCue = 'remove' | 'seat' | 'latch';
export function synthesizeReload(id: WeaponId, cue: ReloadCue, sampleRate = WEAPON_AUDIO_RATE): Float32Array {
  const heavy = id === 'intervention' || id === 'deagle', rifle = id === 'ak47' || id === 'scar';
  const index = cue === 'remove' ? 0 : cue === 'seat' ? 1 : 2;
  const random = randomSource(seeds[id] + 313 * (index + 1));
  const length = cue === 'remove' ? .13 : cue === 'seat' ? .10 : heavy ? .15 : .10;
  const samples = new Float32Array(Math.ceil(length * sampleRate)); let low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, n = random(); low += .16 * (n - low);
    const slide = low * Math.sin(Math.PI * t / length) * Math.exp(-t / .045) * (cue === 'remove' ? 1 : .3);
    const onset = cue === 'remove' ? .012 : 0, a = Math.max(0, t - onset);
    const strike = t >= onset ? (n * .3 + Math.sin(tau * (heavy ? 150 : rifle ? 195 : 285) * a) * .7) * Math.exp(-a / (cue === 'seat' ? .018 : .009)) : 0;
    const metalAt = cue === 'latch' ? .028 : .035, m = t - metalAt;
    const metal = m >= 0 ? (n * .2 + Math.sin(tau * (heavy ? 1730 : 2350) * m) * .22) * Math.exp(-m / .011) : 0;
    samples[i] = slide + strike + metal;
  }
  return finish(samples, cue === 'seat' ? .34 : cue === 'latch' ? .28 : .22, sampleRate);
}

/** No timers: canceled reloads cannot leave magazine/bolt sounds scheduled. */
export class ReloadAudioSequence {
  private weapon?: WeaponId;
  private stage = -1;
  private progress = 0;
  update(id: WeaponId, progress: number): { reset: boolean; cue?: ReloadCue } {
    if (!Number.isFinite(progress) || progress <= 0 || progress >= 1 || id === 'knife') {
      const reset = this.weapon !== undefined; this.weapon = undefined; this.stage = -1; this.progress = 0;
      return { reset };
    }
    const stage = progress >= .82 ? 2 : progress >= .5 ? 1 : 0;
    const starting = this.weapon !== id || (progress < .08 && this.progress - progress > .2);
    const reset = starting && this.weapon !== undefined;
    // Joining/resuming halfway through a reload should never replay old cues.
    const cue = starting ? (progress < .08 ? 'remove' : undefined) : stage > this.stage ? (['remove', 'seat', 'latch'] as const)[stage] : undefined;
    this.weapon = id; this.stage = Math.max(starting ? -1 : this.stage, stage); this.progress = progress;
    return { reset, cue };
  }
}

export function limiterCurve(size = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i * 2 / (size - 1) - 1, a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= .78 ? a : .78 + .18 * Math.tanh((a - .78) / .18));
  }
  return curve;
}
