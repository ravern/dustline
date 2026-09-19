import { containsMapPosition, getMap, type MapDefinition } from './map.ts';
import type { Body, Box, Input, Vec3 } from './types.ts';

export const DT = 1 / 60;
export const PLAYER_RADIUS = 0.35;
const EPS = 0.00001;
const GRAVITY = 32;
const JUMP = 8.4;
export const bodyHeight = (b: Pick<Body, 'stance'>) => b.stance === 'stand' ? 1.75 : b.stance === 'slide' ? .8 : 1.05;
export const eyeHeight = (b: Pick<Body, 'stance'>) => b.stance === 'stand' ? 1.6 : b.stance === 'slide' ? .64 : .9;
export function spawnBody(p: Vec3, yaw = 0): Body {
  return { ...p, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, grounded: p.y <= EPS, stance: 'stand', slideTime: 0, slideCooldown: 0, jumpHeld: false, crouchHeld: false };
}
const overlap = (a: number, b: number, c: number, d: number) => a < d - EPS && b > c + EPS;
function intersects(b: Body, box: Box, height = bodyHeight(b)): boolean {
  return overlap(b.x - PLAYER_RADIUS, b.x + PLAYER_RADIUS, box.x - box.w / 2, box.x + box.w / 2) && overlap(b.y, b.y + height, box.y - box.h / 2, box.y + box.h / 2) && overlap(b.z - PLAYER_RADIUS, b.z + PLAYER_RADIUS, box.z - box.d / 2, box.z + box.d / 2);
}
function canOccupy(b: Body, map: MapDefinition, height = bodyHeight(b)) { return containsMapPosition(map,b.x,b.z,PLAYER_RADIUS)&&!map.boxes.some(box => intersects(b, box, height)); }

export const VAULT_DURATION = .54;
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
/** A three-stage mantle lifts clear before moving across the obstruction. */
export function vaultPosition(vault:NonNullable<Body['vault']>,elapsed:number):Vec3 {
  const progress=elapsed/vault.duration,cross=smooth((progress-.28)/.44);
  const y=progress<.28?vault.from.y+(vault.height-vault.from.y)*smooth(progress/.28):
    progress>.72?vault.height+(vault.to.y-vault.height)*smooth((progress-.72)/.28):vault.height;
  return {x:vault.from.x+(vault.to.x-vault.from.x)*cross,y,z:vault.from.z+(vault.to.z-vault.from.z)*cross};
}
function vaultCandidate(body:Body,input:Input,map:MapDefinition):Body['vault'] {
  if(input.forward<.25||input.crouch||body.stance==='slide')return;
  const norm=Math.max(1,Math.hypot(input.forward,input.right));
  const dx=(-Math.sin(input.yaw)*input.forward+Math.cos(input.yaw)*input.right)/norm;
  const dz=(-Math.cos(input.yaw)*input.forward-Math.sin(input.yaw)*input.right)/norm;
  const length=Math.hypot(dx,dz);if(length<.1)return;
  const direction={x:dx/length,z:dz/length};
  let best:Body['vault'],nearest=Infinity;
  for(const box of map.boxes){
    const top=box.y+box.h/2,rise=top-body.y;
    if(rise<.5||rise>1.5||box.y-box.h/2>body.y+.15||['boundary','perimeter'].includes(box.kind))continue;
    let enter=-Infinity,exit=Infinity;
    for(const axis of ['x','z'] as const){
      const half=(axis==='x'?box.w:box.d)/2+PLAYER_RADIUS;
      const delta=direction[axis],offset=box[axis]-body[axis];
      if(Math.abs(delta)<1e-6){if(Math.abs(offset)>half){enter=Infinity;break;}continue;}
      const a=(offset-half)/delta,b=(offset+half)/delta;
      enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    }
    if(enter<-.02||enter>.95||enter>=exit||enter>=nearest||exit-enter>2.8)continue;
    const target={x:body.x+direction.x*(exit+.14),y:0,z:body.z+direction.z*(exit+.14)};
    // Choose a real supporting floor, never a suspended landing in mid-air.
    for(const support of map.boxes){const y=support.y+support.h/2;
      if(y<=body.y+.1&&y>target.y&&Math.abs(target.x-support.x)<support.w/2-PLAYER_RADIUS&&Math.abs(target.z-support.z)<support.d/2-PLAYER_RADIUS)target.y=y;
    }
    if(body.y-target.y>1.5)continue;
    const candidate={elapsed:0,duration:VAULT_DURATION,from:{x:body.x,y:body.y,z:body.z},to:target,height:top+.045};
    const crouched={...body,stance:'crouch' as const};
    let clear=true;
    // Validate the entire trajectory, not just the destination: a thin wall or
    // low roof anywhere along the vault must reject it before motion begins.
    const samples=Math.max(32,Math.ceil((exit+.14+rise*2)/.06));
    for(let i=0;i<=samples;i++)if(!canOccupy({...crouched,...vaultPosition(candidate,i/samples*VAULT_DURATION)},map)){clear=false;break;}
    if(clear){nearest=enter;best=candidate;}
  }
  return best;
}
function advanceVault(body:Body,input:Input,dt:number,map:MapDefinition):Body {
  const previous=body.vault!,elapsed=Math.min(previous.duration,previous.elapsed+dt),vault={...previous,elapsed};
  const target=vaultPosition(vault,elapsed),b={...body,stance:'crouch' as const};
  const count=Math.max(1,Math.ceil(Math.hypot(target.x-b.x,target.y-b.y,target.z-b.z)/.06));
  for(let i=1;i<=count;i++){
    const t=i/count,candidate={...b,x:b.x+(target.x-b.x)*t,y:b.y+(target.y-b.y)*t,z:b.z+(target.z-b.z)*t};
    if(!canOccupy(candidate,map))return {...b,vault:undefined,vx:0,vy:0,vz:0,grounded:false};
  }
  const result:Body={...b,...target,vault,grounded:false,vx:0,vz:0,vy:0,slideTime:0};
  if(elapsed>=vault.duration){result.vault=undefined;result.grounded=true;result.stance=!input.crouch&&canOccupy(result,map,1.75)?'stand':'crouch';}
  return result;
}

/** Shared deterministic fixed-step movement. Position is at the player's feet. */
export function move(body: Body, input: Input, dt = DT, map: MapDefinition = getMap('yard')): Body {
  const b = { ...body };
  dt = Math.max(0, Math.min(dt, 1 / 30));
  b.yaw = input.yaw;
  b.pitch = Math.max(-1.48, Math.min(1.48, input.pitch));
  b.slideCooldown = Math.max(0, b.slideCooldown - dt);
  const jumpPressed = input.jump && !body.jumpHeld;
  const crouchPressed = input.crouch && !body.crouchHeld;
  b.jumpHeld = input.jump;
  b.crouchHeld = input.crouch;
  if(b.vault)return advanceVault(b,input,dt,map);
  if(jumpPressed&&b.grounded){const vault=vaultCandidate(b,input,map);if(vault){b.vault=vault;return advanceVault(b,input,dt,map);}}
  const speedBefore = Math.hypot(b.vx, b.vz);
  if (crouchPressed && input.sprint && b.grounded && speedBefore >= 6 && b.slideCooldown === 0) {
    b.stance = 'slide'; b.slideTime = .65; b.slideCooldown = 1.25;
    b.vx = b.vx / speedBefore * 12; b.vz = b.vz / speedBefore * 12;
  }
  if (b.stance === 'slide') {
    b.slideTime = Math.max(0, b.slideTime - dt);
    // A slide cannot expand its hitbox through a low obstruction. It slows to a
    // crawl until the shoulders are clear, then naturally returns to crouch.
    if ((b.slideTime <= 0 || !b.grounded) && canOccupy(b, map, 1.05)) b.stance = 'crouch';
  }
  if (b.stance !== 'slide') {
    if (input.crouch) b.stance = 'crouch';
    else if (canOccupy(b, map, 1.75)) b.stance = 'stand';
    else b.stance = 'crouch';
  }
  if (jumpPressed && b.grounded && canOccupy(b, map, 1.05)) {
    b.vy = JUMP; b.grounded = false; b.slideTime = 0;
    if (!input.crouch && canOccupy(b, map, 1.75)) b.stance = 'stand';
    else b.stance = 'crouch';
  }
  const f = Math.max(-1, Math.min(1, input.forward));
  const r = Math.max(-1, Math.min(1, input.right));
  const norm = Math.max(1, Math.hypot(f, r));
  const dx = (-Math.sin(b.yaw) * f + Math.cos(b.yaw) * r) / norm;
  const dz = (-Math.cos(b.yaw) * f - Math.sin(b.yaw) * r) / norm;
  if (b.stance === 'slide' && b.grounded && b.slideTime > 0) {
    const currentSpeed = Math.hypot(b.vx, b.vz) || 1;
    const speed = 6 + 6 * b.slideTime / .65;
    // A little steering while preserving momentum makes sliding useful around cover.
    b.vx = (b.vx / currentSpeed * .985 + dx * .015) * speed;
    b.vz = (b.vz / currentSpeed * .985 + dz * .015) * speed;
  } else {
    const speed = b.stance === 'slide' ? 2.5 : b.stance === 'crouch' ? 3 : input.ads ? 3.6 : input.sprint && f > 0 ? 9 : 6;
    const acceleration = b.grounded ? 70 : 20;
    // Acceleration is vector limited, avoiding faster diagonal movement.
    const vx = dx * speed - b.vx, vz = dz * speed - b.vz;
    const delta = Math.hypot(vx, vz);
    const factor = delta > 0 ? Math.min(1, acceleration * dt / delta) : 0;
    b.vx += vx * factor; b.vz += vz * factor;
  }
  // Axis sweeps prevent wall tunneling. Low ledges step up only from stable ground.
  const wasGrounded = b.grounded;
  for (const axis of ['x', 'z'] as const) {
    const velocity = axis === 'x' ? 'vx' : 'vz';
    const previousAxis=b[axis],axisSpeed=b[velocity];
    b[axis] += axisSpeed * dt;
    for (const box of map.boxes) {
      if (!intersects(b, box)) continue;
      const top = box.y + box.h / 2;
      if (wasGrounded && top >= b.y - EPS && top - b.y <= .42) {
        const elevated = { ...b, y: top + EPS };
        if (canOccupy(elevated, map)) { b.y = top + EPS; continue; }
      }
      const size = axis === 'x' ? box.w : box.d;
      // Stopping at one solid must still resolve every overlapping frame or
      // rail along this axis. Keep the incoming direction after velocity is zero.
      if (axisSpeed > 0) b[axis] = Math.min(b[axis], box[axis] - size / 2 - PLAYER_RADIUS - EPS);
      else if (axisSpeed < 0) b[axis] = Math.max(b[axis], box[axis] + size / 2 + PLAYER_RADIUS + EPS);
      b[velocity] = 0;
    }
    if(!containsMapPosition(map,b.x,b.z,PLAYER_RADIUS)){b[axis]=previousAxis;b[velocity]=0;}
    const bound = map.size / 2 - PLAYER_RADIUS;
    if (Math.abs(b[axis]) > bound) { b[axis] = Math.max(-bound, Math.min(bound, b[axis])); b[velocity] = 0; }
  }
  const oldY = b.y;
  b.vy -= GRAVITY * dt;
  b.y += b.vy * dt;
  b.grounded = false;
  for (const box of map.boxes) {
    if (!intersects(b, box)) continue;
    const top = box.y + box.h / 2;
    const bottom = box.y - box.h / 2;
    if (b.vy <= 0 && oldY >= top - .04) { b.y = top; b.vy = 0; b.grounded = true; }
    else if (b.vy > 0 && oldY + bodyHeight(b) <= bottom + .04) { b.y = bottom - bodyHeight(b); b.vy = 0; }
  }
  if (b.y <= 0) { b.y = 0; b.vy = 0; b.grounded = true; }
  return b;
}
