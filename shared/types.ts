import type { MapId } from './map.ts';

export type WeaponId = 'intervention' | 'ak47' | 'scar' | 'm9' | 'knife';
export type PrimaryId = 'intervention' | 'ak47' | 'scar';
export type Slot = 0 | 1 | 2;
export type GameMode = 'ffa' | 'tdm' | 'ctf';
export type Team = 'red' | 'blue';
export const MODES: Record<GameMode, { name: string; maxPlayers: number; defaultLimit: number }> = {
  ffa: { name: 'Free for All', maxPlayers: 16, defaultLimit: 20 },
  tdm: { name: 'Team Deathmatch', maxPlayers: 16, defaultLimit: 50 },
  ctf: { name: 'Capture the Flag', maxPlayers: 16, defaultLimit: 3 },
};
export interface Loadout { primary: PrimaryId; secondary: 'm9' }
export interface Vec3 { x: number; y: number; z: number }
export interface Input { seq: number; yaw: number; pitch: number; forward: number; right: number; jump: boolean; sprint: boolean; crouch: boolean; ads: boolean; fire: boolean; reload: boolean; slot: Slot; time: number; viewTime?: number; matchId?: string }
export interface Body extends Vec3 { vx: number; vy: number; vz: number; yaw: number; pitch: number; grounded: boolean; stance: 'stand' | 'crouch' | 'slide'; slideTime: number; slideCooldown: number; jumpHeld: boolean; crouchHeld: boolean }
export interface PlayerState { id: string; name: string; bot: boolean; team: Team | null; body: Body; hp: number; kills: number; deaths: number; captures: number; loadout: Loadout; slot: Slot; ammo: number[]; reserve: number[]; reloading: number; nextFire: number; ads: boolean; adsSince: number; ack: number; respawnAt: number; protectedUntil: number; lastDamage: number }
export interface LobbyPlayer { id: string; name: string; ready: boolean; loadout: Loadout; bot: boolean; team: Team | null; connected: boolean }
export interface RoomInfo { matchId: string; code: string; host: string; name: string; state: 'lobby' | 'playing' | 'finished'; players: LobbyPlayer[]; bots: number; limit: number; duration: number; private: boolean; mode: GameMode; map: MapId; maxPlayers: number }
export interface RoomSummary { code: string; name: string; players: number; maxPlayers: number; state: string; mode: GameMode; map: MapId }
export interface FlagState { team: Team; home: Vec3; position: Vec3; carrier: string | null; returnAt: number }
export interface GameEvent { id: number; type: 'shot' | 'hit' | 'kill' | 'respawn' | 'start' | 'end' | 'flag_pickup' | 'flag_drop' | 'flag_return' | 'flag_capture'; player?: string; target?: string; weapon?: WeaponId; damage?: number; headshot?: boolean; quickscope?: boolean; from?: Vec3; to?: Vec3; team?: Team; time: number }
export interface Snapshot { type: 'snapshot'; time: number; tick: number; matchId: string; players: PlayerState[]; events: GameEvent[]; endsAt: number; state: RoomInfo['state']; mode: GameMode; map: MapId; teamScores: Record<Team, number>; flags: FlagState[]; winner: string | null }
export type ClientMessage = { type:'create'; name: string; loadout: Loadout; bots: number; private: boolean; mode?: GameMode; map?: MapId } | { type:'join'; code:string; name:string; loadout:Loadout } | { type:'resume'; token:string } | { type:'list' } | { type:'loadout'; loadout:Loadout } | { type:'ready'; ready:boolean } | { type:'settings'; bots?:number; limit?:number; duration?:number; mode?:GameMode; map?:MapId } | { type:'start' } | { type:'leave' } | { type:'return' } | { type:'inputs'; inputs:Input[] } | { type:'ping'; time:number };
export type ServerMessage = {type:'welcome'; id:string; token:string; resumed:boolean; serverTime:number} | {type:'rooms'; rooms:RoomSummary[]} | {type:'room'; room:RoomInfo} | {type:'error'; message:string; code?:'resume_expired'} | {type:'left'} | {type:'pong'; time:number; serverTime:number} | Snapshot;
export interface Box { x:number; y:number; z:number; w:number; h:number; d:number; kind:string; color?:number }
