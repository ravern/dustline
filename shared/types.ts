export type WeaponId = 'intervention' | 'ak47' | 'scar' | 'm9' | 'knife';
export type PrimaryId = 'intervention' | 'ak47' | 'scar';
export type Slot = 0 | 1 | 2;
export interface Loadout { primary: PrimaryId; secondary: 'm9' }
export interface Vec3 { x: number; y: number; z: number }
export interface Input { seq: number; yaw: number; pitch: number; forward: number; right: number; jump: boolean; sprint: boolean; crouch: boolean; ads: boolean; fire: boolean; reload: boolean; slot: Slot; time: number; viewTime?: number }
export interface Body extends Vec3 { vx: number; vy: number; vz: number; yaw: number; pitch: number; grounded: boolean; stance: 'stand' | 'crouch' | 'slide'; slideTime: number; slideCooldown: number; jumpHeld: boolean; crouchHeld: boolean }
export interface PlayerState { id: string; name: string; bot: boolean; body: Body; hp: number; kills: number; deaths: number; loadout: Loadout; slot: Slot; ammo: number[]; reserve: number[]; reloading: number; nextFire: number; ads: boolean; adsSince: number; ack: number; respawnAt: number; protectedUntil: number; lastDamage: number }
export interface LobbyPlayer { id: string; name: string; ready: boolean; loadout: Loadout; bot: boolean }
export interface RoomInfo { code: string; host: string; name: string; state: 'lobby' | 'playing' | 'finished'; players: LobbyPlayer[]; bots: number; limit: number; duration: number; private: boolean }
export interface RoomSummary { code: string; name: string; players: number; maxPlayers: number; state: string }
export interface GameEvent { id: number; type: 'shot' | 'hit' | 'kill' | 'respawn' | 'start' | 'end'; player?: string; target?: string; weapon?: WeaponId; damage?: number; headshot?: boolean; quickscope?: boolean; from?: Vec3; to?: Vec3; time: number }
export interface Snapshot { type: 'snapshot'; time: number; tick: number; players: PlayerState[]; events: GameEvent[]; endsAt: number; state: RoomInfo['state'] }
export type ClientMessage = { type:'create'; name: string; loadout: Loadout; bots: number; private: boolean } | { type:'join'; code:string; name:string; loadout:Loadout } | { type:'list' } | { type:'loadout'; loadout:Loadout } | { type:'ready'; ready:boolean } | { type:'settings'; bots:number; limit:number; duration:number } | { type:'start' } | { type:'leave' } | { type:'return' } | { type:'inputs'; inputs:Input[] } | { type:'ping'; time:number };
export type ServerMessage = {type:'welcome'; id:string} | {type:'rooms'; rooms:RoomSummary[]} | {type:'room'; room:RoomInfo} | {type:'error'; message:string} | {type:'left'} | {type:'pong'; time:number; serverTime:number} | Snapshot;
export interface Box { x:number; y:number; z:number; w:number; h:number; d:number; kind:string; color?:number }
