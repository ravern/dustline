import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Real room, real inputs, and a repeatable 360-degree sweep. Frame rate alone
// conceals improvements on a vsync-limited desktop, so also measure CPU work.
const base=process.env.DUSTLINE_URL||'http://localhost:3002';
const label=process.env.DUSTLINE_BENCH_LABEL||'current';
const output=path.resolve('test-results/performance',label);await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
let bytes=0,snapshots=0;
page.on('websocket',ws=>ws.on('framereceived',({payload})=>{const n=typeof payload==='string'?Buffer.byteLength(payload):payload.length;bytes+=n;if(n>1000)snapshots++;}));
const timeDomain=process.env.DUSTLINE_BENCH_CLOCK||'threadTicks';
await cdp.send('Performance.enable',{timeDomain});
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const state=()=>page.evaluate(()=>window.__dustline.state);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:20000});
const endpoint=new URL('/ws',base);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
const peers=[];
async function peer(){const ws=new WebSocket(endpoint),p={ws,room:null};ws.on('message',d=>{const m=JSON.parse(String(d));if(m.type==='room')p.room=m.room;});await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});peers.push(p);return p;}
try{
 await page.goto(base);await wait(()=>window.__dustline?.state.connected);
 await page.locator('#callsign').fill('PERFORMANCE CHECK');
 for(const map of (process.env.DUSTLINE_BENCH_MAPS||'yard,homestead,airfield').split(',')){
  await page.locator('#create-lobby').click();await wait(()=>!!window.__dustline.state.room);
  await page.locator('#bot-count').selectOption('0');await wait(()=>window.__dustline.state.room.bots===0);
  await page.locator('#map-select').selectOption(map);await wait(m=>window.__dustline.state.room.map===m,map);
  const code=(await state()).room.code;
  for(let i=0;i<31;i++){const p=await peer();p.ws.send(JSON.stringify({type:'join',code,name:`Performance ${i}`,loadout:{primary:i%2?'ak47':'scar',secondary:'m9'}}));}
  await wait(()=>window.__dustline.state.room.players.length===32);
  for(const p of peers)p.ws.send(JSON.stringify({type:'ready',ready:true}));
  await wait(()=>window.__dustline.state.room.players.every(p=>p.ready));
  await page.locator('#start-match').click();await wait(()=>window.__dustline.state.phase==='playing'&&window.__dustline.state.locked);
  await page.waitForTimeout(2500);
  for(const quality of ['high','low']){
   await page.keyboard.press('Escape');await page.locator('#pause-settings').click();await page.locator('#quality').selectOption(quality);await page.locator('#settings-done').click();await page.locator('#resume').click();
   await page.waitForTimeout(1200);
   // Visit every view before timing: offscreen texture uploads and first-use
   // shader compilation belong to loading, not steady-state frame work.
   for(let i=0;i<90;i++){await page.mouse.move(720-i*34,450);await page.waitForTimeout(35);}
   await page.waitForTimeout(350);
   if(process.env.DUSTLINE_BENCH_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
   const before=await metrics(),b0=bytes,n0=snapshots,samples=[],t0=performance.now();
   for(let i=0;i<90;i++){await page.mouse.move(720-i*34,450);await page.waitForTimeout(65);const s=await state();samples.push({calls:s.renderCalls,triangles:s.triangles,fps:s.fps});}
   const elapsed=(performance.now()-t0)/1000,after=await metrics();
   const mean=k=>Math.round(samples.reduce((n,s)=>n+s[k],0)/samples.length);
   const result={map,quality,timeDomain,players:32,seconds:Math.round(elapsed*100)/100,fps:mean('fps'),drawCalls:mean('calls'),triangles:mean('triangles'),mainThreadMsPerSecond:Math.round((after.TaskDuration-before.TaskDuration)*1000/elapsed),scriptMsPerSecond:Math.round((after.ScriptDuration-before.ScriptDuration)*1000/elapsed),heapMB:Math.round(after.JSHeapUsedSize/1048576),bytesPerSecond:Math.round((bytes-b0)/elapsed),meanSnapshotBytes:Math.round((bytes-b0)/(snapshots-n0))};
   if(process.env.DUSTLINE_BENCH_PROFILE){const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(output,`${map}-${quality}.cpuprofile`),JSON.stringify(profile));}
   results.push(result);console.log(JSON.stringify(result));await page.screenshot({path:path.join(output,`${map}-${quality}.png`)});
  }
  await page.keyboard.press('Escape');await page.locator('#quit-match').click();await wait(()=>!window.__dustline.state.room);
  for(const p of peers.splice(0)){p.ws.send(JSON.stringify({type:'leave'}));p.ws.close();}
 }
 assert.deepEqual(errors,[]);
}catch(e){console.error(e);process.exitCode=1;}
finally{for(const p of peers)p.ws.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();}
