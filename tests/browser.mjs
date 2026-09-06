import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { move, DT } from '../shared/physics.ts';
import { MAP_BOXES } from '../shared/map.ts';

const base = process.env.DUSTLINE_URL || 'http://localhost:3000';
const output = path.resolve('test-results', 'browser');
await fs.mkdir(output, { recursive: true });
const checks = [], failures = [], errors = [];
const browsers = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = page => page.evaluate(() => window.__dustline?.state);
async function waitState(page, predicate, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await state(page); if (value && predicate(value)) return value; await pause(35); }
  throw new Error(`${label}: ${JSON.stringify(await state(page))}`);
}
async function check(name, run) {
  console.log(`CHECK ${name}`);
  const started = Date.now();
  const data = await run();
  checks.push({ name, elapsedMs: Date.now() - started, ...data });
  console.log(`PASS ${name}${data ? ' '+JSON.stringify(data) : ''}`);
  return data;
}
async function key(page, value, ms = 90) { await page.keyboard.down(value); await pause(ms); await page.keyboard.up(value); }
async function trigger(page, ms = 95) { await page.mouse.down({ button: 'left' }); await pause(ms); await page.mouse.up({ button: 'left' }); await pause(65); }
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
async function client(label) {
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--autoplay-policy=no-user-gesture-required'] });
  browsers.push(browser);
  const context = await browser.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor:1 });
  const page = await context.newPage();
  const wire = { snapshots:[], messages:[] };
  page.on('pageerror', error => errors.push({client:label,message:error.message}));
  page.on('websocket', socket => socket.on('framereceived', frame => { try { const m=JSON.parse(String(frame.payload)); if(m.type==='snapshot'){wire.snapshots.push(m);if(wire.snapshots.length>120)wire.snapshots.shift();}else wire.messages.push(m); }catch{} }));
  await page.goto(base, { waitUntil:'networkidle' });
  await waitState(page,s=>s.connected,`${label} connected`);
  // Persist an explicit performance setting through the actual UI.
  await page.locator('#settings-button').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#settings-done').click();
  return { page, wire, label };
}
let a,b;
try {
  a=await client('alpha'); b=await client('bravo');
  await check('Callsign and SCAR loadout persist across reload', async()=>{
    await a.page.locator('#callsign').fill('BROWSER ALPHA');
    await a.page.locator('[data-nav="loadout"]').click();
    await a.page.locator('[data-weapon="scar"]').click();
    await a.page.locator('#save-loadout').click();
    await a.page.reload({waitUntil:'networkidle'});
    await waitState(a.page,s=>s.connected,'alpha reconnect');
    assert.equal(await a.page.locator('#callsign').inputValue(),'BROWSER ALPHA');
    assert.equal(await a.page.locator('#active-primary').textContent(),'SCAR-H');
    await a.page.locator('[data-nav="loadout"]').click();
    await a.page.screenshot({path:path.join(output,'01-loadout.png')});
    await a.page.locator('[data-nav="play"]').click();
  });
  let code;
  await check('Create/join lobby applies distinct loadouts and enforces readiness', async()=>{
    await b.page.locator('#callsign').fill('BROWSER BRAVO');
    await b.page.locator('[data-nav="loadout"]').click();
    await b.page.locator('[data-weapon="ak47"]').click();
    await b.page.locator('#save-loadout').click();
    await a.page.locator('#create-lobby').click();
    let s=await waitState(a.page,s=>!!s.room,'lobby created'); code=s.room.code;
    assert.equal(s.room.players.find(p=>p.name==='BROWSER ALPHA').loadout.primary,'scar');
    await a.page.locator('#bot-count').selectOption('0');
    await waitState(a.page,s=>s.room.bots===0,'bots disabled');
    await b.page.locator('#room-code').fill(code);await b.page.locator('#join-lobby').click();
    s=await waitState(a.page,s=>s.room.players.length===2,'second player joined');
    assert.equal(s.room.players.find(p=>p.name==='BROWSER BRAVO').loadout.primary,'ak47');
    assert.equal(await a.page.locator('#start-match').isDisabled(),true);
    await waitState(b.page,s=>s.room?.players.length===2,'bravo lobby state');
    assert.equal(await b.page.locator('#bot-count').isDisabled(),true);
    await a.page.locator('[data-nav="loadout"]').click();await a.page.locator('[data-weapon="intervention"]').click();await a.page.locator('#save-loadout').click();
    await waitState(b.page,s=>s.room.players.find(p=>p.name==='BROWSER ALPHA')?.loadout.primary==='intervention','loadout replicated');
    await b.page.locator('#ready-button').click();
    await waitState(a.page,s=>s.room.players.every(p=>p.ready),'ready replicated');
    assert.equal(await a.page.locator('#start-match').isEnabled(),true);
    await a.page.screenshot({path:path.join(output,'02-lobby.png')});
    return {code};
  });
  await check('Both actual browsers deploy; real clicks capture pointer lock', async()=>{
    await a.page.locator('#start-match').click();
    const sa=await waitState(a.page,s=>s.phase==='playing'&&s.locked,'alpha deployed');
    await waitState(b.page,s=>s.phase==='playing','bravo deployed');
    await b.page.locator('#resume').click();await waitState(b.page,s=>s.locked,'bravo pointer lock');
    assert.equal(sa.self.loadout.primary,'intervention');assert.equal(sa.self.ammo[0],5);
    const sb=await state(b.page);assert.equal(sb.self.loadout.primary,'ak47');assert.equal(sb.self.ammo[0],30);
    await a.page.screenshot({path:path.join(output,'03-gameplay.png')});
    return {players:sa.room.players.length,alphaWeapon:sa.self.loadout.primary,bravoWeapon:sb.self.loadout.primary};
  });
  await check('Jump is grounded again in about half a second and does not repeat while held', async()=>{
    const before=await state(a.page);const samples=[];const start=Date.now();
    await a.page.keyboard.down('Space');
    while(Date.now()-start<850){const s=await state(a.page);samples.push({time:(Date.now()-start)/1000,y:s.body.y-before.body.y,grounded:s.body.grounded});await pause(18);}
    await a.page.keyboard.up('Space');
    const apex=Math.max(...samples.map(p=>p.y));const airborne=samples.findIndex(p=>!p.grounded);const landed=samples.slice(airborne+1).find(p=>p.grounded);
    assert.ok(apex>.8&&apex<1.2,`jump apex ${apex}`);assert.ok(landed&&landed.time<.8,`landing ${JSON.stringify(landed)}`);assert.equal(samples.at(-1).grounded,true);
    return {apex,landingSeconds:landed.time};
  });
  await check('Sprint accelerates, slide carries momentum, then crouch and release stop', async()=>{
    await turnToward(a.page,clearHeading((await state(a.page)).body));
    await a.page.keyboard.down('Shift');await a.page.keyboard.down('w');await pause(450);
    let s=await state(a.page);const speed=Math.hypot(s.body.vx,s.body.vz);assert.ok(speed>8.4,`sprint speed ${speed}`);
    await a.page.keyboard.down('c');
    s=await waitState(a.page,s=>s.body.stance==='slide','slide triggered',1200);const slideSpeed=Math.hypot(s.body.vx,s.body.vz);assert.ok(slideSpeed>9,`slide speed ${slideSpeed}`);
    await pause(710);s=await state(a.page);assert.equal(s.body.stance,'crouch');
    await a.page.keyboard.up('c');await a.page.keyboard.up('w');await a.page.keyboard.up('Shift');await pause(300);
    s=await state(a.page);assert.equal(s.body.stance,'stand');assert.ok(Math.hypot(s.body.vx,s.body.vz)<.01);
    return {sprintSpeed:speed,slideSpeed};
  });
  await check('Intervention ADS zoom, authoritative ammo, bolt timing and reload', async()=>{
    await a.page.mouse.down({button:'right'});await waitState(a.page,s=>s.ads>.96&&s.self.ads,'scoped');
    assert.equal(await a.page.locator('#scope').isVisible(),true);
    await a.page.screenshot({path:path.join(output,'04-scope.png')});
    const first=Date.now();await trigger(a.page);
    await waitState(a.page,s=>s.self.ammo[0]===4,'first sniper shot');
    await trigger(a.page);await pause(150);assert.equal((await state(a.page)).self.ammo[0],4,'bolt rejects early second click');
    await pause(Math.max(0,1050-(Date.now()-first)));await trigger(a.page);
    await waitState(a.page,s=>s.self.ammo[0]===3,'second sniper shot');
    await a.page.mouse.up({button:'right'});await key(a.page,'r');
    await waitState(a.page,s=>s.self.reloading>Date.now()/1000,'reload started');
    await waitState(a.page,s=>s.self.ammo[0]===5&&s.self.reloading===0,'reload completed',7000);
    assert.equal((await state(a.page)).self.reserve[0],23);
    return {ammo:5,reserve:23};
  });
  await check('Pistol is semiautomatic; all slots, quick melee and swap work', async()=>{
    await key(a.page,'2');await waitState(a.page,s=>s.self.slot===1,'pistol equipped');await pause(230);
    await trigger(a.page,620);await waitState(a.page,s=>s.self.ammo[1]===14,'pistol fires once while held');
    await trigger(a.page);await waitState(a.page,s=>s.self.ammo[1]===13,'pistol fires on next press');
    await key(a.page,'3');await waitState(a.page,s=>s.self.slot===2,'knife equipped');await pause(230);await trigger(a.page);
    assert.equal(await a.page.locator('#ammo').textContent(),'∞');
    await key(a.page,'2');await waitState(a.page,s=>s.self.slot===1,'pistol reequipped');await key(a.page,'v');
    await waitState(a.page,s=>s.slot===2,'quick melee selected knife');await waitState(a.page,s=>s.slot===1&&s.self.slot===1,'quick melee restores pistol',3000);
    await key(a.page,'q');await waitState(a.page,s=>s.self.slot===0,'swap returns primary');
    return {pistolAmmo:13,knifeAmmo:'unlimited',restoredPrimary:true};
  });
  await check('The second real browser receives remote movement and combat snapshots', async()=>{
    const sa=await state(a.page),sb=await state(b.page);const latest=b.wire.snapshots.at(-1);
    const remote=latest.players.find(p=>p.id===sa.self.id);assert.ok(remote);assert.ok(remote.ack>100);assert.equal(remote.ammo[1],13);
    assert.ok(latest.players.some(p=>p.id===sb.self.id));assert.ok(b.wire.snapshots.length>=20);
    return {remoteAck:remote.ack,snapshotsObserved:b.wire.snapshots.length};
  });
  await check('Quick melee emits an authoritative knife shot while the fire button is held', async()=>{
    await key(a.page,'2');await waitState(a.page,s=>s.self.slot===1,'pistol before held-trigger melee');await pause(240);
    const before=Math.max(0,...a.wire.snapshots.flatMap(s=>s.events.map(e=>e.id)));
    await a.page.mouse.down({button:'left'});await pause(150);await key(a.page,'v');
    const end=Date.now()+3500;let knife;
    while(Date.now()<end){knife=a.wire.snapshots.flatMap(s=>s.events).find(e=>e.id>before&&e.type==='shot'&&e.weapon==='knife'&&e.player===(a.wire.snapshots.at(-1)?.players.find(p=>p.name==='BROWSER ALPHA')?.id));if(knife)break;await pause(30);}
    await a.page.mouse.up({button:'left'});await pause(70);
    assert.ok(knife,'quick melee must produce a server knife attack, not just an animation');
    await waitState(a.page,s=>s.slot===1&&s.self.slot===1,'held-trigger melee restores pistol');
    return {knifeEventId:knife.id};
  });
  await check('Escape releases the mouse, neutral inputs stop movement, and resume recaptures it', async()=>{
    await a.page.keyboard.press('Escape');await waitState(a.page,s=>!s.locked,'mouse released');await a.page.locator('#pause').waitFor({state:'visible'});
    const before=(await state(a.page)).body;await a.page.keyboard.down('w');await pause(300);await a.page.keyboard.up('w');const after=(await state(a.page)).body;
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.02,'unlocked controls stay neutral');
    await a.page.locator('#resume').click();await waitState(a.page,s=>s.locked,'mouse recaptured');
  });
  await check('160 ms added latency preserves responsive movement and converges after stopping', async()=>{
    await a.page.keyboard.press('Escape');await a.page.locator('#pause-settings').click();await a.page.locator('#latency').selectOption('160');await a.page.locator('#settings-done').click();await a.page.locator('#resume').click();
    await waitState(a.page,s=>s.latency===160&&s.locked,'latency setting active');await pause(2200);
    await turnToward(a.page,clearHeading((await state(a.page)).body));
    const before=(await state(a.page)).body;
    await a.page.keyboard.down('w');await pause(100);const predicted=(await state(a.page)).body;assert.ok(Math.hypot(predicted.x-before.x,predicted.z-before.z)>.08,'movement is predicted before full RTT');
    await pause(280);await a.page.keyboard.up('w');await pause(1200);
    const settled=await state(a.page);const divergence=Math.hypot(settled.body.x-settled.self.body.x,settled.body.y-settled.self.body.y,settled.body.z-settled.self.body.z);
    assert.ok(divergence<.025,`stationary predicted-authoritative error ${divergence}`);assert.ok(settled.seq-settled.self.ack<35,`pending gap ${settled.seq-settled.self.ack}`);assert.ok(settled.rtt>60,`measured RTT ${settled.rtt}`);
    await a.page.screenshot({path:path.join(output,'05-latency.png')});
    return {measuredRttMs:settled.rtt,positionErrorM:divergence,unacknowledged: settled.seq-settled.self.ack};
  });
  await check('250 ms latency expands interpolation and predicted ammo stays nonnegative through an empty magazine', async()=>{
    await a.page.keyboard.press('Escape');await a.page.locator('#pause-settings').click();await a.page.locator('#latency').selectOption('250');await a.page.locator('#settings-done').click();await a.page.locator('#resume').click();
    let s=await waitState(a.page,s=>s.rtt>200&&s.renderDelay>=.17,'250ms RTT and adaptive interpolation settled',16000);
    assert.ok(s.predictedAmmo>=0);
    await key(a.page,'2');await waitState(a.page,s=>s.self.slot===1,'pistol selected for depletion');await pause(300);
    const initial=(await state(a.page)).self.ammo[1];let minimum=Infinity;
    for(let i=0;i<initial+3;i++){await trigger(a.page);await pause(65);s=await state(a.page);minimum=Math.min(minimum,s.predictedAmmo);assert.ok(s.predictedAmmo>=0,`negative predicted ammo at press ${i}`);}
    s=await waitState(a.page,s=>s.self.ammo[1]===0,'authoritative pistol magazine empty',6000);assert.equal(s.predictedAmmo,0);assert.ok(Number(await a.page.locator('#ammo').textContent())>=0);
    await turnToward(a.page,clearHeading(s.body));await a.page.keyboard.down('w');await pause(300);await a.page.keyboard.up('w');await pause(1300);s=await state(a.page);
    const divergence=Math.hypot(s.body.x-s.self.body.x,s.body.y-s.self.body.y,s.body.z-s.self.body.z);assert.ok(divergence<.025);assert.ok(s.seq-s.self.ack<40);
    return {measuredRttMs:s.rtt,renderDelayMs:s.renderDelay*1000,lowestPredictedAmmo:minimum,positionErrorM:divergence,unacknowledged:s.seq-s.self.ack};
  });
  await check('A real scoped shot eliminates the second browser and replicates kills, deaths and respawn', async()=>{
    await a.page.keyboard.press('Escape');await a.page.locator('#pause-settings').click();await a.page.locator('#latency').selectOption('0');await a.page.locator('#settings-done').click();await a.page.locator('#resume').click();await pause(700);
    await walkTo(a.page,{x:26,z:22},'Alpha');await walkTo(b.page,{x:26,z:14},'Bravo');await pause(400);
    await key(a.page,'1');await waitState(a.page,s=>s.self.slot===0,'sniper for confirmed hit');await pause(240);
    const sa=await state(a.page),sb=await state(b.page);const dx=sb.body.x-sa.body.x,dz=sb.body.z-sa.body.z,range=Math.hypot(dx,dz);
    assert.ok(clearSegment(sa.body,sb.body),'both operators reached a clear line of fire');
    await turnToward(a.page,Math.atan2(-dx,-dz),Math.atan2(sb.body.y+.95-sa.body.y-1.6,range));
    await a.page.mouse.down({button:'right'});await waitState(a.page,s=>s.ads>.99&&s.self.ads,'scope settled on live target');await pause(190);await trigger(a.page);
    const kill=await waitState(a.page,s=>s.self.kills===sa.self.kills+1,'confirmed browser elimination',4500);
    const death=await waitState(b.page,s=>s.self.deaths===sb.self.deaths+1,'death replicated to victim',4500);
    const killEvent=a.wire.snapshots.flatMap(s=>s.events).find(e=>e.type==='kill'&&e.player===sa.self.id&&e.target===sb.self.id);assert.equal(killEvent?.quickscope,true,'the aimed elimination is recognized as a quickscope');
    await a.page.mouse.up({button:'right'});assert.equal(death.self.hp,0);assert.equal(await b.page.locator('#respawn').isVisible(),true);
    await a.page.screenshot({path:path.join(output,'06-confirmed-elimination.png')});
    await waitState(b.page,s=>s.self.hp===100&&s.self.deaths===death.self.deaths,'victim respawned with score preserved',6500);
    return {rangeM:range,kills:kill.self.kills,deaths:death.self.deaths,quickscope:killEvent.quickscope,confirmedRespawn:true};
  });
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log(`ALL ${checks.length} BROWSER CHECKS PASSED`);
} catch(error) {
  failures.push({message:error.message,stack:error.stack});console.error('BROWSER FAILURE',error.stack);
  if(a)await a.page.screenshot({path:path.join(output,'failure-alpha.png')}).catch(()=>{});
  if(b)await b.page.screenshot({path:path.join(output,'failure-bravo.png')}).catch(()=>{});
  process.exitCode=1;
} finally {
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({base,checks,failures,errors},null,2));
  for(const browser of browsers)await browser.close().catch(()=>{});
}
