import type { PlayerState, Snapshot } from '../shared/types';

interface SnapshotIndex { players: Map<string, PlayerState>; shooters: Set<string> }
const indexes = new WeakMap<Snapshot, SnapshotIndex>();
const lerp = (a: number, b: number, t: number) => (1 - t) * a + t * b;
/** Received snapshots are immutable; discarded history releases its index too. */
export function snapshotIndex(snapshot: Snapshot): SnapshotIndex {
  let index = indexes.get(snapshot);
  if (!index) {
    const shooters = new Set<string>();
    for (const event of snapshot.events) if (event.type === 'shot' && event.player && snapshot.time - event.time < 1.1) shooters.add(event.player);
    index = { players: new Map(snapshot.players.map(player => [player.id, player])), shooters };
    indexes.set(snapshot, index);
  }
  return index;
}

export function interpolatePlayers(snapshot: Snapshot, history: Snapshot[], targetTime: number, selfId: string): PlayerState[] {
  let a = history[0] || snapshot, b = a;
  for (const frame of history) { if (frame.time <= targetTime) a = frame; if (frame.time >= targetTime) { b = frame; break; } b = frame; }
  const ratio = b.time > a.time ? Math.max(0, Math.min(1, (targetTime - a.time) / (b.time - a.time))) : 0;
  const from = snapshotIndex(a).players, to = snapshotIndex(b).players;
  return snapshot.players.map(player => {
    if (player.id === selfId) return player;
    const pa = from.get(player.id), pb = to.get(player.id);
    if (!pa || !pb || pa.hp <= 0 || pb.hp <= 0 || pa.deaths !== pb.deaths || Math.hypot(pa.body.x - pb.body.x, pa.body.z - pb.body.z) > 5) return player;
    const angle = Math.atan2(Math.sin(pb.body.yaw - pa.body.yaw), Math.cos(pb.body.yaw - pa.body.yaw));
    return { ...player, body: { ...pa.body, x: lerp(pa.body.x, pb.body.x, ratio), y: lerp(pa.body.y, pb.body.y, ratio), z: lerp(pa.body.z, pb.body.z, ratio), yaw: pa.body.yaw + angle * ratio } };
  });
}
