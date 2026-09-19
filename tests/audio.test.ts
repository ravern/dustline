import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.ts';
import { limiterCurve, ReloadAudioSequence, SHOT_VARIANTS, synthesizeReload, synthesizeShot, WEAPON_AUDIO_RATE } from '../src/weapon-audio.ts';
import type { WeaponId } from '../shared/types.ts';

const ids: WeaponId[] = ['intervention', 'deagle', 'scar', 'ak47', 'm9', 'glock', 'knife'];
const energy = (samples: Float32Array) => samples.reduce((sum, value) => sum + value * value, 0) / WEAPON_AUDIO_RATE;
function bassEnergy(samples: Float32Array) {
  let low = 0, sum = 0;
  for (const sample of samples) { low += .025 * (sample - low); sum += low * low; }
  return sum / WEAPON_AUDIO_RATE;
}

test('original shot and reload banks fit in 1MB, retain headroom, and end cleanly', () => {
  let bytes = 0;
  for (const id of ids) {
    const recordings = Array.from({ length: SHOT_VARIANTS }, (_, i) => synthesizeShot(id, i));
    if (id !== 'knife') for (const cue of ['remove', 'seat', 'latch'] as const) recordings.push(synthesizeReload(id, cue));
    for (const recording of recordings) {
      bytes += recording.byteLength;
      assert.ok(recording.every(sample => Number.isFinite(sample) && Math.abs(sample) < .93), `${id} clips`);
      assert.equal(Math.abs(recording[0]), 0); assert.equal(Math.abs(recording.at(-1)!), 0);
      assert.ok(energy(recording) > .000005, `${id} silent recording`);
    }
    assert.notDeepEqual(recordings[0], recordings[1], `${id} repeats identical noise`);
  }
  assert.ok(bytes < 1024 * 1024, `weapon audio bank uses ${bytes} bytes`);
});

test('weapon reports have ordered physical weight and Glock has a short automatic-fire tail', () => {
  const bank = new Map(ids.map(id => [id, synthesizeShot(id)]));
  for (const [heavy, light] of [['intervention', 'deagle'], ['deagle', 'scar'], ['scar', 'ak47'], ['ak47', 'm9'], ['m9', 'glock']] as const) {
    assert.ok(energy(bank.get(heavy)!) > energy(bank.get(light)!), `${heavy} has less overall weight than ${light}`);
    assert.ok(bassEnergy(bank.get(heavy)!) > bassEnergy(bank.get(light)!), `${heavy} has less body than ${light}`);
  }
  assert.ok(bank.get('glock')!.length / WEAPON_AUDIO_RATE < .2);
  const sniper = bank.get('intervention')!;
  assert.ok(energy(sniper.slice(.33 * WEAPON_AUDIO_RATE, .42 * WEAPON_AUDIO_RATE)) > .000002, 'bolt click is missing');
});

test('reload cues follow phase crossings once, without replaying corrections or missed stages', () => {
  const sequence = new ReloadAudioSequence();
  assert.deepEqual(sequence.update('scar', 0), { reset: false });
  assert.equal(sequence.update('scar', .01).cue, 'remove');
  for (const progress of [.02, .2, .49]) assert.equal(sequence.update('scar', progress).cue, undefined);
  assert.equal(sequence.update('scar', .51).cue, 'seat');
  assert.equal(sequence.update('scar', .48).cue, undefined);
  assert.equal(sequence.update('scar', .52).cue, undefined);
  assert.equal(sequence.update('scar', .84).cue, 'latch');
  assert.equal(sequence.update('scar', .95).cue, undefined);
  assert.deepEqual(sequence.update('scar', 0), { reset: true });
  assert.equal(sequence.update('scar', .01).cue, 'remove');
  assert.equal(sequence.update('scar', .9).cue, 'latch', 'a long frame must not play three delayed sounds together');
});

test('cancel, death, knife and weapon swaps reset reload foley; mid-reload resume skips old sounds', () => {
  const sequence = new ReloadAudioSequence();
  sequence.update('m9', .01);
  assert.deepEqual(sequence.update('m9', 0), { reset: true });
  assert.deepEqual(sequence.update('m9', 0), { reset: false });
  assert.equal(sequence.update('m9', .67).cue, undefined);
  assert.equal(sequence.update('m9', .83).cue, 'latch');
  assert.deepEqual(sequence.update('knife', .6), { reset: true });
  assert.equal(sequence.update('deagle', .02).cue, 'remove');
  assert.deepEqual(sequence.update('glock', .62), { reset: true, cue: undefined });
  assert.deepEqual(sequence.update('glock', NaN), { reset: true });
});

test('output ceiling is symmetric, bounded, monotonic and leaves quiet details unchanged', () => {
  const curve = limiterCurve(), middle = (curve.length - 1) / 2;
  assert.equal(curve[middle], 0);
  for (let i = 0; i < curve.length; i++) {
    assert.ok(Math.abs(curve[i]) < .96);
    assert.ok(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-7);
    if (i) assert.ok(curve[i] >= curve[i - 1]);
    const input = i / middle - 1;
    if (Math.abs(input) < .7) assert.ok(Math.abs(curve[i] - input) < 1e-7);
  }
});

class Param {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param(); pan = new Param(); frequency = new Param(); threshold = new Param();
  knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  connections = new Set<Node>(); onended: (() => void) | null = null;
  started = false; stopped = false; buffer?: unknown;
  constructor(readonly kind: string) {}
  connect(node: Node) { this.connections.add(node); return node; }
  disconnect() { this.connections.clear(); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  end() { this.onended?.(); }
}
class Context {
  sampleRate = 48000; currentTime = 0; state = 'running'; destination = new Node('destination');
  nodes: Node[] = []; bufferCount = 0;
  node(kind: string) { const node = new Node(kind); this.nodes.push(node); return node; }
  createBuffer(_channels: number, length: number) { this.bufferCount++; const samples = new Float32Array(length); return { getChannelData: () => samples }; }
  createGain() { return this.node('gain'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('limiter'); }
  createBufferSource() { return this.node('source'); }
  createStereoPanner() { return this.node('pan'); }
  createBiquadFilter() { return this.node('filter'); }
  createOscillator() { return this.node('oscillator'); }
}
function engine() {
  const original = globalThis.AudioContext;
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  try { const engine = new AudioEngine(); engine.unlock(); return { engine, context: engine.ctx as unknown as Context }; }
  finally { globalThis.AudioContext = original; }
}

test('gunfire reuses cached layers as one spatial voice and releases its graph after playback', () => {
  const { engine: audio, context } = engine(), buffers = context.bufferCount, nodes = context.nodes.length;
  audio.shot('intervention', 12, -1);
  const shot = context.nodes.slice(nodes);
  assert.deepEqual(shot.map(node => node.kind), ['source', 'gain', 'pan']);
  assert.equal(shot[0].started, true); assert.equal(shot[2].pan.value, -1);
  assert.ok(Math.abs(shot[1].gain.value - 1 / (1 + 12 * .085)) < 1e-10);
  shot[0].end(); assert.ok(shot.every(node => node.connections.size === 0));
  audio.shot('glock', 30, .75); audio.shot('deagle', 0, 5);
  assert.equal(context.bufferCount, buffers); assert.equal(context.nodes.at(-1)!.pan.value, 1);
});

test('crowded firefights bound active voices and preserve near shots over quiet distant ones', () => {
  const { engine: audio, context } = engine();
  for (let i = 0; i < 100; i++) audio.shot('glock', 30, 0);
  const active = () => context.nodes.filter(node => node.kind === 'source' && node.started && !node.stopped && node.connections.size > 0);
  assert.equal(active().length, 64);
  audio.shot('deagle', 0, 0); assert.equal(active().length, 64);
  const near = context.nodes.at(-3)!; assert.equal(near.started, true);
  for (const source of active()) source.end(); assert.equal(active().length, 0);
});

test('canceling a reload stops and disconnects active foley; muted phases do not replay later', () => {
  const { engine: audio, context } = engine();
  audio.updateReload('scar', .01); const source = context.nodes.at(-3)!;
  assert.equal(source.started, true); audio.updateReload('scar', 0);
  assert.equal(source.stopped, true); assert.equal(source.connections.size, 0);
  audio.setVolume(0); const before = context.nodes.length;
  audio.updateReload('scar', .01); audio.updateReload('scar', .51);
  audio.setVolume(.45); audio.updateReload('scar', .6); assert.equal(context.nodes.length, before);
  audio.updateReload('scar', .83); assert.equal(context.nodes.length, before + 3);
  audio.updateReload('knife', 0); assert.equal(context.nodes.at(-3)!.stopped, true);
});
