import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import './style.css';
import * as THREE from 'three';
import { Network } from './network';
import { AudioEngine } from './audio';
import { GameView } from './renderer';
import { $, mountUI, paintLoadout, paintLobby, paintRooms, paintScoreboard, timer, escapeHTML } from './ui';
import { DT, move } from '../shared/physics';
import { MAP_BOXES, MAP_SIZE } from '../shared/map';
import { WEAPONS, weaponForSlot } from '../shared/weapons';
import type { Body, GameEvent, Input, Loadout, PlayerState, PrimaryId, RoomInfo, ServerMessage, Slot, Snapshot } from '../shared/types';

mountUI();
const audio=new AudioEngine();
const net=new Network();
let view:GameView;
try {view=new GameView($<HTMLCanvasElement>('game-canvas'));} catch(error) {$('loading').classList.add('hidden');$('webgl-error').classList.remove('hidden');throw error;}
let saved:Record<string,unknown>={};try{saved=JSON.parse(localStorage.getItem('dustline-settings')||'{}');}catch{}
let loadout:Loadout={primary:['intervention','ak47','scar'].includes(String(saved.primary))?saved.primary as PrimaryId:'intervention',secondary:'m9'};
let draftLoadout:Loadout={...loadout};
let room:RoomInfo|undefined;
let page:'play'|'loadout'|'controls'='play';
let phase:'menu'|'playing'|'finished'='menu';
let snapshot:Snapshot|undefined;
let self:PlayerState|undefined;
let body:Body|undefined;
let pending:Input[]=[];
let outgoing:Input[]=[];
let history:Snapshot[]=[];
let seq=0,yaw=0,pitch=0;
let keys=new Set<string>();
let fire=false,ads=false,lastFire=false;
let slot:Slot=0;
let accumulator=0,previousTime=performance.now()/1000,hudTime=0,stepTime=0,fps=60;
let nextLocalShot=0,lastLocalShot=-10,reloadStarted=0,localMeleeUntil=0,restoreSlot:Slot=0;
let predictedShots:{seq:number;slot:Slot}[]=[];
let predictedReload:{seq:number;until:number}|undefined;
let renderDelay=.1;
const renderTime=()=>net.now()-renderDelay;
const reloadUntil=()=>Math.max(self?.reloading||0,predictedReload?.until||0);
const availableAmmo=(s:Slot)=>Math.max(0,(self?.ammo[s]||0)-predictedShots.filter(p=>p.slot===s).length);
let lastEvent=0,lastDamageTime=-10,hitUntil=0,noticeUntil=0;
let feed:{text:string;until:number}[]=[];
let autoStart=false,loading=false,toastTimer:ReturnType<typeof setTimeout>;
let settingsOpen=false,tabHeld=false,previewReady=false;
let wasGrounded=true,previousStance='stand';
let lanUrl='';
let lastSnapshotReceived=performance.now();
let correction=new THREE.Vector3();
let correctionMagnitude=0;
let stationaryTime=0;
const cleanCallsign=()=>($<HTMLInputElement>('callsign').value.trim().slice(0,18)||'Operator');
$<HTMLInputElement>('callsign').value=String(saved.callsign||'RAVEN');
view.sensitivity=Number(saved.sensitivity)||1;view.fov=Number(saved.fov)||82;audio.setVolume(saved.volume===undefined?.45:Number(saved.volume));
if(saved.quality==='low')view.setQuality('low');
const save=()=>localStorage.setItem('dustline-settings',JSON.stringify({primary:loadout.primary,callsign:cleanCallsign(),sensitivity:view.sensitivity,fov:view.fov,volume:audio.volume,quality:view.quality}));
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showMenuPage(next:typeof page){
  if(phase!=='menu')return;
  page=next;audio.click();
  $('play-panel').classList.toggle('hidden',next!=='play'||!!room);
  $('rooms-panel').classList.toggle('hidden',next!=='play'||!!room);
  $('lobby-panel').classList.toggle('hidden',next!=='play'||!room);
  $('loadout-panel').classList.toggle('hidden',next!=='loadout');
  $('controls-panel').classList.toggle('hidden',next!=='controls');
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===next));
  if(next==='loadout'){draftLoadout={...loadout};paintLoadout(draftLoadout);view.preview(draftLoadout.primary,$<HTMLCanvasElement>('weapon-preview'));previewReady=true;}
}
function resetControls(){keys.clear();fire=false;ads=false;lastFire=false;localMeleeUntil=0;}
function requestLock(){
  audio.unlock();
  if(!net.connected){toast('Reconnecting to the local server…');return;}
  try{const result=$('game-canvas').requestPointerLock();if(result&&typeof result.catch==='function')result.catch(()=>toast('Mouse capture is unavailable here. Open localhost:3000 in your regular browser to play.'));}catch{toast('Mouse capture is unavailable here. Open localhost:3000 in your regular browser to play.');}
}
function syncOverlays(){
  const playing=phase==='playing';
  $('menu').classList.toggle('hidden',phase!=='menu');
  $('hud').classList.toggle('hidden',!playing);
  $('pause').classList.toggle('hidden',!playing||!!document.pointerLockElement||settingsOpen);
  $('scoreboard').classList.toggle('hidden',phase!=='finished'&&!(playing&&tabHeld));
  $('post-match').classList.toggle('hidden',phase!=='finished');
  $('scoreboard-title').textContent=phase==='finished'?'MATCH COMPLETE':'SCOREBOARD';
  if(phase==='finished'&&room){const host=room.host===net.id;$<HTMLButtonElement>('return-lobby').disabled=!host;$('return-lobby').innerHTML=host?'RETURN TO LOBBY <b>→</b>':'WAITING FOR HOST';}
}
function leaveRoom(){net.send({type:'leave'});}
function openSettings(){settingsOpen=true;if(document.pointerLockElement)document.exitPointerLock();$('settings').classList.remove('hidden');syncOverlays();}
function closeSettings(){settingsOpen=false;$('settings').classList.add('hidden');syncOverlays();save();}
function selectWeapon(id:PrimaryId){draftLoadout={primary:id,secondary:'m9'};paintLoadout(draftLoadout);$('active-primary').textContent=WEAPONS[loadout.primary].shortName;view.preview(id,$<HTMLCanvasElement>('weapon-preview'));audio.click();}
function applyLoadout(){loadout={...draftLoadout};paintLoadout(loadout);save();if(room)net.send({type:'loadout',loadout});showMenuPage('play');toast(`${WEAPONS[loadout.primary].name} equipped. M9 and knife ready.`);}
function create(practice:boolean){if(!net.connected){toast('Connecting to your local server…');return;}save();autoStart=practice;loading=true;net.send({type:'create',name:cleanCallsign(),loadout,bots:3,private:practice});if(practice)requestLock();}
function join(code:string){if(!code.trim()){toast('Enter a room code to join.');$<HTMLInputElement>('room-code').focus();return;}save();net.send({type:'join',code:code.trim().toUpperCase(),name:cleanCallsign(),loadout});}
$('create-lobby').onclick=()=>create(false);$('practice').onclick=()=>create(true);
$('join-lobby').onclick=()=>join($<HTMLInputElement>('room-code').value);
$('room-code').addEventListener('keydown',e=>{if(e.key==='Enter')join($<HTMLInputElement>('room-code').value);});
$('room-code').addEventListener('input',()=>{$<HTMLInputElement>('room-code').value=$<HTMLInputElement>('room-code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
$('callsign').addEventListener('change',save);
$('refresh-rooms').onclick=()=>{net.send({type:'list'});audio.click();};
$('rooms-list').addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-room]');if(button)join(button.dataset.room!);});
$('home').onclick=()=>showMenuPage('play');
document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b=>b.onclick=()=>showMenuPage(b.dataset.nav as typeof page));
$('footer-loadout').onclick=()=>showMenuPage('loadout');
document.querySelectorAll<HTMLElement>('[data-weapon]').forEach(b=>b.onclick=()=>selectWeapon(b.dataset.weapon as PrimaryId));
$('save-loadout').onclick=applyLoadout;
$('leave-lobby').onclick=leaveRoom;$('quit-match').onclick=leaveRoom;$('post-leave').onclick=leaveRoom;
$('start-match').onclick=()=>{net.send({type:'start'});requestLock();};
$('ready-button').onclick=()=>{const me=room?.players.find(p=>p.id===net.id);net.send({type:'ready',ready:!me?.ready});audio.click();};
$('return-lobby').onclick=()=>net.send({type:'return'});
['bot-count','score-limit','time-limit'].forEach(id=>$(id).addEventListener('change',()=>net.send({type:'settings',bots:Number($<HTMLSelectElement>('bot-count').value),limit:Number($<HTMLSelectElement>('score-limit').value),duration:Number($<HTMLSelectElement>('time-limit').value)})));
$('copy-invite').onclick=async()=>{if(!room)return;const origin=(location.hostname==='localhost'||location.hostname==='127.0.0.1')&&lanUrl?lanUrl:location.origin;try{await navigator.clipboard.writeText(`${origin}/?room=${room.code}`);toast(`Invite copied. Room ${room.code} · same Wi-Fi / LAN.`);}catch{toast(`Room code: ${room.code}. Join from another browser on this server.`);}};
$('resume').onclick=requestLock;$('game-canvas').onclick=()=>{if(phase==='playing'&&!document.pointerLockElement&&!settingsOpen)requestLock();};
$('settings-button').onclick=openSettings;$('pause-settings').onclick=openSettings;$('close-settings').onclick=closeSettings;$('settings-done').onclick=closeSettings;
function refreshSettings(){
  $<HTMLInputElement>('sensitivity').value=String(view.sensitivity);$('sensitivity-value').textContent=view.sensitivity.toFixed(1);
  $<HTMLInputElement>('fov').value=String(view.fov);$('fov-value').textContent=`${view.fov}°`;
  $<HTMLInputElement>('volume').value=String(Math.round(audio.volume*100));$('volume-value').textContent=`${Math.round(audio.volume*100)}%`;
  $<HTMLSelectElement>('quality').value=view.quality;$<HTMLSelectElement>('latency').value=String(net.latency);
}
$('sensitivity').addEventListener('input',()=>{view.sensitivity=Number($<HTMLInputElement>('sensitivity').value);refreshSettings();save();});
$('fov').addEventListener('input',()=>{view.fov=Number($<HTMLInputElement>('fov').value);refreshSettings();save();});
$('volume').addEventListener('input',()=>{audio.unlock();audio.setVolume(Number($<HTMLInputElement>('volume').value)/100);refreshSettings();save();});
$('quality').addEventListener('change',()=>{view.setQuality($<HTMLSelectElement>('quality').value as 'high'|'low');save();});
$('latency').addEventListener('change',()=>{net.latency=Number($<HTMLSelectElement>('latency').value);toast(net.latency?`Added ${net.latency} ms round-trip delay.`:'Added network delay removed.');});
refreshSettings();paintLoadout(loadout);
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode)$<HTMLInputElement>('room-code').value=inviteCode.toUpperCase();
fetch('/api/info').then(r=>r.json()).then(data=>{lanUrl=data.lanUrls?.find((url:string)=>!url.includes('192.168.64.'))||data.lanUrls?.[0]||'';}).catch(()=>{});

document.addEventListener('pointerlockchange',()=>{resetControls();syncOverlays();});
document.addEventListener('pointerlockerror',()=>{if(phase==='playing')syncOverlays();});
addEventListener('blur',resetControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetControls();});
addEventListener('contextmenu',e=>{if(phase==='playing')e.preventDefault();});
addEventListener('mousemove',e=>{if(!document.pointerLockElement||phase!=='playing'||self?.hp===0)return;const factor=.0021*view.sensitivity*(view.ads>.5?(slot===0&&loadout.primary==='intervention'?.25:.72):1);yaw-=e.movementX*factor;pitch=THREE.MathUtils.clamp(pitch-e.movementY*factor,-1.45,1.45);});
addEventListener('mousedown',e=>{if(!document.pointerLockElement||phase!=='playing')return;if(e.button===0)fire=true;if(e.button===2)ads=true;audio.unlock();});
addEventListener('mouseup',e=>{if(e.button===0)fire=false;if(e.button===2)ads=false;});
addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,select,textarea'))return;
  if(phase!=='playing')return;
  if(e.code==='Escape'&&document.pointerLockElement){document.exitPointerLock();return;}
  if(['Space','Tab','ControlLeft','ControlRight','ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();
  if(e.code==='Tab'){tabHeld=true;syncOverlays();}
  if(!document.pointerLockElement)return;
  keys.add(e.code);
  if(e.repeat)return;
  let next:Slot|undefined;if(e.code==='Digit1')next=0;if(e.code==='Digit2')next=1;if(e.code==='Digit3')next=2;if(e.code==='KeyQ')next=slot===0?1:0;
  if(next!==undefined){slot=next;ads=false;fire=false;lastFire=false;localMeleeUntil=0;predictedReload=undefined;nextLocalShot=net.now()+.2;audio.click();}
  if(e.code==='KeyV'&&!localMeleeUntil){restoreSlot=slot;slot=2;ads=false;fire=false;lastFire=false;predictedReload=undefined;localMeleeUntil=net.now()+.7;nextLocalShot=net.now()+.2;}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'){tabHeld=false;syncOverlays();}});

net.onStatus=connected=>{
  $('connection').classList.toggle('online',connected);$('connection').innerHTML=`<i></i>${connected?'LOCAL SERVER ONLINE':'RECONNECTING'}`;
  if(!connected&&room){room=undefined;phase='menu';body=undefined;self=undefined;snapshot=undefined;history=[];pending=[];outgoing=[];resetControls();if(document.pointerLockElement)document.exitPointerLock();showMenuPage('play');syncOverlays();toast('Connection lost. Reconnecting—join or create a lobby when back online.');}
};
net.onMessage=(message:ServerMessage)=>{
  if(message.type==='rooms'){paintRooms(message.rooms);return;}
  if(message.type==='error'){toast(message.message);loading=false;autoStart=false;if(phase==='menu'&&document.pointerLockElement)document.exitPointerLock();return;}
  if(message.type==='left'){room=undefined;phase='menu';body=undefined;self=undefined;snapshot=undefined;pending=[];outgoing=[];history=[];seq=0;lastEvent=0;resetControls();settingsOpen=false;$('settings').classList.add('hidden');if(document.pointerLockElement)document.exitPointerLock();showMenuPage('play');syncOverlays();net.send({type:'list'});return;}
  if(message.type==='room'){
    room=message.room;loading=false;
    if(room.state==='lobby'){
      if(phase!=='menu'){phase='menu';body=undefined;self=undefined;snapshot=undefined;pending=[];outgoing=[];history=[];seq=0;lastEvent=0;resetControls();if(document.pointerLockElement)document.exitPointerLock();}
      paintLobby(room,net.id);showMenuPage('play');syncOverlays();
      if(autoStart){autoStart=false;net.send({type:'start'});}
    }
    $('hud-limit').textContent=String(room.limit);$('scoreboard-room').textContent=`ROOM ${room.code}`;
    if(phase==='finished')syncOverlays();
    return;
  }
  if(message.type==='snapshot')receiveSnapshot(message);
};
function receiveSnapshot(next:Snapshot){
  lastSnapshotReceived=performance.now();
  const previous=self;const incoming=next.players.find(p=>p.id===net.id);if(!incoming)return;
  const entering=phase==='menu';const respawned=!!previous&&previous.hp<=0&&incoming.hp>0;
  snapshot=next;self=incoming;
  predictedShots=predictedShots.filter(shot=>shot.seq>incoming.ack);
  if(predictedReload&&predictedReload.seq<=incoming.ack)predictedReload=undefined;
  if(entering){predictedShots=[];predictedReload=undefined;seq=Math.max(0,incoming.ack+1);pending=[];outgoing=[];history=[];lastEvent=0;feed=[];accumulator=0;slot=incoming.slot;loadout={...incoming.loadout};yaw=incoming.body.yaw;pitch=incoming.body.pitch;nextLocalShot=incoming.nextFire;body={...incoming.body};view.eye=1.6;correction.set(0,0,0);}
  if(respawned){predictedShots=[];predictedReload=undefined;pending=[];outgoing=[];slot=incoming.slot;yaw=incoming.body.yaw;pitch=0;nextLocalShot=incoming.nextFire;correction.set(0,0,0);resetControls();}
  pending=pending.filter(input=>input.seq>incoming.ack);
  const before=body?{...body}:undefined;
  body={...incoming.body};
  if(incoming.hp>0){for(const input of pending)body=move(body,input,DT);}
  if(before&&!entering&&!respawned){const delta=new THREE.Vector3(before.x-body.x,before.y-body.y,before.z-body.z);correctionMagnitude=delta.length();if(delta.length()<1.5)correction.add(delta);else correction.set(0,0,0);}
  if(pending.length>120){pending=[];outgoing=[];body={...incoming.body};correction.set(0,0,0);}
  history.push(next);history=history.filter(s=>s.time>next.time-.7).slice(-18);
  if(previous&&incoming.hp<previous.hp){lastDamageTime=performance.now()/1000;audio.land();}
  if(incoming.reloading>net.now()&&(!previous||previous.reloading<=net.now())){reloadStarted=net.now();}
  for(const event of next.events){if(event.id>lastEvent){if(event.time>net.now()-1.5)handleEvent(event);lastEvent=event.id;}}
  phase=next.state==='finished'?'finished':'playing';
  if(phase==='finished'){resetControls();if(document.pointerLockElement)document.exitPointerLock();paintScoreboard(next.players,net.id);const winner=[...next.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)[0];$('winner-text').textContent=winner?`${winner.name} wins with ${winner.kills} eliminations.`:'Match complete.';}
  if(entering||phase==='finished')syncOverlays();
}
function handleEvent(e:GameEvent){
  const now=performance.now()/1000;const player=snapshot?.players.find(p=>p.id===e.player);const target=snapshot?.players.find(p=>p.id===e.target);
  if(e.type==='shot'&&e.from&&e.to){
    if(e.player!==net.id&&body){const distance=Math.hypot(e.from.x-body.x,e.from.z-body.z);audio.shot(e.weapon||'ak47',distance,Math.sin(Math.atan2(e.from.x-body.x,e.from.z-body.z)-yaw));view.tracer(e.from,e.to,now);}
    // Local shot audio and muzzle kick were already predicted with the input.
  }
  if(e.type==='hit'&&e.player===net.id){hitUntil=now+.16;$('hitmarker').classList.remove('kill');audio.hit();}
  if(e.type==='kill'){
    const killer=player?.name||'Operator',victim=target?.name||'Operator';
    feed.push({text:`<span class="${e.player===net.id?'feed-you':''}">${escapeHTML(killer)}</span><span class="feed-gun">${WEAPONS[e.weapon||'knife'].shortName}${e.headshot?' ⊕':''}</span><b class="${e.target===net.id?'feed-you':''}">${escapeHTML(victim)}</b>`,until:now+5});feed=feed.slice(-5);
    if(e.player===net.id){hitUntil=now+.25;$('hitmarker').classList.add('kill');audio.hit(true);noticeUntil=now+2;$('kill-notice').querySelector('strong')!.textContent=e.quickscope?'QUICKSCOPE +100':e.headshot?'HEADSHOT +100':'ELIMINATION +100';$('kill-notice').querySelector('span')!.textContent=target?.name||'OPERATOR';}
    if(e.target===net.id)$('killer-name').textContent=`Eliminated by ${killer} · ${WEAPONS[e.weapon||'knife'].name}`;
  }
}
function fixedStep(){
  if(phase!=='playing'||!self||!body)return;
  const active=!!document.pointerLockElement&&self.hp>0&&!settingsOpen;
  const now=net.now();
  const melee=localMeleeUntil>now;
  if(localMeleeUntil&&now>=localMeleeUntil){slot=restoreSlot;localMeleeUntil=0;}
  const firing=active&&(fire||(melee&&now>=localMeleeUntil-.43));
  const aiming=active&&ads&&slot!==2&&reloadUntil()<=now&&body.stance!=='slide';
  const sprint=active&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!firing&&!aiming;
  const input:Input={seq:seq++,yaw,pitch,forward:active?(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0):0,right:active?(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0):0,jump:active&&keys.has('Space'),sprint,crouch:active&&(keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight')),ads:aiming,fire:firing,reload:active&&keys.has('KeyR'),slot,time:now,viewTime:renderTime()};
  if(self.hp>0){body=move(body,input,DT);pending.push(input);}
  outgoing.push(input);
  if(outgoing.length>=2){net.send({type:'inputs',inputs:outgoing});outgoing=[];}
  const id=weaponForSlot(self.loadout,slot),weapon=WEAPONS[id];
  if(input.reload&&reloadUntil()<=now&&id!=='knife'&&availableAmmo(slot)<weapon.mag&&self.reserve[slot]>0){predictedReload={seq:input.seq,until:now+weapon.reloadTime};audio.reload();}
  if(firing&&(weapon.automatic||!lastFire)&&now>=nextLocalShot&&reloadUntil()<=now&&(id==='knife'||availableAmmo(slot)>0)){
    audio.shot(id);view.shot();if(id!=='knife')predictedShots.push({seq:input.seq,slot});nextLocalShot=now+weapon.fireInterval;lastLocalShot=performance.now()/1000;
    pitch=THREE.MathUtils.clamp(pitch+weapon.recoil,-1.45,1.45);
  }
  lastFire=firing;
  if(self.hp>0){
    if(!wasGrounded&&body.grounded){audio.land();view.landing=.04;}
    if(previousStance!=='slide'&&body.stance==='slide')audio.slide();
    const speed=Math.hypot(body.vx,body.vz);if(body.grounded&&speed>1&&body.stance!=='slide'){stepTime+=DT;if(stepTime>(sprint?.29:.41)){audio.step(sprint);stepTime=0;}}
  }
  wasGrounded=body.grounded;previousStance=body.stance;
}
function interpolatedPlayers():PlayerState[]{
  if(!snapshot)return[];
  const targetTime=renderTime();
  let a=history[0]||snapshot,b=a;
  for(const h of history){if(h.time<=targetTime)a=h;if(h.time>=targetTime){b=h;break;}b=h;}
  const ratio=b.time>a.time?THREE.MathUtils.clamp((targetTime-a.time)/(b.time-a.time),0,1):0;
  return snapshot.players.map(p=>{
    if(p.id===net.id)return p;
    const pa=a.players.find(x=>x.id===p.id),pb=b.players.find(x=>x.id===p.id);
    if(!pa||!pb||pa.hp<=0||pb.hp<=0||pa.deaths!==pb.deaths||Math.hypot(pa.body.x-pb.body.x,pa.body.z-pb.body.z)>5)return p;
    const angle=Math.atan2(Math.sin(pb.body.yaw-pa.body.yaw),Math.cos(pb.body.yaw-pa.body.yaw));
    return{...p,body:{...pa.body,x:THREE.MathUtils.lerp(pa.body.x,pb.body.x,ratio),y:THREE.MathUtils.lerp(pa.body.y,pb.body.y,ratio),z:THREE.MathUtils.lerp(pa.body.z,pb.body.z,ratio),yaw:pa.body.yaw+angle*ratio}};
  });
}
function drawMinimap(){
  if(!body||!snapshot)return;
  const ctx=$<HTMLCanvasElement>('minimap').getContext('2d')!;const s=176/MAP_SIZE;
  ctx.clearRect(0,0,176,176);ctx.fillStyle='#101d17dd';ctx.fillRect(0,0,176,176);
  ctx.strokeStyle='#8ea57916';ctx.lineWidth=1;for(let i=0;i<176;i+=22){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,176);ctx.moveTo(0,i);ctx.lineTo(176,i);ctx.stroke();}
  for(const box of MAP_BOXES){ctx.fillStyle=box.y>3?'#66755490':'#83936b85';ctx.fillRect((box.x-box.w/2+MAP_SIZE/2)*s,(box.z-box.d/2+MAP_SIZE/2)*s,Math.max(1,box.w*s),Math.max(1,box.d*s));}
  for(const p of snapshot.players){if(p.id===net.id||p.hp<=0)continue;const recentlyFired=snapshot.events.some(e=>e.type==='shot'&&e.player===p.id&&snapshot!.time-e.time<1.1);if(!recentlyFired)continue;ctx.fillStyle='#ed825b';ctx.beginPath();ctx.arc((p.body.x+MAP_SIZE/2)*s,(p.body.z+MAP_SIZE/2)*s,2.5,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.translate((body.x+MAP_SIZE/2)*s,(body.z+MAP_SIZE/2)*s);ctx.rotate(-yaw);ctx.fillStyle='#d0f778';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3.5,4);ctx.lineTo(0,2);ctx.lineTo(-3.5,4);ctx.closePath();ctx.fill();ctx.restore();
}
function updateHUD(time:number){
  if(!self||!body||!snapshot)return;
  const weapon=WEAPONS[weaponForSlot(self.loadout,slot)];const now=net.now();
  $('match-timer').textContent=timer(snapshot.endsAt-now);$('hud-ping').textContent=`${Math.round(net.rtt)} MS`;$('hud-fps').textContent=`${Math.round(fps)} FPS`;
  $('health').textContent=String(self.hp);$('health-bar').style.width=`${self.hp}%`;$('health-bar').style.background=self.hp<35?'#ee9476':'#d0f778';
  $('hud-name').textContent=self.name;$('personal-score').textContent=`${self.kills} K / ${self.deaths} D`;
  $('stance').textContent=self.hp<=0?'KIA':body.stance==='slide'?'SLIDING':body.stance==='crouch'?'CROUCHED':Math.hypot(body.vx,body.vz)>7?'SPRINTING':self.protectedUntil>now?'PROTECTED':'READY';
  $('hud-weapon').textContent=weapon.shortName;$('ammo').textContent=weapon.id==='knife'?'∞':String(availableAmmo(slot)).padStart(2,'0');$('reserve').textContent=String(self.reserve[slot]);
  $('ammo').style.color=weapon.id!=='knife'&&availableAmmo(slot)<=Math.ceil(weapon.mag*.2)?'#efb680':'';
  [0,1,2].forEach(i=>$(`slot-${i}`).classList.toggle('selected',slot===i));
  $('scope').classList.toggle('hidden',!(weapon.id==='intervention'&&view.ads>=.999&&self.hp>0));
  $('crosshair').style.opacity=self.hp<=0?'0':String(1-view.ads);
  $('crosshair').style.setProperty('--gap',`${7+(keys.has('ShiftLeft')?5:0)+(Math.hypot(body.vx,body.vz)>1?4:0)+view.kick*90}px`);
  const interrupted=performance.now()-lastSnapshotReceived>1800;
  $('action-notice').textContent=interrupted?'CONNECTION INTERRUPTED':reloadUntil()>now?'RELOADING':weapon.id==='intervention'&&nextLocalShot>now+.2&&now-self.nextFire<1?'CYCLING BOLT':availableAmmo(slot)===0?'PRESS R TO RELOAD':'';
  $('hitmarker').style.opacity=time<hitUntil?'1':'0';$('kill-notice').style.opacity=time<noticeUntil?'1':'0';
  const hurt=Math.max(0,1-(time-lastDamageTime)*1.3);$('damage-vignette').style.opacity=String(Math.max(self.hp>0?(100-self.hp)/160:0,hurt*.8));
  feed=feed.filter(f=>f.until>time);$('killfeed').innerHTML=feed.map(f=>`<div class="feed-line">${f.text}</div>`).join('');
  $('respawn').classList.toggle('hidden',self.hp>0);$('respawn-count').textContent=String(Math.max(1,Math.ceil(self.respawnAt-now)));
  if(tabHeld||phase==='finished')paintScoreboard(snapshot.players,net.id);
  drawMinimap();
}
function animate(ms:number){
  const time=ms/1000,dt=Math.min(.1,time-previousTime);previousTime=time;
  fps=THREE.MathUtils.lerp(fps,1/Math.max(.001,dt),.035);
  renderDelay=THREE.MathUtils.damp(renderDelay,Math.max(.1,Math.max(net.rtt,net.latency)/2000+.075),5,dt);
  accumulator+=dt;let steps=0;while(accumulator>=DT&&steps<6){fixedStep();accumulator-=DT;steps++;}
  correction.multiplyScalar(Math.exp(-dt*20));
  const current=weaponForSlot(self?.loadout||loadout,slot);view.setWeapon(current);
  const now=net.now();const aiming=ads&&!!document.pointerLockElement&&self?.hp!==0&&!!self&&reloadUntil()<=now&&body?.stance!=='slide';
  const sprint=!!body&&Math.hypot(body.vx,body.vz)>7&&body.stance==='stand'&&!aiming;
  const reloadProgress=self&&reloadUntil()>now?THREE.MathUtils.clamp(1-(reloadUntil()-now)/WEAPONS[current].reloadTime,0,1):0;
  view.draw(time,dt,body,yaw,pitch,phase!=='menu',aiming,sprint,reloadProgress,!!self&&self.hp>0,interpolatedPlayers(),net.id,correction,phase==='menu'&&page==='loadout'&&previewReady);
  $('scope').classList.toggle('hidden',!(current==='intervention'&&view.ads>=.999&&self&&self.hp>0));
  $('crosshair').style.opacity=!self||self.hp<=0?'0':String(1-view.ads);
  $('hitmarker').style.opacity=time<hitUntil?'1':'0';
  if(time-hudTime>.08){hudTime=time;updateHUD(time);}
  requestAnimationFrame(animate);
}
net.connect();
setInterval(()=>{if(phase==='menu'&&!room)net.send({type:'list'});},5000);
$('loading').classList.add('hidden');
showMenuPage('play');syncOverlays();requestAnimationFrame(animate);
// Read-only diagnostics for the included browser tests and local troubleshooting.
Object.defineProperty(window,'__dustline',{value:{get state(){return{phase,room,body,self,pending:pending.length,seq,correction:correctionMagnitude,rtt:net.rtt,ads:view.ads,slot,yaw,pitch,fps,connected:net.connected,locked:!!document.pointerLockElement,snapshotTime:snapshot?.time,latency:net.latency,renderDelay,predictedAmmo:availableAmmo(slot),renderCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};}}});
