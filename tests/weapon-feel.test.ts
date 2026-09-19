import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewSpring, WeaponFeel, WEAPON_FEEL, reloadAmount } from '../src/weapon-feel.ts';
import type { WeaponId } from '../shared/types.ts';
const still={yawRate:0,pitchRate:0,forward:0,right:0,ads:0};

test('spring recovery is invariant across browser refresh rates and remains stable after a stall',()=>{
 const sample=(fps:number)=>{const s=new ViewSpring();s.value=.08;s.velocity=.4;for(let i=0;i<fps;i++)s.step(0,22,.78,1/fps);return[s.value,s.velocity];};
 const reference=sample(60);for(const fps of [30,90,144,240])sample(fps).forEach((value,i)=>assert.ok(Math.abs(value-reference[i])<1e-10));
 const stalled=new ViewSpring();stalled.value=.1;stalled.velocity=2;stalled.step(0,22,.78,2);assert.ok(Math.abs(stalled.value)<1e-10);assert.ok(Number.isFinite(stalled.velocity));
});
test('weapon mass changes the recoil peak and recovery without unbounded automatic accumulation',()=>{
 const peaks={} as Record<WeaponId,number>;
 for(const id of Object.keys(WEAPON_FEEL)as WeaponId[]){
  const feel=new WeaponFeel();feel.reset(id);feel.fire();let peak=0;
  for(let i=0;i<120;i++){feel.update(1/120,still);peak=Math.max(peak,feel.pitch.value);}peaks[id]=peak;assert.ok(Math.abs(feel.pitch.value)<.0001,`${id} must recover its sightline`);
  for(let i=0;i<2400;i++){if(i%4===0)feel.fire();feel.update(1/120,still);assert.ok(feel.pitch.value<=WEAPON_FEEL[id].limit);assert.ok(feel.push.value<=.095);assert.ok(Number.isFinite(feel.roll.value));}
 }
 assert.ok(peaks.deagle>peaks.scar*2);assert.ok(peaks.intervention>peaks.ak47*2);assert.ok(peaks.scar>peaks.ak47);assert.ok(peaks.glock<peaks.m9);
});
test('movement inertia and ADS settle back to the exact neutral sight alignment',()=>{
 const feel=new WeaponFeel();feel.reset('scar');
 for(let i=0;i<30;i++)feel.update(1/60,{yawRate:2,pitchRate:1,forward:9,right:3,ads:0});assert.ok(Math.abs(feel.lagYaw.value)>.01);assert.ok(Math.abs(feel.lateral.value)>.005);
 for(let i=0;i<180;i++)feel.update(1/60,{...still,ads:1});
 assert.ok(Math.abs(feel.aim.value-1)<1e-6);assert.ok(Math.abs(feel.lagYaw.value)<1e-6);assert.ok(Math.abs(feel.lagPitch.value)<1e-6);assert.ok(Math.abs(feel.lateral.value)<1e-6);
 feel.land(10);feel.update(1/60,{...still,ads:1});assert.ok(feel.vertical.value<0,'landing should pull the weapon down before recovery');
 for(let i=0;i<180;i++)feel.update(1/60,{...still,ads:1});assert.ok(Math.abs(feel.vertical.value)<1e-6);
});
test('reload phases stay continuous around magazine seating and latch foley',()=>{
 assert.equal(reloadAmount(0),0);assert.equal(reloadAmount(1),0);
 for(const cue of [.18,.34,.5,.72,.82])assert.ok(Math.abs(reloadAmount(cue-.00001)-reloadAmount(cue+.00001))<.001);
 assert.ok(reloadAmount(.34)>reloadAmount(.5));assert.ok(reloadAmount(.5)>reloadAmount(.82));
});
