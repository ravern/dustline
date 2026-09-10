import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.DUSTLINE_URL||'http://localhost:3000';
const output=path.resolve('test-results','modes-browser');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const checks=[],errors=[];
async function client(){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),transport={blocked:false,sockets:[]};
 await page.routeWebSocket('**/ws',socket=>{transport.sockets.push(socket);if(transport.blocked)socket.close({code:4001,reason:'Test interruption'});else socket.connectToServer();});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.__dustline?.state.connected);return{page,context,transport};
}
const state=page=>page.evaluate(()=>window.__dustline.state);
const wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:18000});
async function check(name,fn){const result=await fn();checks.push({name,...result});console.log('PASS',name,JSON.stringify(result||{}));}
let a,b;
try{
 a=await client();b=await client();
 await check('Fresh clients have no assigned name and blank callsigns cannot create a room',async()=>{assert.equal(await a.page.locator('#callsign').inputValue(),'');await a.page.locator('#create-lobby').click();assert.equal((await state(a.page)).room,undefined);assert.match(await a.page.locator('#toast').textContent(),/callsign/);});
 await check('Personal keyboard and mouse bindings persist and do not change another player',async()=>{
  await a.page.locator('#settings-button').click();await a.page.locator('#keybind-settings summary').click();
  assert.equal(await a.page.locator('[data-bind]').count(),17);
  await a.page.locator('[data-bind="forward"]').click();await a.page.keyboard.press('i');
  assert.equal(await a.page.locator('[data-bind="forward"]').textContent(),'I');
  await a.page.locator('[data-bind="jump"]').click();await a.page.keyboard.press('i');
  assert.ok((await a.page.locator('#binding-status').textContent()).includes('already uses'));
  await a.page.keyboard.press('Escape');
  await a.page.locator('[data-bind="jump"]').click();await a.page.mouse.click(700,200,{button:'middle'});
  assert.equal(await a.page.locator('[data-bind="jump"]').textContent(),'MMB');
  await a.page.locator('[data-bind="aim"]').click();await a.page.keyboard.press('o');
  await a.page.locator('[data-bind="fire"]').click();await a.page.keyboard.press('p');
  await a.page.locator('[data-bind="scoreboard"]').click();await a.page.keyboard.press('b');
  await a.page.locator('[data-bind="pause"]').click();await a.page.keyboard.press('m');
  await a.page.locator('#settings-done').click();await a.page.reload();await wait(a.page,()=>window.__dustline?.state.connected);
  await a.page.locator('#settings-button').click();await a.page.locator('#keybind-settings summary').click();
  assert.equal(await a.page.locator('[data-bind="forward"]').textContent(),'I');
  assert.equal(await a.page.locator('[data-bind="jump"]').textContent(),'MMB');
  await a.page.screenshot({path:path.join(output,'00-personal-controls.png')});
  await a.page.locator('#settings-done').click();
  await b.page.locator('#settings-button').click();await b.page.locator('#keybind-settings summary').click();
  assert.equal(await b.page.locator('[data-bind="forward"]').textContent(),'W');await b.page.locator('#settings-done').click();
  await a.page.locator('#callsign').fill('CONTROL TEST');await a.page.locator('#create-lobby').click();await wait(a.page,()=>!!window.__dustline.state.room);
  await a.page.locator('#bot-count').selectOption('0');await wait(a.page,()=>window.__dustline.state.room.bots===0);
  await a.page.locator('#start-match').click();await wait(a.page,()=>window.__dustline.state.locked&&window.__dustline.state.self);
  const before=(await state(a.page)).body;
  await a.page.keyboard.down('i');await a.page.waitForTimeout(250);await a.page.keyboard.up('i');
  const moved=(await state(a.page)).body;assert.ok(Math.hypot(moved.x-before.x,moved.z-before.z)>.5);
  await a.page.mouse.down({button:'middle'});await wait(a.page,()=>window.__dustline.state.body.y>.25);await a.page.mouse.up({button:'middle'});
  await a.page.keyboard.down('o');await wait(a.page,()=>window.__dustline.state.ads>.9);
  await a.page.keyboard.down('p');await wait(a.page,()=>window.__dustline.state.self.ammo[0]<5);await a.page.keyboard.up('p');await a.page.keyboard.up('o');
  await a.page.keyboard.down('b');assert.equal(await a.page.locator('#scoreboard').isVisible(),true);await a.page.keyboard.up('b');assert.equal(await a.page.locator('#scoreboard').isVisible(),false);
  await a.page.keyboard.press('m');await a.page.locator('#pause-settings').click();
  // Open settings while playing. Movement and scoreboard keys must not reach the match.
  await a.page.keyboard.press('b');assert.equal(await a.page.locator('#scoreboard').isVisible(),false);
  await a.page.locator('#reset-bindings').click();await a.page.locator('#settings-done').click();await a.page.locator('#quit-match').click();
  await wait(a.page,()=>!window.__dustline.state.room);return {actions:17,persisted:true,independent:true,realInput:true};
 });
 await a.page.locator('#callsign').fill('TEAM ALPHA');await b.page.locator('#callsign').fill('TEAM BRAVO');
 await check('Host chooses Foundry TDM; guests see the same settings and 16-player capacity',async()=>{
  await a.page.locator('#create-lobby').click();await wait(a.page,()=>!!window.__dustline.state.room);
  await a.page.locator('#mode-select').selectOption('tdm');await wait(a.page,()=>window.__dustline.state.room.mode==='tdm');
  await a.page.locator('#map-select').selectOption('foundry');await wait(a.page,()=>window.__dustline.state.room.map==='foundry');
  await a.page.locator('#bot-count').selectOption('0');await wait(a.page,()=>window.__dustline.state.room.bots===0);
  const room=(await state(a.page)).room;assert.equal(room.maxPlayers,16);
  await b.page.locator('#room-code').fill(room.code);await b.page.locator('#join-lobby').click();await wait(b.page,()=>!!window.__dustline.state.room);
  assert.equal(await b.page.locator('#mode-select').isDisabled(),true);assert.equal(await b.page.locator('#map-select').inputValue(),'foundry');
  const roster=(await state(b.page)).room.players;assert.notEqual(roster[0].team,roster[1].team);
  await a.page.screenshot({path:path.join(output,'01-team-lobby.png')});
 });
 await check('Foundry TDM shows team scores, player team, and a team scoreboard',async()=>{
  await b.page.locator('#ready-button').click();await wait(a.page,()=>window.__dustline.state.room.players.every(p=>p.id===window.__dustline.state.room.host||p.ready));
  await a.page.locator('#start-match').click();await wait(a.page,()=>window.__dustline.state.phase==='playing');await wait(b.page,()=>window.__dustline.state.phase==='playing');
  assert.equal((await state(a.page)).mode,'tdm');await a.page.locator('#team-score').waitFor({state:'visible'});assert.equal(await a.page.locator('#team-score').isVisible(),true);assert.match(await a.page.locator('#hud-mode').textContent(),/TEAM DEATHMATCH/);
  await a.page.screenshot({path:path.join(output,'02-foundry-tdm.png')});
 });
 await check('Reload and a disconnected socket resume the same operator, room, and team',async()=>{
  const before=await state(b.page);await b.page.reload();await wait(b.page,()=>window.__dustline.state.phase==='playing');let after=await state(b.page);assert.equal(after.self.id,before.self.id);assert.equal(after.self.team,before.self.team);assert.equal(after.room.code,before.room.code);
  // Drop the actual WebSocket and temporarily reject retries. No game state is injected.
  b.transport.blocked=true;b.transport.sockets.at(-1).close({code:4001,reason:'Test interruption'});
  await wait(b.page,()=>!window.__dustline.state.connected);await b.page.waitForTimeout(1200);b.transport.blocked=false;
  await wait(b.page,time=>window.__dustline.state.connected&&window.__dustline.state.phase==='playing'&&window.__dustline.state.snapshotTime>time,before.snapshotTime);after=await state(b.page);assert.equal(after.self.id,before.self.id);assert.equal(after.self.team,before.self.team);assert.equal(after.self.kills,before.self.kills);
  return {preservedIdentity:true,preservedTeam:true};
 });
 // Leaving through the pause UI uses the game's normal room lifecycle.
 await a.page.bringToFront();await a.page.keyboard.press('Escape');await a.page.locator('#quit-match').waitFor({state:'visible'});await a.page.locator('#quit-match').click();
 await wait(a.page,()=>window.__dustline.state.phase==='menu'&&!window.__dustline.state.room);
 await check('Relay CTF supports a full 16-player bot match and displays both flag objectives',async()=>{
  await a.page.locator('#create-lobby').click();await wait(a.page,()=>!!window.__dustline.state.room);
  await a.page.locator('#mode-select').selectOption('ctf');await wait(a.page,()=>window.__dustline.state.room.mode==='ctf');
  await a.page.locator('#map-select').selectOption('relay');await wait(a.page,()=>window.__dustline.state.room.map==='relay');
  await a.page.locator('#bot-count').selectOption('15');await wait(a.page,()=>window.__dustline.state.room.bots===15);
  assert.equal(await a.page.locator('#score-limit').inputValue(),'3');await a.page.locator('#start-match').click();await wait(a.page,()=>window.__dustline.state.phase==='playing'&&window.__dustline.state.self);
  const s=await state(a.page);assert.equal(s.mode,'ctf');assert.equal(s.map,'relay');assert.equal(s.flags.length,2);await a.page.locator('#objective-hud').waitFor({state:'visible'});assert.equal(await a.page.locator('#objective-hud').isVisible(),true);
  await a.page.waitForTimeout(3000);await a.page.screenshot({path:path.join(output,'03-relay-ctf.png')});
  const measured=await state(a.page);return {players:16,fps:Math.round(measured.fps),drawCalls:measured.renderCalls,triangles:measured.triangles};
 });
 await check('Leaving while latency changes cannot restore a departed match',async()=>{
  await a.page.bringToFront();await a.page.keyboard.press('Escape');await a.page.locator('#pause-settings').click();
  await a.page.locator('#latency').selectOption('250');await a.page.locator('#settings-done').click();await a.page.waitForTimeout(400);
  await a.page.locator('#pause-settings').click();await a.page.locator('#latency').selectOption('0');await a.page.locator('#settings-done').click();await a.page.locator('#quit-match').click();
  await wait(a.page,()=>window.__dustline.state.phase==='menu'&&!window.__dustline.state.room);await a.page.waitForTimeout(450);
  assert.equal((await state(a.page)).phase,'menu');assert.equal((await state(a.page)).room,undefined);
 });
 await check('All six new arenas render full FFA matches with 16 players',async()=>{
  const maps=[];
  for(const map of ['bazaar','harbor','citadel','junction','oasis','overpass']){
   await a.page.locator('#create-lobby').click();await wait(a.page,()=>!!window.__dustline.state.room);
   assert.equal(await a.page.locator('#map-select option').count(),9);
   await a.page.locator('#map-select').selectOption(map);await wait(a.page,id=>window.__dustline.state.room.map===id,map);
   await a.page.locator('#bot-count').selectOption('15');await wait(a.page,()=>window.__dustline.state.room.bots===15);
   await a.page.locator('#start-match').click();await wait(a.page,id=>window.__dustline.state.map===id&&window.__dustline.state.phase==='playing',map);
   await a.page.waitForTimeout(600);await a.page.screenshot({path:path.join(output,`${map}.png`)});
   const result=await state(a.page);assert.equal(result.room.maxPlayers,16);assert.equal(result.mode,'ffa');
   maps.push({map,fps:Math.round(result.fps),drawCalls:result.renderCalls});
   await a.page.keyboard.press('Escape');await a.page.locator('#quit-match').click();await wait(a.page,()=>!window.__dustline.state.room);
  }
  return {maps};
 });
 assert.deepEqual(errors,[],'No browser exceptions');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));console.log(`ALL ${checks.length} MODE BROWSER CHECKS PASSED`);
}catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,errors,alpha:a?await state(a.page):null},null,2));console.error(error);process.exitCode=1;}finally{await browser.close();}
