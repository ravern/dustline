import { randomUUID } from 'node:crypto';
import { MAP_BOXES, SPAWNS } from '../shared/map.ts';
import { bodyHeight, DT, eyeHeight, move, spawnBody } from '../shared/physics.ts';
import { WEAPONS, weaponForSlot } from '../shared/weapons.ts';
import type { Body, Box, ClientMessage, GameEvent, Input, Loadout, LobbyPlayer, PlayerState, RoomInfo, ServerMessage, Slot, Vec3 } from '../shared/types.ts';

export const clock = () => Date.now() / 1000;
export const MAX_REWIND = .4;
export const MAX_COMMAND_CREDIT = 8;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const DEFAULT_LOADOUT: Loadout = { primary: 'intervention', secondary: 'm9' };
function cleanLoadout(value: unknown): Loadout {
  const l = value as Loadout | undefined;
  return { primary: l && ['intervention', 'ak47', 'scar'].includes(l.primary) ? l.primary : 'intervention', secondary: 'm9' };
}
function cleanName(value: unknown, fallback = 'Operator') { return typeof value === 'string' ? value.replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 20) || fallback : fallback; }
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
const idleInput = (): Input => ({ seq: -1, yaw: 0, pitch: 0, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: false, reload: false, slot: 0, time: 0 });
export function validInput(raw: unknown): Input | null {
  const v = raw as Input | null;
  if (!v || !Number.isSafeInteger(v.seq) || v.seq < 0 || ![v.yaw, v.pitch, v.forward, v.right, v.time].every(finite) || ![0, 1, 2].includes(v.slot)) return null;
  if (Math.abs(v.yaw) > 1e7 || Math.abs(v.time) > 1e12) return null;
  if (v.viewTime !== undefined && (!finite(v.viewTime) || Math.abs(v.viewTime) > 1e12)) return null;
  return { seq: v.seq, yaw: v.yaw % (Math.PI * 2), pitch: clamp(v.pitch, -1.48, 1.48), forward: clamp(v.forward, -1, 1), right: clamp(v.right, -1, 1), jump: v.jump === true, sprint: v.sprint === true, crouch: v.crouch === true, ads: v.ads === true, fire: v.fire === true, reload: v.reload === true, slot: v.slot, time: v.time, ...(v.viewTime === undefined ? {} : { viewTime: Math.min(v.time, v.viewTime) }) };
}
/** Ray/AABB intersection distance. Returns null when the box isn't in front of the ray. */
export function rayBox(origin: Vec3, direction: Vec3, box: Box): number | null {
  let lo = 0, hi = Infinity;
  for (const [axis, dim] of [['x', 'w'], ['y', 'h'], ['z', 'd']] as const) {
    const min = box[axis] - box[dim] / 2, max = box[axis] + box[dim] / 2;
    if (Math.abs(direction[axis]) < 1e-8) { if (origin[axis] < min || origin[axis] > max) return null; }
    else { const a = (min - origin[axis]) / direction[axis], b = (max - origin[axis]) / direction[axis]; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); if (lo > hi) return null; }
  }
  return hi >= 0 ? lo : null;
}
export function worldDistance(origin: Vec3, dir: Vec3, maxDistance: number) {
  let nearest = maxDistance;
  for (const box of MAP_BOXES) { const hit = rayBox(origin, dir, box); if (hit !== null) nearest = Math.min(nearest, hit); }
  if (dir.y < -.00001) nearest = Math.min(nearest, -origin.y / dir.y);
  return nearest;
}
interface History { time: number; body: Body; hp: number; protectedUntil: number }
interface Runtime { queue: Input[]; last: Input; maxSeq: number; lastReceive: number; commandCredit: number; fireHeld: boolean; reloadHeld: boolean; history: History[]; botGoal: Vec3; botThink: number; botStrafe: number; botSeq: number; lastPosition: Vec3; stuck: number }
export interface Peer { id: string; send: (message: ServerMessage) => void; room?: Room; window: number; messages: number }

export class Room {
  readonly players = new Map<string, PlayerState>();
  readonly members = new Map<string, LobbyPlayer>();
  readonly runtime = new Map<string, Runtime>();
  readonly events: GameEvent[] = [];
  state: RoomInfo['state'] = 'lobby';
  bots = 3;
  limit = 20;
  duration = 360;
  endsAt = 0;
  tickNumber = 0;
  eventSequence = 0;
  constructor(readonly game: GameServer, readonly code: string, public host: string, readonly name: string, readonly privateRoom: boolean) {}
  get info(): RoomInfo { return { code: this.code, host: this.host, name: this.name, state: this.state, players: [...this.members.values()], bots: this.bots, limit: this.limit, duration: this.duration, private: this.privateRoom }; }
  broadcast(message: ServerMessage) { for (const id of this.members.keys()) this.game.peers.get(id)?.send(message); }
  publish() { this.broadcast({ type: 'room', room: this.info }); }
  add(peer: Peer, name: string, loadout: Loadout, now: number) {
    this.members.set(peer.id, { id: peer.id, name: cleanName(name), ready: peer.id === this.host, loadout: cleanLoadout(loadout), bot: false });
    peer.room = this;
    // Human joiners replace one bot when all six slots are occupied.
    if (this.state === 'playing') {
      if (this.players.size >= 6) { const bot = [...this.players.values()].find(p => p.bot); if (bot) this.removePlayer(bot.id); }
      this.createPlayer(peer.id, false, now);
    }
    this.bots = Math.min(this.bots, 6 - [...this.members.values()].filter(p => !p.bot).length);
    this.publish();
    if (this.state !== 'lobby') peer.send(this.snapshot(now));
  }
  removePlayer(id: string) { this.players.delete(id); this.runtime.delete(id); if (this.members.get(id)?.bot) this.members.delete(id); }
  remove(id: string) {
    this.members.delete(id); this.removePlayer(id);
    if (this.host === id) {
      this.host = [...this.members.values()].find(p => !p.bot)?.id || '';
      if (this.host) this.members.get(this.host)!.ready = true;
    }
    if (![...this.members.values()].some(p => !p.bot)) { this.game.rooms.delete(this.code); return; }
    this.publish();
  }
  event(event: Omit<GameEvent, 'id'>) { this.events.push({ ...event, id: ++this.eventSequence }); if (this.events.length > 48) this.events.splice(0, this.events.length - 48); }
  safeSpawn(): Vec3 {
    const living = [...this.players.values()].filter(p => p.hp > 0);
    const available = SPAWNS.map(p => ({ p, score: living.length ? Math.min(...living.map(o => distance(p, o.body))) + Math.random() * 3 : Math.random() * 30 })).sort((a, b) => b.score - a.score);
    return { ...(available[0]?.p || { x: -22, y: 0, z: 22 }) };
  }
  createPlayer(id: string, bot: boolean, now: number) {
    const member = this.members.get(id)!;
    const spawn = this.safeSpawn();
    const old = this.players.get(id);
    const weapons = ([0, 1, 2] as Slot[]).map(slot => WEAPONS[weaponForSlot(member.loadout, slot)]);
    const body = spawnBody(spawn, Math.atan2(spawn.x, spawn.z));
    const player: PlayerState = { id, name: member.name, bot, body, hp: 100, kills: old?.kills || 0, deaths: old?.deaths || 0, loadout: { ...member.loadout }, slot: 0, ammo: weapons.map(w => w.mag), reserve: weapons.map(w => w.reserve), reloading: 0, nextFire: now + .25, ads: false, adsSince: 0, ack: old?.ack ?? -1, respawnAt: 0, protectedUntil: now + 1.2, lastDamage: 0 };
    this.players.set(id, player);
    const previousRuntime = this.runtime.get(id);
    this.runtime.set(id, { queue: [], last: { ...idleInput(), yaw: body.yaw }, maxSeq: previousRuntime?.maxSeq ?? -1, lastReceive: now, commandCredit: 0, fireHeld: false, reloadHeld: false, history: [], botGoal: SPAWNS[Math.floor(Math.random() * SPAWNS.length)], botThink: 0, botStrafe: Math.random() > .5 ? 1 : -1, botSeq: previousRuntime?.botSeq || 0, lastPosition: spawn, stuck: 0 });
    return player;
  }
  start(now: number) {
    if (this.state !== 'lobby') throw new Error('This match has already started.');
    if ([...this.members.values()].some(p => !p.bot && !p.ready)) throw new Error('Every operator must select Ready before deployment.');
    this.players.clear(); this.runtime.clear(); this.events.length = 0;
    for (const id of [...this.members.keys()]) if (this.members.get(id)!.bot) this.members.delete(id);
    const humans = this.members.size;
    for (let i = 0; i < Math.min(this.bots, 6 - humans); i++) {
      const id = `bot-${this.code}-${i}`;
      this.members.set(id, { id, name: ['Viper', 'Ghost', 'Havoc', 'Rook', 'Nomad'][i], ready: true, bot: true, loadout: { primary: i % 2 ? 'scar' : 'ak47', secondary: 'm9' } });
    }
    if (this.members.size < 2) throw new Error('Add at least one bot or invite another operator.');
    for (const member of this.members.values()) this.createPlayer(member.id, member.bot, now);
    this.state = 'playing'; this.endsAt = now + this.duration; this.tickNumber = 0;
    this.event({ type: 'start', time: now }); this.publish(); this.broadcast(this.snapshot(now));
  }
  returnToLobby() {
    if (this.state === 'playing') throw new Error('The match is still in progress.');
    this.state = 'lobby'; this.players.clear(); this.runtime.clear(); this.events.length = 0; this.endsAt = 0;
    for (const [id, member] of this.members) { if (member.bot) this.members.delete(id); else member.ready = id === this.host; }
    this.publish();
  }
  enqueue(id: string, inputs: unknown, now: number) {
    if (this.state !== 'playing' || !Array.isArray(inputs) || inputs.length > 12) return;
    const rt = this.runtime.get(id); if (!rt) return;
    for (const raw of inputs) {
      const input = validInput(raw);
      if (!input || input.seq <= rt.maxSeq || input.seq > rt.maxSeq + 100000) continue;
      if (rt.queue.length >= 30) break;
      rt.maxSeq = input.seq; rt.lastReceive = now;
      const player = this.players.get(id);
      if (player && player.hp <= 0) { player.ack = input.seq; rt.queue.length = 0; }
      else rt.queue.push(input);
    }
  }
  historicalBody(id: string, time: number): History | null {
    const history = this.runtime.get(id)?.history; if (!history?.length) return null;
    let a = history[0], b = a;
    for (const sample of history) { if (sample.time <= time) a = sample; if (sample.time >= time) { b = sample; break; } b = sample; }
    const t = b.time > a.time ? clamp((time - a.time) / (b.time - a.time), 0, 1) : 0;
    return { ...a, body: { ...a.body, x: a.body.x + (b.body.x - a.body.x) * t, y: a.body.y + (b.body.y - a.body.y) * t, z: a.body.z + (b.body.z - a.body.z) * t } };
  }
  shoot(player: PlayerState, input: Input, now: number) {
    const weaponId = weaponForSlot(player.loadout, player.slot), weapon = WEAPONS[weaponId];
    if (player.hp <= 0 || player.reloading > now || player.nextFire > now || (weaponId !== 'knife' && player.ammo[player.slot] <= 0)) return false;
    player.nextFire = now + weapon.fireInterval;
    if (weaponId !== 'knife') player.ammo[player.slot]--;
    player.protectedUntil = 0;
    const from = { x: player.body.x, y: player.body.y + eyeHeight(player.body), z: player.body.z };
    const scoped = player.ads && now - player.adsSince >= weapon.adsTime;
    const spread = scoped ? weapon.adsSpread : weapon.hipSpread;
    const yaw = player.body.yaw + (Math.random() - .5) * spread, pitch = player.body.pitch + (Math.random() - .5) * spread;
    const dir = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    let nearest = worldDistance(from, dir, weapon.range);
    let target: PlayerState | null = null, headshot = false;
    // Rewind to the opponent timeline actually rendered when this command was
    // created. It already includes the client's adaptive interpolation delay.
    // Bound both future view times and total rewind; old clients retain 100ms lerp.
    const viewedTime = Math.min(input.time, input.viewTime ?? input.time - .1);
    const rewindTime = player.bot ? now : clamp(viewedTime, now - MAX_REWIND, now);
    for (const other of this.players.values()) {
      if (other.id === player.id || other.hp <= 0 || other.protectedUntil > now) continue;
      const historic = this.historicalBody(other.id, rewindTime);
      if (historic && (historic.hp <= 0 || historic.protectedUntil > rewindTime)) continue;
      const b = historic?.body || other.body;
      const height = bodyHeight(b);
      // A generous knife hull gives close combat a satisfying, reliable sweep.
      const size = weaponId === 'knife' ? .95 : .68;
      const hit = rayBox(from, dir, { x: b.x, y: b.y + height / 2, z: b.z, w: size, h: height, d: size, kind: 'player' });
      if (hit !== null && hit < nearest) { nearest = hit; target = other; headshot = weaponId !== 'knife' && from.y + dir.y * hit > b.y + height - .38; }
    }
    const to = { x: from.x + dir.x * nearest, y: from.y + dir.y * nearest, z: from.z + dir.z * nearest };
    this.event({ type: 'shot', player: player.id, weapon: weaponId, from, to, time: now });
    if (target) {
      const damage = Math.round(weapon.damage * (headshot ? weapon.headMultiplier : 1));
      target.hp = Math.max(0, target.hp - damage); target.lastDamage = now;
      const quickscope = weaponId === 'intervention' && scoped && now - player.adsSince <= .6;
      this.event({ type: 'hit', player: player.id, target: target.id, weapon: weaponId, damage, headshot, quickscope, time: now });
      if (target.hp === 0) {
        const targetRuntime = this.runtime.get(target.id);
        if (targetRuntime?.queue.length) { target.ack = targetRuntime.queue.at(-1)!.seq; targetRuntime.queue.length = 0; }
        player.kills++; target.deaths++; target.respawnAt = now + 2.5; target.reloading = 0; target.ads = false;
        this.event({ type: 'kill', player: player.id, target: target.id, weapon: weaponId, damage, headshot, quickscope, time: now });
        if (player.kills >= this.limit) this.finish(now);
      }
    }
    return true;
  }
  finish(now: number) { if (this.state !== 'playing') return; this.state = 'finished'; this.event({ type: 'end', time: now }); this.publish(); this.broadcast(this.snapshot(now)); }
  botInput(player: PlayerState, rt: Runtime, now: number): Input {
    const input = { ...idleInput(), seq: ++rt.botSeq, time: now, yaw: player.body.yaw, pitch: player.body.pitch };
    const origin = { x: player.body.x, y: player.body.y + eyeHeight(player.body), z: player.body.z };
    const opponents = [...this.players.values()].filter(p => p.id !== player.id && p.hp > 0 && p.protectedUntil <= now).sort((a, b) => distance(player.body, a.body) - distance(player.body, b.body));
    let target: PlayerState | undefined;
    for (const enemy of opponents) {
      const point = { x: enemy.body.x, y: enemy.body.y + bodyHeight(enemy.body) * .65, z: enemy.body.z }, d = distance(origin, point);
      const direction = { x: (point.x - origin.x) / d, y: (point.y - origin.y) / d, z: (point.z - origin.z) / d };
      if (d < 45 && worldDistance(origin, direction, d) >= d - .2) { target = enemy; break; }
    }
    let destination: Vec3 = target?.body || rt.botGoal;
    if (!target && (now > rt.botThink || distance(player.body, destination) < 2.5)) { rt.botGoal = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]; rt.botThink = now + 5; destination = rt.botGoal; }
    const dx = destination.x - player.body.x, dz = destination.z - player.body.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const difference = Math.atan2(Math.sin(desiredYaw - player.body.yaw), Math.cos(desiredYaw - player.body.yaw));
    input.yaw = player.body.yaw + clamp(difference, -.09, .09);
    if (target) {
      const d = Math.max(1, Math.hypot(dx, dz));
      input.pitch = Math.atan2(target.body.y + bodyHeight(target.body) * .65 - origin.y, d) + Math.sin(now * 2.8 + rt.botSeq * .001) * .024;
      input.forward = d > 15 ? 1 : d < 6 ? -.7 : .2;
      input.right = rt.botStrafe * .6;
      input.ads = true;
      // A 400ms reaction period and imperfect aim keep practice opponents fair.
      input.fire = Math.abs(difference) < .1 && player.ads && now - player.adsSince > .4;
    } else { input.pitch = 0; input.forward = 1; input.sprint = true; }
    const moved = distance(player.body, rt.lastPosition);
    rt.stuck = moved < .02 ? rt.stuck + DT : 0;
    if (rt.stuck > .3) { input.jump = rt.botSeq % 40 < 2; input.right = rt.botStrafe; }
    if (rt.stuck > 1.8) { rt.botGoal = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]; rt.botThink = now + 4; rt.botStrafe *= -1; rt.stuck = 0; }
    rt.lastPosition = { ...player.body };
    input.reload = player.ammo[0] === 0 || (!target && player.ammo[0] < 8);
    return input;
  }
  tick(now: number) {
    if (this.state !== 'playing') return;
    this.tickNumber++;
    if (now >= this.endsAt) { this.finish(now); return; }
    for (const existing of this.players.values()) {
      if (this.state !== 'playing') break;
      let player = existing;
      if (player.hp <= 0) { if (now >= player.respawnAt) { player = this.createPlayer(player.id, player.bot, now); this.event({ type: 'respawn', player: player.id, time: now }); } else continue; }
      const rt = this.runtime.get(player.id)!;
      // Clock-driven work happens once regardless of how many delayed commands
      // this tick can replay. Catchup must never accelerate reloads or healing.
      if (player.reloading && now >= player.reloading) {
        const weapon = WEAPONS[weaponForSlot(player.loadout, player.slot)];
        const transfer = Math.min(weapon.mag - player.ammo[player.slot], player.reserve[player.slot]);
        player.ammo[player.slot] += transfer; player.reserve[player.slot] -= transfer; player.reloading = 0;
      }
      if (now - player.lastDamage > 5 && player.hp < 100) player.hp = Math.min(100, player.hp + 25 * DT);

      // One elapsed server tick earns one fixed movement step. Saving a small
      // budget during packet gaps lets arrivals catch up without advancing the
      // acknowledged state beyond elapsed server simulation time.
      if (!player.bot) rt.commandCredit = Math.min(MAX_COMMAND_CREDIT, rt.commandCredit + 1);
      const count = player.bot ? 1 : Math.min(rt.commandCredit, rt.queue.length);
      for (let index = 0; index < count && this.state === 'playing'; index++) {
        const input = player.bot ? this.botInput(player, rt, now) : rt.queue.shift()!;
        if (!player.bot) rt.commandCredit--;
        rt.last = input;
        player.body = move(player.body, input, DT);
        player.ack = input.seq;
        if (input.slot !== player.slot) { player.slot = input.slot; player.reloading = 0; player.nextFire = Math.max(player.nextFire, now + .2); player.ads = false; rt.fireHeld = false; }
        const weapon = WEAPONS[weaponForSlot(player.loadout, player.slot)];
        const ads = input.ads && !input.sprint && player.reloading <= now && player.body.stance !== 'slide' && weapon.id !== 'knife';
        if (ads && !player.ads) player.adsSince = now;
        player.ads = ads;
        if (input.reload && !rt.reloadHeld && !player.reloading && player.ammo[player.slot] < weapon.mag && player.reserve[player.slot] > 0) { player.reloading = now + weapon.reloadTime; player.ads = false; }
        rt.reloadHeld = input.reload;
        const sprinting = input.sprint && input.forward > 0 && !input.ads && player.body.stance === 'stand';
        // Execute at this command's body/aim/weapon before the next queued
        // command can change them. Every shot still shares the current server
        // time, so a burst of commands cannot bypass weapon fire cooldowns.
        if (input.fire && !sprinting && (weapon.automatic || !rt.fireHeld)) this.shoot(player, input, now);
        rt.fireHeld = input.fire;
      }
      rt.history.push({ time: now, body: { ...player.body }, hp: player.hp, protectedUntil: player.protectedUntil });
      while (rt.history.length > 1 && rt.history[0].time < now - .5) rt.history.shift();
    }
    if (this.tickNumber % 3 === 0) this.broadcast(this.snapshot(now));
  }
  snapshot(now: number) { return { type: 'snapshot' as const, time: now, tick: this.tickNumber, players: [...this.players.values()].map(p => ({ ...p, body: { ...p.body }, hp: Math.ceil(p.hp), ammo: [...p.ammo], reserve: [...p.reserve] })), events: this.events.filter(e => e.time >= now - 2), endsAt: this.endsAt, state: this.state }; }
}

export class GameServer {
  readonly rooms = new Map<string, Room>();
  readonly peers = new Map<string, Peer>();
  connect(send: Peer['send'], id: string = randomUUID()): Peer { const peer = { id, send, window: 0, messages: 0 }; this.peers.set(id, peer); send({ type: 'welcome', id }); return peer; }
  disconnect(id: string) { const peer = this.peers.get(id); peer?.room?.remove(id); this.peers.delete(id); }
  leave(peer: Peer) { peer.room?.remove(peer.id); peer.room = undefined; peer.send({ type: 'left' }); }
  receive(id: string, raw: unknown, now = clock()) {
    const peer = this.peers.get(id); if (!peer) return;
    if (now - peer.window > 1) { peer.window = now; peer.messages = 0; }
    if (++peer.messages > 150) return;
    let message: ClientMessage;
    try { message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ClientMessage; if (!message || typeof message.type !== 'string') return; }
    catch { peer.send({ type: 'error', message: 'Invalid message.' }); return; }
    const room = peer.room;
    try {
      switch (message.type) {
        case 'ping': if (finite(message.time)) peer.send({ type: 'pong', time: message.time, serverTime: now }); break;
        case 'list': peer.send({ type: 'rooms', rooms: [...this.rooms.values()].filter(r => !r.privateRoom).map(r => ({ code: r.code, name: r.name, players: [...r.members.values()].filter(p => !p.bot).length, maxPlayers: 6, state: r.state })) }); break;
        case 'create': {
          if (room) throw new Error('Leave your current lobby first.');
          let code: string; do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (this.rooms.has(code));
          const newRoom = new Room(this, code, id, `${cleanName(message.name)}'s lobby`, message.private === true);
          newRoom.bots = finite(message.bots) ? clamp(Math.floor(message.bots), 0, 5) : 3;
          this.rooms.set(code, newRoom); newRoom.add(peer, message.name, message.loadout, now); break;
        }
        case 'join': {
          if (room) throw new Error('Leave your current lobby first.');
          const joinRoom = this.rooms.get(typeof message.code === 'string' ? message.code.trim().toUpperCase() : '');
          if (!joinRoom) throw new Error('Lobby not found. Check the five-character code.');
          if ([...joinRoom.members.values()].filter(p => !p.bot).length >= 6) throw new Error('This lobby is full.');
          if (joinRoom.state === 'finished') throw new Error('This match has ended. Wait for the host to return to the lobby.');
          joinRoom.add(peer, message.name, message.loadout, now); break;
        }
        case 'leave': this.leave(peer); break;
        case 'inputs': room?.enqueue(id, message.inputs, now); break;
        case 'loadout': {
          if (!room) throw new Error('Join a lobby first.');
          if (room.state !== 'lobby') throw new Error('Loadouts are locked during a match.');
          const member = room.members.get(id)!; member.loadout = cleanLoadout(message.loadout); member.ready = id === room.host; room.publish(); break;
        }
        case 'ready': {
          if (!room || room.state !== 'lobby') break;
          room.members.get(id)!.ready = id === room.host || message.ready === true; room.publish(); break;
        }
        case 'settings': {
          if (!room || room.host !== id) throw new Error('Only the host can change match settings.');
          if (room.state !== 'lobby') throw new Error('Match settings are locked.');
          const humanCount = [...room.members.values()].filter(p => !p.bot).length;
          room.bots = finite(message.bots) ? clamp(Math.floor(message.bots), 0, 6 - humanCount) : room.bots;
          room.limit = finite(message.limit) ? clamp(Math.floor(message.limit), 5, 50) : room.limit;
          room.duration = finite(message.duration) ? clamp(Math.floor(message.duration), 60, 1200) : room.duration;
          room.publish(); break;
        }
        case 'start': if (!room || room.host !== id) throw new Error('Only the host can deploy the lobby.'); else room.start(now); break;
        case 'return': if (!room || room.host !== id) throw new Error('Only the host can return everyone to the lobby.'); else room.returnToLobby(); break;
      }
    } catch (error) { peer.send({ type: 'error', message: error instanceof Error ? error.message : 'Request could not be completed.' }); }
  }
  tick(now: number) { for (const room of this.rooms.values()) room.tick(now); }
}
