import { randomUUID, randomBytes } from 'node:crypto';
import { getMap, MAPS, type MapId, type MapDefinition } from '../shared/map.ts';
import { route } from './navigation.ts';
import { MODES } from '../shared/types.ts';
import { bodyHeight, DT, eyeHeight, move, spawnBody } from '../shared/physics.ts';
import { WEAPONS, weaponForSlot } from '../shared/weapons.ts';
import type { Body, Box, ClientMessage, GameEvent, Input, Loadout, LobbyPlayer, PlayerState, RoomInfo, ServerMessage, Slot, Vec3, Team, GameMode, FlagState, Snapshot } from '../shared/types.ts';

const clockEpoch = Date.now() / 1000 - performance.now() / 1000;
export const clock = () => clockEpoch + performance.now() / 1000;
export const RECONNECT_GRACE = 20;
export const FLAG_RETURN_TIME = 20;
export const MAX_REWIND = .4;
export const MAX_COMMAND_CREDIT = 8;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const teams: Team[] = ['red', 'blue'];
const isMode = (value: unknown): value is GameMode => typeof value === 'string' && Object.hasOwn(MODES, value);
const isMap = (value: unknown): value is MapId => typeof value === 'string' && MAPS.some(map => map.id === value);
function cleanLoadout(value: unknown): Loadout {
  const l = value as Loadout | undefined;
  return { primary: l && ['intervention', 'ak47', 'scar'].includes(l.primary) ? l.primary : 'intervention', secondary: 'm9' };
}
function cleanName(value: unknown) {
  const name = typeof value === 'string' ? value.replace(/[<>\x00-\x1f\x7f]/g, '').trim().slice(0, 20) : '';
  if (!name) throw new Error('Enter your name before joining a match.');
  return name;
}
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
const idleInput = (): Input => ({ seq: -1, yaw: 0, pitch: 0, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: false, reload: false, slot: 0, time: 0 });
export function validInput(raw: unknown): Input | null {
  const v = raw as Input | null;
  if (!v || !Number.isSafeInteger(v.seq) || v.seq < 0 || ![v.yaw, v.pitch, v.forward, v.right, v.time].every(finite) || ![0, 1, 2].includes(v.slot)) return null;
  if (Math.abs(v.yaw) > 1e7 || Math.abs(v.time) > 1e12) return null;
  if (v.viewTime !== undefined && (!finite(v.viewTime) || Math.abs(v.viewTime) > 1e12)) return null;
  return { seq: v.seq, yaw: v.yaw % (Math.PI * 2), pitch: clamp(v.pitch, -1.48, 1.48), forward: clamp(v.forward, -1, 1), right: clamp(v.right, -1, 1), jump: v.jump === true, sprint: v.sprint === true, crouch: v.crouch === true, ads: v.ads === true, fire: v.fire === true, reload: v.reload === true, slot: v.slot, time: v.time, ...(v.viewTime === undefined ? {} : { viewTime: Math.min(v.time, v.viewTime) }), ...(typeof v.matchId === 'string' ? { matchId: v.matchId.slice(0, 64) } : {}) };
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
export function worldDistance(origin: Vec3, dir: Vec3, maxDistance: number, map: MapDefinition = getMap('yard')) {
  let nearest = maxDistance;
  for (const box of map.boxes) { const hit = rayBox(origin, dir, box); if (hit !== null) nearest = Math.min(nearest, hit); }
  if (dir.y < -.00001) nearest = Math.min(nearest, -origin.y / dir.y);
  return nearest;
}
interface History { time: number; body: Body; hp: number; protectedUntil: number }
interface Runtime { queue: Input[]; last: Input; maxSeq: number; lastReceive: number; commandCredit: number; fireHeld: boolean; reloadHeld: boolean; history: History[]; botGoal: Vec3; botThink: number; botStrafe: number; botSeq: number; lastPosition: Vec3; stuck: number; path: Vec3[]; pathTarget: Vec3; pathAt: number; recoveringUntil: number; droppedAck: number }
export interface Peer { id: string; token: string; connected: boolean; expiresAt: number; send: (message: ServerMessage) => void; close?: () => void; room?: Room; window: number; messages: number }

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
  mode: GameMode = 'ffa';
  map: MapId = 'yard';
  matchId = '';
  winner: string | null = null;
  teamScores: Record<Team, number> = { red: 0, blue: 0 };
  flags: FlagState[] = [];
  get arena() { return getMap(this.map); }
  get maxPlayers() { return MODES[this.mode].maxPlayers; }
  assignTeam(): Team | null {
    if (this.mode === 'ffa') return null;
    const count = (team: Team) => [...this.members.values()].filter(p => p.team === team).length;
    return count('red') <= count('blue') ? 'red' : 'blue';
  }
  balanceTeams() {
    let index = 0;
    for (const member of this.members.values()) member.team = this.mode === 'ffa' ? null : teams[index++ % 2];
  }
  enemies(a: PlayerState, b: PlayerState) { return a.id !== b.id && (this.mode === 'ffa' || a.team !== b.team); }
  constructor(readonly game: GameServer, readonly code: string, public host: string, readonly name: string, readonly privateRoom: boolean) {}
  get info(): RoomInfo { return { matchId: this.matchId, code: this.code, host: this.host, name: this.name, state: this.state, players: [...this.members.values()], bots: this.bots, limit: this.limit, duration: this.duration, private: this.privateRoom, mode: this.mode, map: this.map, maxPlayers: this.maxPlayers }; }
  broadcast(message: ServerMessage) { for (const id of this.members.keys()) this.game.peers.get(id)?.send(message); }
  publish() { this.broadcast({ type: 'room', room: this.info }); }
  add(peer: Peer, name: string, loadout: Loadout, now: number) {
    const cleaned = cleanName(name);
    const humanCount = [...this.members.values()].filter(p => !p.bot).length;
    if (humanCount >= this.maxPlayers) throw new Error('This lobby is full.');
    let team = this.assignTeam();
    // Replace a bot on the smaller human team before adding a late joiner.
    if (this.state === 'playing') {
      if (this.mode !== 'ffa') {
        const humans = (t: Team) => [...this.members.values()].filter(p => !p.bot && p.team === t).length;
        team = humans('red') <= humans('blue') ? 'red' : 'blue';
      }
      const teamFull = team !== null && [...this.members.values()].filter(p => p.team === team).length >= this.maxPlayers / 2;
      if (this.players.size >= this.maxPlayers || teamFull) {
        const bot = [...this.players.values()].find(p => p.bot && (team === null || p.team === team));
        if (bot) this.removePlayer(bot.id, now);
        else throw new Error('This team is full.');
      }
    }
    this.members.set(peer.id, { id: peer.id, name: cleaned, ready: peer.id === this.host, loadout: cleanLoadout(loadout), bot: false, team, connected: true });
    peer.room = this;
    if (this.state === 'playing') this.createPlayer(peer.id, false, now);
    this.bots = this.state === 'playing' ? [...this.players.values()].filter(p => p.bot).length : Math.min(this.bots, this.maxPlayers - humanCount - 1);
    this.publish();
    if (this.state !== 'lobby') peer.send(this.snapshot(now));
  }
  removePlayer(id: string, now = clock()) { this.dropFlags(id, now); this.players.delete(id); this.runtime.delete(id); if (this.members.get(id)?.bot) this.members.delete(id); }
  transferHost() {
    this.host = [...this.members.values()].find(p => !p.bot && p.connected)?.id || [...this.members.values()].find(p => !p.bot)?.id || '';
    if (this.host) this.members.get(this.host)!.ready = true;
  }
  remove(id: string, now = clock()) {
    this.members.delete(id); this.removePlayer(id, now);
    if (this.host === id) this.transferHost();
    if (![...this.members.values()].some(p => !p.bot)) { this.game.rooms.delete(this.code); return; }
    if (this.state === 'lobby') this.balanceTeams();
    this.publish();
  }
  event(event: Omit<GameEvent, 'id'>) { this.events.push({ ...event, id: ++this.eventSequence }); if (this.events.length > 256) this.events.splice(0, this.events.length - 256); }
  safeSpawn(team: Team | null = null): Vec3 {
    const occupied = [...this.players.values()].filter(p => p.hp > 0);
    const enemies = occupied.filter(p => team === null || p.team !== team);
    const spawns = team === null ? this.arena.spawns : this.arena.teamSpawns[team];
    const available = spawns.map(p => {
      const safety = enemies.length ? Math.min(...enemies.map(o => distance(p, o.body))) + Math.random() * 3 : Math.random() * 30;
      const overlaps = occupied.some(o => distance(p, o.body) < 1.2);
      return { p, score: safety - (overlaps ? 1000 : 0) };
    }).sort((a, b) => b.score - a.score);
    return { ...(available[0]?.p || { x: -22, y: 0, z: 22 }) };
  }
  createPlayer(id: string, bot: boolean, now: number) {
    const member = this.members.get(id)!;
    const spawn = this.safeSpawn(member.team);
    const old = this.players.get(id);
    const weapons = ([0, 1, 2] as Slot[]).map(slot => WEAPONS[weaponForSlot(member.loadout, slot)]);
    const body = spawnBody(spawn, Math.atan2(spawn.x, spawn.z));
    const player: PlayerState = { id, name: member.name, bot, team: member.team, captures: old?.captures || 0, body, hp: 100, kills: old?.kills || 0, deaths: old?.deaths || 0, loadout: { ...member.loadout }, slot: 0, ammo: weapons.map(w => w.mag), reserve: weapons.map(w => w.reserve), reloading: 0, nextFire: now + .25, ads: false, adsSince: 0, ack: old?.ack ?? -1, respawnAt: 0, protectedUntil: now + 1.2, lastDamage: 0 };
    this.players.set(id, player);
    const previousRuntime = this.runtime.get(id);
    this.runtime.set(id, { queue: [], last: { ...idleInput(), yaw: body.yaw }, maxSeq: previousRuntime?.maxSeq ?? -1, lastReceive: now, commandCredit: 0, fireHeld: false, reloadHeld: false, history: [], botGoal: this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)], botThink: 0, botStrafe: Math.random() > .5 ? 1 : -1, botSeq: previousRuntime?.botSeq || 0, lastPosition: spawn, stuck: 0, path: [], pathTarget: spawn, pathAt: 0, recoveringUntil: 0, droppedAck: -1 });
    return player;
  }
  start(now: number) {
    if (this.state !== 'lobby') throw new Error('This match has already started.');
    if ([...this.members.values()].some(p => !p.bot && (!p.ready || !p.connected))) throw new Error('Every operator must select Ready before deployment.');
    this.players.clear(); this.runtime.clear(); this.events.length = 0;
    for (const id of [...this.members.keys()]) if (this.members.get(id)!.bot) this.members.delete(id);
    const humans = this.members.size;
    for (let i = 0; i < Math.min(this.bots, this.maxPlayers - humans); i++) {
      const id = `bot-${this.code}-${i}`;
      this.members.set(id, { id, name: `Bot ${i + 1}`, ready: true, bot: true, team: this.assignTeam(), connected: true, loadout: { primary: i % 2 ? 'scar' : 'ak47', secondary: 'm9' } });
    }
    if (this.members.size < 2) throw new Error('Add at least one bot or invite another operator.');
    this.balanceTeams();
    this.matchId = randomUUID(); this.winner = null; this.teamScores = { red: 0, blue: 0 };
    this.flags = this.mode === 'ctf' ? teams.map(team => ({ team, home: { ...this.arena.flagBases[team] }, position: { ...this.arena.flagBases[team] }, carrier: null, returnAt: 0 })) : [];
    for (const member of this.members.values()) this.createPlayer(member.id, member.bot, now);
    this.state = 'playing'; this.endsAt = now + this.duration; this.tickNumber = 0;
    this.event({ type: 'start', time: now }); this.publish(); this.broadcast(this.snapshot(now));
  }
  returnToLobby() {
    if (this.state === 'playing') throw new Error('The match is still in progress.');
    this.state = 'lobby'; this.players.clear(); this.runtime.clear(); this.events.length = 0; this.endsAt = 0; this.flags = []; this.teamScores = { red: 0, blue: 0 }; this.winner = null;
    for (const [id, member] of this.members) { if (member.bot) this.members.delete(id); else member.ready = id === this.host; }
    this.publish();
  }
  enqueue(id: string, inputs: unknown, now: number) {
    if (this.state !== 'playing' || !Array.isArray(inputs) || inputs.length > 12) return;
    const rt = this.runtime.get(id); if (!rt) return;
    for (const raw of inputs) {
      const input = validInput(raw);
      if (!input || (input.matchId !== undefined && input.matchId !== this.matchId) || input.seq <= rt.maxSeq || input.seq > rt.maxSeq + 100000) continue;
      if (now - rt.lastReceive > MAX_COMMAND_CREDIT * DT + .001) rt.recoveringUntil = now + .5;
      if (rt.queue.length >= 30) {
        if (now < rt.recoveringUntil) rt.droppedAck = rt.queue.shift()!.seq;
        else break;
      }
      rt.maxSeq = input.seq; rt.lastReceive = now;
      const player = this.players.get(id);
      if (player && player.hp <= 0) { player.ack = input.seq; rt.queue.length = 0; }
      else rt.queue.push(input);
    }
  }
  dropFlags(id: string, now: number) {
    for (const flag of this.flags) if (flag.carrier === id) {
      const body = this.players.get(id)?.body;
      if (body) flag.position = { x: body.x, y: body.y, z: body.z };
      flag.carrier = null; flag.returnAt = now + FLAG_RETURN_TIME;
      this.event({ type: 'flag_drop', player: id, team: flag.team, time: now });
    }
  }
  returnFlag(flag: FlagState, now: number, player?: string) {
    flag.carrier = null; flag.returnAt = 0; flag.position = { ...flag.home };
    this.event({ type: 'flag_return', team: flag.team, player, time: now });
  }
  updateFlags(now: number) {
    if (this.mode !== 'ctf' || this.state !== 'playing') return;
    const living = [...this.players.values()].filter(p => p.hp > 0 && this.members.get(p.id)?.connected);
    const touches = (player: PlayerState, point: Vec3) => {
      if (distance(player.body, point) > 1.5) return false;
      const from = { x: player.body.x, y: player.body.y + .65, z: player.body.z };
      const to = { x: point.x, y: point.y + .65, z: point.z }, d = distance(from, to);
      return d < .01 || worldDistance(from, { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d }, d, this.arena) >= d - .01;
    };
    for (const flag of this.flags) {
      if (flag.carrier) {
        const carrier = this.players.get(flag.carrier);
        if (!carrier || carrier.hp <= 0 || !this.members.get(carrier.id)?.connected) this.dropFlags(flag.carrier, now);
        else flag.position = { x: carrier.body.x, y: carrier.body.y, z: carrier.body.z };
      }
      if (!flag.carrier && flag.returnAt && now >= flag.returnAt) this.returnFlag(flag, now);
      if (!flag.carrier && flag.returnAt) {
        const defender = living.find(p => p.team === flag.team && touches(p, flag.position));
        if (defender) this.returnFlag(flag, now, defender.id);
      }
      if (!flag.carrier) {
        const attacker = living.find(p => p.team !== flag.team && touches(p, flag.position));
        if (attacker) {
          flag.carrier = attacker.id; flag.returnAt = 0; flag.position = { x: attacker.body.x, y: attacker.body.y, z: attacker.body.z };
          attacker.protectedUntil = 0;
          this.event({ type: 'flag_pickup', team: flag.team, player: attacker.id, time: now });
        }
      }
    }
    // Evaluate captures after all returns, so simultaneous home-flag returns
    // and captures do not depend on which team is iterated first.
    for (const enemyFlag of this.flags) {
      const carrier = enemyFlag.carrier ? this.players.get(enemyFlag.carrier) : undefined;
      if (!carrier?.team || carrier.hp <= 0) continue;
      const ownFlag = this.flags.find(f => f.team === carrier.team)!;
      if (!ownFlag.carrier && !ownFlag.returnAt && touches(carrier, ownFlag.home)) {
        enemyFlag.carrier = null; enemyFlag.returnAt = 0; enemyFlag.position = { ...enemyFlag.home };
        this.teamScores[carrier.team]++; carrier.captures++;
        this.event({ type: 'flag_capture', team: carrier.team, player: carrier.id, time: now });
        if (this.teamScores[carrier.team] >= this.limit) { this.finish(now); break; }
      }
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
    let nearest = worldDistance(from, dir, weapon.range, this.arena);
    let target: PlayerState | null = null, headshot = false;
    // Rewind to the opponent timeline actually rendered when this command was
    // created. It already includes the client's adaptive interpolation delay.
    // Bound both future view times and total rewind; old clients retain 100ms lerp.
    const viewedTime = Math.min(input.time, input.viewTime ?? input.time - .1);
    const rewindTime = player.bot ? now : clamp(viewedTime, now - MAX_REWIND, now);
    for (const other of this.players.values()) {
      if (!this.enemies(player, other) || other.hp <= 0 || other.protectedUntil > now) continue;
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
        this.dropFlags(target.id, now);
        if (this.mode === 'tdm' && player.team) this.teamScores[player.team]++;
        if ((this.mode === 'ffa' && player.kills >= this.limit) || (this.mode === 'tdm' && player.team && this.teamScores[player.team] >= this.limit)) this.finish(now);
      }
    }
    return true;
  }
  finish(now: number) {
    if (this.state !== 'playing') return;
    if (this.mode === 'ffa') {
      const ranked = [...this.players.values()].sort((a, b) => b.kills - a.kills);
      this.winner = ranked[0] && ranked[0].kills > (ranked[1]?.kills ?? -1) ? ranked[0].id : null;
    } else this.winner = this.teamScores.red === this.teamScores.blue ? null : this.teamScores.red > this.teamScores.blue ? 'red' : 'blue';
    this.state = 'finished'; this.event({ type: 'end', time: now }); this.publish(); this.broadcast(this.snapshot(now)); }
  botInput(player: PlayerState, rt: Runtime, now: number): Input {
    const input = { ...idleInput(), seq: ++rt.botSeq, time: now, yaw: player.body.yaw, pitch: player.body.pitch };
    const origin = { x: player.body.x, y: player.body.y + eyeHeight(player.body), z: player.body.z };
    const opponents = [...this.players.values()].filter(p => this.enemies(player, p) && p.hp > 0 && p.protectedUntil <= now).sort((a, b) => distance(player.body, a.body) - distance(player.body, b.body));
    let target: PlayerState | undefined;
    for (const enemy of opponents) {
      const point = { x: enemy.body.x, y: enemy.body.y + bodyHeight(enemy.body) * .65, z: enemy.body.z }, d = distance(origin, point);
      const direction = { x: (point.x - origin.x) / d, y: (point.y - origin.y) / d, z: (point.z - origin.z) / d };
      if (d < 45 && worldDistance(origin, direction, d, this.arena) >= d - .2) { target = enemy; break; }
    }
    let destination: Vec3 = target?.body || rt.botGoal;
    if (!target && (now > rt.botThink || distance(player.body, destination) < 2.5)) { rt.botGoal = this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)]; rt.botThink = now + 5; destination = rt.botGoal; }
    if (this.mode === 'ctf' && player.team) {
      const ownFlag = this.flags.find(f => f.team === player.team)!;
      const enemyFlag = this.flags.find(f => f.team !== player.team)!;
      const carrying = enemyFlag.carrier === player.id;
      const defending = ownFlag.carrier || ownFlag.returnAt;
      // Carriers prioritize bringing the flag home; other bots pursue a stolen
      // home flag or take an attacking route when there is no visible threat.
      if ((carrying && !defending) || !target) {
        target = undefined;
        destination = carrying ? (defending ? ownFlag.position : ownFlag.home) : defending ? ownFlag.position : enemyFlag.position;
      }
    }
    if (!target) {
      if (now >= rt.pathAt || distance(destination, rt.pathTarget) > 3) {
        rt.path = route(this.arena, player.body, destination); rt.pathTarget = { ...destination }; rt.pathAt = now + 3 + (rt.botSeq % 30) / 30;
      }
      while (rt.path.length && Math.hypot(rt.path[0].x - player.body.x, rt.path[0].z - player.body.z) < .8) rt.path.shift();
      if (rt.path[0]) destination = rt.path[0];
    }
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
    } else { input.pitch = 0; input.forward = Math.abs(difference) < 1 ? 1 : .15; input.sprint = Math.abs(difference) < .25; }
    const moved = distance(player.body, rt.lastPosition);
    rt.stuck = moved < .02 ? rt.stuck + DT : 0;
    if (rt.stuck > .3) { input.jump = rt.botSeq % 40 < 2; input.right = rt.botStrafe; }
    if (rt.stuck > 1.8) { rt.botGoal = this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)]; rt.botThink = now + 4; rt.botStrafe *= -1; rt.stuck = 0; rt.pathAt = 0; }
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
      // A long interruption can create more debt than the bounded movement
      // budget can ever drain at 60 Hz. Acknowledge its obsolete prefix without
      // simulating it, then resume from recent commands. The client's normal
      // reconciliation absorbs one correction instead of permanent input lag.
      if (!player.bot && now < rt.recoveringUntil && rt.queue.length > rt.commandCredit) {
        const discarded = rt.queue.splice(0, rt.queue.length - rt.commandCredit);
        rt.droppedAck = Math.max(rt.droppedAck, discarded.at(-1)!.seq);
      }
      if (rt.droppedAck >= 0) { player.ack = Math.max(player.ack, rt.droppedAck); rt.droppedAck = -1; }
      const count = player.bot ? 1 : Math.min(rt.commandCredit, rt.queue.length);
      for (let index = 0; index < count && this.state === 'playing'; index++) {
        const input = player.bot ? this.botInput(player, rt, now) : rt.queue.shift()!;
        if (!player.bot) rt.commandCredit--;
        rt.last = input;
        player.body = move(player.body, input, DT, this.arena);
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
    this.updateFlags(now);
    if (this.tickNumber % 3 === 0) this.broadcast(this.snapshot(now));
  }
  snapshot(now: number): Snapshot { return { type: 'snapshot', time: now, tick: this.tickNumber, matchId: this.matchId, mode: this.mode, map: this.map, teamScores: { ...this.teamScores }, flags: this.flags.map(f => ({ ...f, home: { ...f.home }, position: { ...f.position } })), winner: this.winner, players: [...this.players.values()].map(p => ({ ...p, body: { ...p.body }, loadout: { ...p.loadout }, hp: Math.ceil(p.hp), ammo: [...p.ammo], reserve: [...p.reserve] })), events: this.events.filter(e => e.time >= now - 1), endsAt: this.endsAt, state: this.state }; }

}

export class GameServer {
  readonly rooms = new Map<string, Room>();
  readonly peers = new Map<string, Peer>();
  private readonly sessions = new Map<string, Peer>();
  connect(send: Peer['send'], id: string = randomUUID(), now = clock(), close?: () => void): Peer {
    const peer: Peer = { id, token: randomBytes(32).toString('base64url'), connected: true, expiresAt: 0, send, close, window: now, messages: 0 };
    this.peers.set(id, peer); this.sessions.set(peer.token, peer);
    this.welcome(peer, false, now);
    return peer;
  }
  private welcome(peer: Peer, resumed: boolean, now: number) { peer.send({ type: 'welcome', id: peer.id, token: peer.token, resumed, serverTime: now }); }
  disconnect(connection: string | Peer, now = clock()) {
    const peer = typeof connection === 'string' ? this.peers.get(connection) : connection;
    if (!peer || this.peers.get(peer.id) !== peer || !peer.connected) return;
    peer.connected = false; peer.expiresAt = now + RECONNECT_GRACE; peer.send = () => {};
    if (!peer.room) { this.removePeer(peer, now); return; }
    const room = peer.room, member = room.members.get(peer.id);
    if (member) member.connected = false;
    room.dropFlags(peer.id, now);
    const runtime = room.runtime.get(peer.id), player = room.players.get(peer.id);
    if (runtime) {
      if (runtime.queue.length && player) player.ack = runtime.queue.at(-1)!.seq;
      runtime.queue.length = 0; runtime.commandCredit = 0; runtime.fireHeld = false; runtime.reloadHeld = false;
    }
    if (room.host === peer.id) room.transferHost();
    room.publish();
  }
  private removePeer(peer: Peer, now: number) { peer.room?.remove(peer.id, now); this.sessions.delete(peer.token); this.peers.delete(peer.id); }
  private resume(peer: Peer, token: unknown, now: number) {
    const previous = typeof token === 'string' && token.length === 43 ? this.sessions.get(token) : undefined;
    if (!previous || previous === peer || (!previous.connected && previous.expiresAt <= now)) {
      peer.send({ type: 'error', code: 'resume_expired', message: 'Your previous session has ended. Join a match to play again.' });
      this.welcome(peer, false, now); return;
    }
    if (peer.room) throw new Error('Leave your current lobby before resuming another session.');
    this.sessions.delete(peer.token); this.peers.delete(peer.id);
    this.sessions.delete(previous.token);
    previous.connected = false; previous.send = () => {}; previous.close?.();
    // The new socket keeps its own Peer object; stale socket handlers fail the
    // identity check in receive/disconnect even though the player ID survives.
    peer.id = previous.id; peer.room = previous.room; peer.token = randomBytes(32).toString('base64url');
    peer.connected = true; peer.expiresAt = 0;
    this.peers.set(peer.id, peer); this.sessions.set(peer.token, peer);
    const room = peer.room, member = room?.members.get(peer.id);
    if (member) member.connected = true;
    const runtime = room?.runtime.get(peer.id), player = room?.players.get(peer.id);
    if (runtime) {
      if (runtime.queue.length && player) player.ack = runtime.queue.at(-1)!.seq;
      runtime.queue.length = 0; runtime.commandCredit = 0; runtime.lastReceive = now; runtime.recoveringUntil = 0; runtime.droppedAck = -1;
    }
    this.welcome(peer, true, now);
    if (room) { room.publish(); if (room.state !== 'lobby') peer.send(room.snapshot(now)); }
  }
  leave(peer: Peer, now = clock()) { peer.room?.remove(peer.id, now); peer.room = undefined; peer.send({ type: 'left' }); }
  receive(connection: string | Peer, raw: unknown, now = clock()) {
    const peer = typeof connection === 'string' ? this.peers.get(connection) : connection;
    if (!peer || !peer.connected || this.peers.get(peer.id) !== peer) return;
    if (now - peer.window >= 1) { peer.window = now; peer.messages = 0; }
    if (++peer.messages > 150) return;
    let message: ClientMessage;
    try {
      if (typeof raw === 'string' && raw.length > 32768) return;
      message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ClientMessage;
      if (!message || typeof message.type !== 'string') return;
    } catch { peer.send({ type: 'error', message: 'Invalid message.' }); return; }
    const room = peer.room, id = peer.id;
    try {
      switch (message.type) {
        case 'resume': this.resume(peer, message.token, now); break;
        case 'ping': if (finite(message.time)) peer.send({ type: 'pong', time: message.time, serverTime: now }); break;
        case 'list': peer.send({ type: 'rooms', rooms: [...this.rooms.values()].filter(r => !r.privateRoom).map(r => ({ code: r.code, name: r.name, players: [...r.members.values()].filter(p => !p.bot).length, maxPlayers: r.maxPlayers, mode: r.mode, map: r.map, state: r.state })) }); break;
        case 'create': {
          if (room) throw new Error('Leave your current lobby first.');
          const name = cleanName(message.name);
          if (this.rooms.size >= 200) throw new Error('The server is full. Try joining an existing lobby.');
          if (message.mode !== undefined && !isMode(message.mode)) throw new Error('Unknown game mode.');
          if (message.map !== undefined && !isMap(message.map)) throw new Error('Unknown map.');
          let code: string; do { code = randomBytes(4).toString('hex').slice(0, 5).toUpperCase(); } while (this.rooms.has(code));
          const newRoom = new Room(this, code, id, `${name}'s lobby`, message.private === true);
          newRoom.mode = message.mode ?? 'ffa'; newRoom.map = message.map ?? 'yard'; newRoom.limit = MODES[newRoom.mode].defaultLimit;
          newRoom.bots = finite(message.bots) ? clamp(Math.floor(message.bots), 0, newRoom.maxPlayers - 1) : 3;
          this.rooms.set(code, newRoom); newRoom.add(peer, name, message.loadout, now); break;
        }
        case 'join': {
          if (room) throw new Error('Leave your current lobby first.');
          const joinRoom = this.rooms.get(typeof message.code === 'string' ? message.code.trim().toUpperCase() : '');
          if (!joinRoom) throw new Error('Lobby not found. Check the five-character code.');
          if (joinRoom.state === 'finished') throw new Error('This match has ended. Wait for the host to return to the lobby.');
          joinRoom.add(peer, message.name, message.loadout, now); break;
        }
        case 'leave': this.leave(peer, now); break;
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
          if (message.mode !== undefined && !isMode(message.mode)) throw new Error('Unknown game mode.');
          if (message.map !== undefined && !isMap(message.map)) throw new Error('Unknown map.');
          if (message.mode && humanCount > MODES[message.mode].maxPlayers) throw new Error('Too many players for this game mode.');
          if (message.mode && room.mode !== message.mode) { room.mode = message.mode; room.limit = MODES[message.mode].defaultLimit; room.balanceTeams(); }
          if (message.map) room.map = message.map;
          room.bots = clamp(finite(message.bots) ? Math.floor(message.bots) : room.bots, 0, room.maxPlayers - humanCount);
          room.limit = finite(message.limit) ? clamp(Math.floor(message.limit), room.mode === 'ctf' ? 1 : 5, room.mode === 'ctf' ? 10 : 100) : room.limit;
          room.duration = finite(message.duration) ? clamp(Math.floor(message.duration), 60, 1200) : room.duration;
          for (const member of room.members.values()) if (!member.bot) member.ready = member.id === room.host;
          room.publish(); break;
        }
        case 'start': if (!room || room.host !== id) throw new Error('Only the host can deploy the lobby.'); else room.start(now); break;
        case 'return': if (!room || room.host !== id) throw new Error('Only the host can return everyone to the lobby.'); else room.returnToLobby(); break;
      }
    } catch (error) { peer.send({ type: 'error', message: error instanceof Error ? error.message : 'Request could not be completed.' }); }
  }
  tick(now: number) {
    for (const peer of this.peers.values()) if (!peer.connected && now >= peer.expiresAt) this.removePeer(peer, now);
    for (const room of this.rooms.values()) room.tick(now);
  }
}
