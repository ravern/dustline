import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.DUSTLINE_URL||'http://localhost:3000';
const output=path.resolve('test-results','armory-browser');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>window.__dustline.state);
const wait=(fn,arg,timeout=16000)=>page.waitForFunction(fn,arg,{timeout});
const endpoint=new URL('/ws',base);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
const peer=new WebSocket(endpoint);let peerRoom;
peer.on('message',data=>{const message=JSON.parse(String(data));if(message.type==='room')peerRoom=message.room;});
await new Promise((resolve,reject)=>{peer.on('open',resolve);peer.on('error',reject);});
const send=message=>peer.send(JSON.stringify(message));
async function check(name,run){const detail=await run();checks.push({name,...detail});console.log('PASS',name,JSON.stringify(detail||{}));}
async function deploy(map='yard',mode='ffa'){
 await page.locator('#create-lobby').click();await wait(()=>!!window.__dustline.state.room);
 await page.locator('#bot-count').selectOption('0');await wait(()=>window.__dustline.state.room.bots===0);
 if(mode!=='ffa'){await page.locator('#mode-select').selectOption(mode);await wait(value=>window.__dustline.state.room.mode===value,mode);}
 if(map!=='yard'){await page.locator('#map-select').selectOption(map);await wait(value=>window.__dustline.state.room.map===value,map);}
 const code=(await state()).room.code;peerRoom=undefined;
 if(map==='yard'){await page.locator('[data-nav="loadout"]').click();await page.locator('#loadout-name').fill('Unfinished lobby edit');}
 send({type:'join',code,name:'Armory observer',loadout:{primary:'ak47',secondary:'m9'}});
 await wait(()=>window.__dustline.state.room.players.length===2);send({type:'ready',ready:true});
 await wait(()=>window.__dustline.state.room.players.every(p=>p.ready));
 if(map==='yard'){assert.equal(await page.locator('#loadout-panel').isVisible(),true,'lobby activity preserves the open editor');assert.equal(await page.locator('#loadout-name').inputValue(),'Unfinished lobby edit');await page.locator('#close-loadout').click();}
 await page.locator('#start-match').click();await wait(()=>window.__dustline.state.phase==='playing'&&window.__dustline.state.locked&&window.__dustline.state.self);
}
async function leave(){await page.keyboard.press('Escape');if((await state()).self.hp<=0)await wait(()=>window.__dustline.state.self.hp>0);await page.locator('#quit-match').click();await wait(()=>!window.__dustline.state.room);send({type:'leave'});}
try{
 await page.goto(base);await wait(()=>window.__dustline?.state.connected);
 await check('Five presets independently save primary, sidearm, names, and survive a reload',async()=>{
  await page.locator('#callsign').fill('ARMORY TEST');await page.locator('[data-nav="loadout"]').click();
  assert.equal(await page.locator('[data-preset]').count(),5);assert.equal(await page.locator('[data-category="secondary"]').count(),3);
  await page.locator('#loadout-name').fill('Heavy kit');await page.locator('[data-weapon="scar"]').click();await page.locator('[data-weapon="deagle"]').click();
  assert.equal(await page.locator('[data-weapon="scar"]').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(800);await page.screenshot({path:path.join(output,'01-desert-eagle.png')});
  await page.locator('[data-preset="1"]').click();await page.locator('#loadout-name').fill('Close quarters');await page.locator('[data-weapon="ak47"]').click();await page.locator('[data-weapon="glock"]').click();
  await page.waitForTimeout(800);await page.screenshot({path:path.join(output,'02-glock.png')});
  await page.locator('[data-preset="0"]').click();await page.locator('#save-loadout').click();
  await page.reload();await wait(()=>window.__dustline?.state.connected);
  const s=await state();assert.deepEqual(s.loadout,{primary:'scar',secondary:'deagle'});assert.deepEqual(s.presets[1],{name:'Close quarters',weapons:{primary:'ak47',secondary:'glock'}});
  assert.equal(await page.locator('#active-secondary').textContent(),'DESERT EAGLE / KNIFE');
 });
 await deploy();
 await check('Desert Eagle is selectable and semiautomatic while the knife remains available',async()=>{
  await page.keyboard.press('2');await wait(()=>window.__dustline.state.self.slot===1);await page.waitForTimeout(350);
  await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();await wait(()=>window.__dustline.state.self.ammo[1]===6);
  await page.keyboard.press('3');await wait(()=>window.__dustline.state.self.slot===2);await page.screenshot({path:path.join(output,'03-knife.png')});
  await page.keyboard.press('2');await wait(()=>window.__dustline.state.self.slot===1);
 });
 await check('A mid-match preset queues without replacing live weapons or refilling ammunition',async()=>{
  await page.keyboard.press('Escape');await page.locator('#pause-loadout').click();await page.locator('[data-preset="1"]').click();await page.locator('#save-loadout').click();
  await wait(()=>window.__dustline.state.room.players.find(p=>p.id===window.__dustline.state.self.id).loadout.secondary==='glock');
  const s=await state();assert.equal(s.self.loadout.secondary,'deagle');assert.equal(s.self.ammo[1],6);assert.equal(s.loadout.secondary,'glock');
  assert.match(await page.locator('#pending-loadout').textContent(),/NEXT SPAWN.*GLOCK/);
  // Refresh is a real reconnect; the queued choice and live inventory must both survive.
  await page.reload();await wait(()=>window.__dustline?.state.phase==='playing');
  assert.equal((await state()).self.loadout.secondary,'deagle');assert.equal((await state()).loadout.secondary,'glock');
  await page.locator('#resume').click();await wait(()=>window.__dustline.state.locked);
 });
 await check('Flashbang is thrown once and produces an authoritative fading flash',async()=>{
  await page.mouse.move(720,450);await page.mouse.move(720,1150,{steps:8});await page.waitForTimeout(200);
  await page.keyboard.down('f');await wait(()=>window.__dustline.state.self.grenades.flash===0);
  await wait(()=>window.__dustline.state.self.flashUntil>window.__dustline.state.snapshotTime);
  assert.ok(Number(await page.locator('#flash-overlay').evaluate(node=>node.style.opacity))>0);
  await page.keyboard.up('f');await page.screenshot({path:path.join(output,'04-flash.png')});
 });
 await check('Frag damage, five-second respawn, and the queued loadout work end to end',async()=>{
  await page.keyboard.press('g');await wait(()=>window.__dustline.state.self.grenades.frag===0);
  await wait(()=>window.__dustline.state.self.hp===0);
  const dead=await state(),remaining=dead.self.respawnAt-dead.snapshotTime;assert.ok(remaining>4.6&&remaining<=5.05,`respawn remaining ${remaining}`);
  await page.keyboard.press('Escape');await page.locator('#respawn-loadout').click();assert.equal(await page.locator('#loadout-panel').isVisible(),true);await page.locator('#close-loadout').click();
  await wait(()=>window.__dustline.state.self.hp===100,undefined,8000);
  const spawned=await state();assert.deepEqual(spawned.self.loadout,{primary:'ak47',secondary:'glock'});assert.equal(spawned.self.ammo[1],19);assert.deepEqual(spawned.self.grenades,{frag:1,flash:1});
  await page.locator('#resume').click();await page.keyboard.press('2');await wait(()=>window.__dustline.state.self.slot===1);await page.waitForTimeout(300);
  await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();await wait(()=>window.__dustline.state.self.ammo[1]<16);
  return{respawnSeconds:5,glockAutomatic:true};
 });
 await check('Performance mode reduces both rendering resolution and draw calls',async()=>{
  await page.keyboard.press('Escape');await page.locator('#pause-settings').click();await page.locator('#quality').selectOption('high');await page.locator('#settings-done').click();await page.waitForTimeout(700);const high=await state();
  await page.locator('#pause-settings').click();await page.locator('#quality').selectOption('low');await page.locator('#settings-done').click();await page.waitForTimeout(700);const low=await state();
  assert.ok(low.pixelRatio<high.pixelRatio);assert.ok(low.renderCalls<high.renderCalls,`${high.renderCalls} -> ${low.renderCalls}`);
  return{high:{ratio:high.pixelRatio,calls:high.renderCalls,triangles:high.triangles},low:{ratio:low.pixelRatio,calls:low.renderCalls,triangles:low.triangles}};
 });
 await leave();
 await check('Three new arenas render and deploy across FFA, TDM, and CTF',async()=>{
  for(const[map,mode]of[['airfield','ffa'],['homestead','tdm'],['derrick','ctf']]){await deploy(map,mode);await page.waitForTimeout(900);assert.equal((await state()).map,map);await page.screenshot({path:path.join(output,`${map}.png`)});await leave();}
 });
 assert.deepEqual(errors,[]);console.log(`ALL ${checks.length} ARMORY BROWSER CHECKS PASSED`);
}catch(error){console.error(error);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});checks.push({failure:String(error.stack),state:await state().catch(()=>null)});process.exitCode=1;}
finally{send({type:'leave'});peer.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));await browser.close();}
