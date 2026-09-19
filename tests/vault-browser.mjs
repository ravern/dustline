import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {move,DT} from '../shared/physics.ts';
import {MAP_BOXES} from '../shared/map.ts';
const output='test-results/vault-browser';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[];
const state=page=>page.evaluate(()=>window.__dustline.state);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=(page,fn)=>page.waitForFunction(fn,undefined,{timeout:15000});
async function turnToward(page, yaw, pitch = 0) {
  // Real pointer events only: the diagnostic object is never mutated.
  await page.mouse.move(640, 360);
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    const delta = Math.atan2(Math.sin(yaw-s.yaw), Math.cos(yaw-s.yaw));
    if (Math.abs(delta) < .04 && Math.abs(s.pitch-pitch) < .015) return;
    await page.mouse.move(640-delta/.0021, 360+(s.pitch-pitch)/.0021, { steps: 8 });
    await pause(40);
    if (i < 2) await page.mouse.move(640, 360);
  }
  const s = await state(page);
  assert.ok(Math.abs(Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))) < .15, 'Mouse look should reach requested heading');
}
function clearHeading(body) {
  const command = { seq:0,yaw:0,pitch:0,forward:1,right:0,jump:false,sprint:true,crouch:false,ads:false,fire:false,reload:false,slot:0,time:0 };
  let best = { score:-1, yaw:body.yaw };
  for (let i=0;i<36;i++) {
    let b={...body}; const yaw=i*Math.PI/18;
    for(let tick=0;tick<100;tick++) b=move(b,{...command,yaw,crouch:tick>=35},DT);
    const score=Math.hypot(b.x-body.x,b.z-body.z)-Math.abs(b.y-body.y)*4;
    if(score>best.score)best={score,yaw};
  }
  return best.yaw;
}
function walkable(x,z){
  if(Math.abs(x)>28.4||Math.abs(z)>28.4)return false;
  return !MAP_BOXES.some(b=>b.y+b.h/2>0&&b.y-b.h/2<1.75&&x+.43>b.x-b.w/2&&x-.43<b.x+b.w/2&&z+.43>b.z-b.d/2&&z-.43<b.z+b.d/2);
}
function clearSegment(a,b){const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d/.2));for(let i=0;i<=steps;i++){const t=i/steps;if(!walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
function route(start,goal){
  const key=p=>`${p.x},${p.z}`;let seed;
  for(let radius=0;radius<=2&&!seed;radius++)for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const p={x:Math.round(start.x)+dx,z:Math.round(start.z)+dz};if(walkable(p.x,p.z)&&clearSegment(start,p))seed=p;}
  assert.ok(seed,'a nearby walkable navigation cell exists');
  const target={x:Math.round(goal.x),z:Math.round(goal.z)}, open=[seed], costs=new Map([[key(seed),0]]),prev=new Map(),closed=new Set();
  while(open.length){open.sort((a,b)=>(costs.get(key(a))+Math.abs(a.x-target.x)+Math.abs(a.z-target.z))-(costs.get(key(b))+Math.abs(b.x-target.x)+Math.abs(b.z-target.z)));const current=open.shift(),id=key(current);if(closed.has(id))continue;closed.add(id);if(id===key(target)){const raw=[current];let k=id;while(prev.has(k)){const p=prev.get(k);raw.unshift(p);k=key(p);}raw.unshift({x:start.x,z:start.z});const result=[raw[0]];let i=0;while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!clearSegment(raw[i],raw[j]))j--;result.push(raw[j]);i=j;}return result;}
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:current.x+dx,z:current.z+dz},pid=key(p),cost=costs.get(id)+1;if(!walkable(p.x,p.z)||closed.has(pid)||cost>=(costs.get(pid)??Infinity))continue;costs.set(pid,cost);prev.set(pid,current);open.push(p);}
  }
  throw Error('No ground route to test firing lane');
}
async function walkTo(page,goal,label){
  const end=Date.now()+28000;
  while(Date.now()<end){let s=await state(page);if(Math.hypot(s.body.x-goal.x,s.body.z-goal.z)<1)return;
    const waypoints=route(s.body,goal),destination=waypoints[1]||goal;const dist=Math.hypot(destination.x-s.body.x,destination.z-s.body.z);
    await turnToward(page,Math.atan2(s.body.x-destination.x,s.body.z-destination.z));
    await page.keyboard.down('Shift');await page.keyboard.down('w');const segmentEnd=Date.now()+Math.min(2400,dist/9*1000+300);
    while(Date.now()<segmentEnd){s=await state(page);if(Math.hypot(destination.x-s.body.x,destination.z-s.body.z)<.95)break;await pause(30);}
    await page.keyboard.up('w');await page.keyboard.up('Shift');await pause(180);
  }
  throw Error(`${label} navigation timed out: ${JSON.stringify((await state(page)).body)}`);
}

try{
 const pages=[];
 for(const callsign of ['VAULT TEST','IDLE TEST']){
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.DUSTLINE_URL||'http://localhost:3000');await wait(page,()=>window.__dustline?.state.connected);
  await page.locator('#callsign').fill(callsign);
 }
 const [page,guest]=pages;
 await page.locator('#create-lobby').click();await wait(page,()=>!!window.__dustline.state.room);
 await page.locator('#bot-count').selectOption('0');await wait(page,()=>window.__dustline.state.room.bots===0);
 const room=(await state(page)).room;await guest.locator('#room-code').fill(room.code);await guest.locator('#join-lobby').click();await wait(guest,()=>!!window.__dustline.state.room);await guest.locator('#ready-button').click();
 await wait(page,()=>window.__dustline.state.room.players.every(p=>p.id===window.__dustline.state.room.host||p.ready));
 await page.bringToFront();await page.locator('#start-match').click();await wait(page,()=>window.__dustline.state.locked&&window.__dustline.state.body);
 const start=(await state(page)).body;
 const barriers=MAP_BOXES.filter(b=>b.kind==='barrier'&&b.w>b.d&&b.y<1).map(b=>({b,goal:{x:b.x,z:b.z+b.d/2+2}})).filter(({goal})=>walkable(Math.round(goal.x),Math.round(goal.z))).sort((a,b)=>Math.hypot(a.goal.x-start.x,a.goal.z-start.z)-Math.hypot(b.goal.x-start.x,b.goal.z-start.z));
 assert.ok(barriers.length);const {b:barrier,goal}=barriers[0];
 await walkTo(page,goal,'vault approach');await turnToward(page,0);
 // Move into the chosen cover normally before pressing Space. This uses only
 // actual game controls; no positions, inputs, or diagnostic state are injected.
 await page.keyboard.down('w');await pause(1000);await page.keyboard.up('w');await pause(120);
 const before=(await state(page)).body;assert.ok(Math.abs(before.z-(barrier.z+barrier.d/2+.35))<.2,JSON.stringify({before,barrier}));
 await page.keyboard.down('w');await page.keyboard.down('Space');await wait(page,()=>!!window.__dustline.state.body.vault);
 const during=(await state(page)).body;await page.screenshot({path:`${output}/vault-start.png`});await pause(150);await page.screenshot({path:`${output}/vault-over-cover.png`});
 await page.keyboard.up('Space');await page.keyboard.up('w');await wait(page,()=>!window.__dustline.state.body.vault&&window.__dustline.state.body.grounded);
 const after=(await state(page)).body;assert.ok(after.z<barrier.z-barrier.d/2-.34,JSON.stringify({before,after,barrier}));assert.equal(after.y,0);
 await page.keyboard.down('Control');await wait(page,()=>window.__dustline.state.body.stance==='crouch');await page.screenshot({path:`${output}/crouch.png`});await page.keyboard.up('Control');
 await turnToward(page,clearHeading((await state(page)).body));await page.keyboard.down('Shift');await page.keyboard.down('w');await pause(420);await page.keyboard.down('Control');await wait(page,()=>window.__dustline.state.body.stance==='slide');await page.screenshot({path:`${output}/slide-feet.png`});await page.keyboard.up('Control');await page.keyboard.up('Shift');await page.keyboard.up('w');
 assert.deepEqual(errors,[]);const result={realKeyboardInput:true,barrier,before,during,after,errors};await fs.writeFile(`${output}/results.json`,JSON.stringify(result,null,2));console.log('PASS actual browser vault, crouch, and sprint-slide');
 await page.keyboard.press('Escape');await page.locator('#quit-match').click();
}catch(error){console.error(error);await fs.writeFile(`${output}/failure.json`,JSON.stringify({error:String(error.stack),errors},null,2));process.exitCode=1;}finally{await browser.close();}
