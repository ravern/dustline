import type { Body, FlagState, GameEvent, GrenadeState, PlayerState, ServerMessage, Snapshot, Vec3 } from './types.ts';

/** Explicitly negotiated; change the version whenever the positional schema changes.
 * Every snapshot stands alone and every number remains an ordinary JSON number.
 * There are no quantized coordinates, cross-message dictionaries or delta bases.
 */
export const SNAPSHOT_PROTOCOL = 'dustline.snapshot.v1';
const MARKER = 's1';
const vec = (p: Vec3) => [p.x, p.y, p.z] as const;
function row(value: unknown, length: number): unknown[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error('Invalid snapshot row');
  return value;
}
function readVec(value: unknown): Vec3 {
  const v = row(value, 3) as number[];
  return { x: v[0], y: v[1], z: v[2] };
}
const packBody = (b: Body) => [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.yaw, b.pitch, b.grounded, b.stance, b.slideTime, b.slideCooldown, b.jumpHeld, b.crouchHeld,
  b.vault ? [b.vault.elapsed, b.vault.duration, vec(b.vault.from), vec(b.vault.to), b.vault.height] as const : null] as const;
function readBody(value: unknown): Body {
  const b = row(value, 15) as unknown as ReturnType<typeof packBody>;
  const body: Body = { x: b[0], y: b[1], z: b[2], vx: b[3], vy: b[4], vz: b[5], yaw: b[6], pitch: b[7], grounded: b[8], stance: b[9], slideTime: b[10], slideCooldown: b[11], jumpHeld: b[12], crouchHeld: b[13] };
  if (b[14] !== null) {
    const v = row(b[14], 5) as unknown as NonNullable<typeof b[14]>;
    body.vault = { elapsed: v[0], duration: v[1], from: readVec(v[2]), to: readVec(v[3]), height: v[4] };
  }
  return body;
}
const packPlayer = (p: PlayerState) => [p.id, p.name, p.bot, p.team, packBody(p.body), p.hp, p.kills, p.deaths, p.captures, p.loadout.primary, p.loadout.secondary, p.slot, p.ammo, p.reserve, p.reloading, p.nextFire, p.ads, p.adsSince, p.ack, p.respawnAt, p.protectedUntil, p.lastDamage, p.grenades.frag, p.grenades.flash, p.nextGrenade, p.flashUntil, p.flashStrength] as const;
function readPlayer(value: unknown): PlayerState {
  const p = row(value, 27) as unknown as ReturnType<typeof packPlayer>;
  return { id: p[0], name: p[1], bot: p[2], team: p[3], body: readBody(p[4]), hp: p[5], kills: p[6], deaths: p[7], captures: p[8], loadout: { primary: p[9], secondary: p[10] }, slot: p[11], ammo: p[12], reserve: p[13], reloading: p[14], nextFire: p[15], ads: p[16], adsSince: p[17], ack: p[18], respawnAt: p[19], protectedUntil: p[20], lastDamage: p[21], grenades: { frag: p[22], flash: p[23] }, nextGrenade: p[24], flashUntil: p[25], flashStrength: p[26] };
}
const packFlag = (f: FlagState) => [f.team, vec(f.home), vec(f.position), f.carrier, f.returnAt] as const;
function readFlag(value: unknown): FlagState {
  const f = row(value, 5) as unknown as ReturnType<typeof packFlag>;
  return { team: f[0], home: readVec(f[1]), position: readVec(f[2]), carrier: f[3], returnAt: f[4] };
}
const packGrenade = (g: GrenadeState) => [g.id, g.kind, g.owner, g.team, vec(g.position), vec(g.velocity), g.thrownAt, g.detonateAt] as const;
function readGrenade(value: unknown): GrenadeState {
  const g = row(value, 8) as unknown as ReturnType<typeof packGrenade>;
  return { id: g[0], kind: g[1], owner: g[2], team: g[3], position: readVec(g[4]), velocity: readVec(g[5]), thrownAt: g[6], detonateAt: g[7] };
}
// Presence bits retain absent optional fields, zero values and explicit false.
const eventFields = ['player', 'target', 'weapon', 'grenade', 'grenadeId', 'strength', 'duration', 'damage', 'headshot', 'quickscope', 'from', 'to', 'team'] as const satisfies readonly (keyof GameEvent)[];
function packEvent(event: GameEvent): unknown[] {
  const values: unknown[] = [event.id, event.type, event.time, 0]; let mask = 0;
  for (let index = 0; index < eventFields.length; index++) {
    const field = eventFields[index], value = event[field];
    if (value !== undefined) { mask |= 1 << index; values.push(field === 'from' || field === 'to' ? vec(value as Vec3) : value); }
  }
  values[3] = mask; return values;
}
function readEvent(value: unknown): GameEvent {
  if (!Array.isArray(value) || value.length < 4) throw new Error('Invalid event');
  const mask: number = value[3];
  if (!Number.isInteger(mask) || mask < 0 || mask >= 1 << eventFields.length) throw new Error('Invalid event fields');
  const event: GameEvent = { id: value[0], type: value[1], time: value[2] }; let cursor = 4;
  for (let index = 0; index < eventFields.length; index++) if (mask & (1 << index)) {
    const field = eventFields[index], item = value[cursor++];
    (event as unknown as Record<string, unknown>)[field] = field === 'from' || field === 'to' ? readVec(item) : item;
  }
  if (cursor !== value.length) throw new Error('Invalid event row');
  return event;
}

export function encodeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify([MARKER, snapshot.time, snapshot.tick, snapshot.matchId, snapshot.players.map(packPlayer), snapshot.grenades.map(packGrenade), snapshot.events.map(packEvent), snapshot.endsAt, snapshot.state, snapshot.mode, snapshot.map, [snapshot.teamScores.red, snapshot.teamScores.blue], snapshot.flags.map(packFlag), snapshot.winner]);
}

/** Legacy object messages stay valid, including servers predating negotiation. */
export function decodeServerMessage(data: string): ServerMessage | undefined {
  try {
    const value = JSON.parse(data);
    if (!Array.isArray(value)) return value && typeof value.type === 'string' ? value as ServerMessage : undefined;
    if (value[0] !== MARKER) return undefined;
    row(value, 14); row(value[11], 2);
    return { type: 'snapshot', time: value[1], tick: value[2], matchId: value[3], players: value[4].map(readPlayer), grenades: value[5].map(readGrenade), events: value[6].map(readEvent), endsAt: value[7], state: value[8], mode: value[9], map: value[10], teamScores: { red: value[11][0], blue: value[11][1] }, flags: value[12].map(readFlag), winner: value[13] };
  } catch { return undefined; }
}
