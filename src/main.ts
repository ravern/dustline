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
import { ACTIONS, CONTROLS, actionForCode, bindingError, controlLabel, defaultBindings, held, normalizeCode, readBindings, type Action } from './controls';
import { Network } from './network';
import { interpolatePlayers, snapshotIndex } from './interpolation';
import { readLoadouts, sameLoadout, PRIMARY_WEAPONS, type LoadoutPreset } from './loadouts';
import { AudioEngine } from './audio';
import { GameView } from './renderer';
import { $, mountUI, paintLoadout, paintLobby, paintRooms, paintScoreboard, timer, escapeHTML } from './ui';
import { DT, move } from '../shared/physics';
import { collisionIndex, type CollisionIndex } from '../shared/collision';
import { getMap, type MapId, type MapDefinition } from '../shared/map';
import { MODES } from '../shared/types';
import { WEAPONS, weaponForSlot } from '../shared/weapons';
import type { Body, GameEvent, GameMode, Input, Loadout, PlayerState, PrimaryId, SecondaryId, WeaponId, RoomInfo, ServerMessage, Slot, Snapshot } from '../shared/types';

mountUI();
// Only the HUD uses these setters: stable elements and rendered values avoid
// replacing identical text/markup or invalidating styles every animation frame.
const hudElements=new Map<string,HTMLElement>(),hudValues=new Map<string,string>();
function hudElement(id:string){let element=hudElements.get(id);if(!element){element=$(id);hudElements.set(id,element);}return element;}
function changedHUD(key:string,value:string){if(hudValues.get(key)===value)return false;hudValues.set(key,value);return true;}
function hudText(id:string,value:string){if(changedHUD(`${id}:text`,value))hudElement(id).textContent=value;}
function hudHTML(id:string,value:string){if(changedHUD(`${id}:html`,value))hudElement(id).innerHTML=value;}
function hudStyle(id:string,property:string,value:string){if(changedHUD(`${id}:${property}`,value))hudElement(id).style.setProperty(property,value);}
function hudClass(id:string,name:string,on:boolean){const element=hudElement(id);if(element.classList.contains(name)!==on)element.classList.toggle(name,on);}
const minimap=$<HTMLCanvasElement>('minimap'),minimapContext=minimap.getContext('2d')!;
const minimapBackground=document.createElement('canvas');minimapBackground.width=minimap.width;minimapBackground.height=minimap.height;
let minimapMap:ReturnType<typeof getMap>|undefined;
let scoreboardPlayers:PlayerState[]=[],scoreboardSelf='';
function updateScoreboard(players:PlayerState[]){
  const changed=scoreboardSelf!==net.id||players.length!==scoreboardPlayers.length||players.some((p,i)=>{const old=scoreboardPlayers[i];return p.id!==old.id||p.name!==old.name||p.team!==old.team||p.bot!==old.bot||p.kills!==old.kills||p.deaths!==old.deaths||p.captures!==old.captures;});
  if(changed){paintScoreboard(players,net.id);scoreboardPlayers=players;scoreboardSelf=net.id;}
}
const audio=new AudioEngine();
const net=new Network();
let view:GameView;
try {view=new GameView($<HTMLCanvasElement>('game-canvas'));} catch(error) {$('loading').classList.add('hidden');$('webgl-error').classList.remove('hidden');throw error;}
let saved:Record<string,unknown>={};try{saved=JSON.parse(localStorage.getItem('dustline-settings')||'{}')??{};}catch{}
let bindings=readBindings(saved?.bindings);
let captureBinding:Action|undefined;
const storedLoadouts=readLoadouts(saved);
let presets=storedLoadouts.presets,activePreset=storedLoadouts.active;
let loadout:Loadout={...presets[activePreset].weapons};
let draftPresets:LoadoutPreset[]=[],draftPreset=activePreset;
let draftLoadout:Loadout={...loadout};
let matchLoadoutOpen=false;
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
let queuedGrenade:'frag'|'flash'|undefined;
let localThrowUntil=0,nextLocalGrenade=0,lastFrag=false,lastFlash=false;
const throwUntil=()=>Math.max(localThrowUntil,(self?.nextGrenade||0)-.2);
let predictedShots:{seq:number;slot:Slot}[]=[];
let predictedReload:{seq:number;until:number}|undefined;
let renderDelay=.1, arrivalJitter=0, lastArrival=0, lastServerTime=0, remoteTime=0;
let resuming=false;
const renderTime=()=>remoteTime||net.now()-renderDelay;
const activeMap=()=>getMap(snapshot?.map||room?.map||'yard');
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
const cleanCallsign=()=>($<HTMLInputElement>('callsign').value.trim().slice(0,18));
// Older versions silently saved an assigned callsign. Require an explicit name once after upgrading.
$<HTMLInputElement>('callsign').value=saved.callsignExplicit===true?String(saved.callsign||''):'';
function requireCallsign(){if(cleanCallsign())return true;toast('Enter your callsign before joining the fight.');$<HTMLInputElement>('callsign').focus();return false;}
view.sensitivity=Number(saved.sensitivity)||1;view.fov=Number(saved.fov)||82;audio.setVolume(saved.volume===undefined?.45:Number(saved.volume));
if(saved.quality==='low')view.setQuality('low');
const save=()=>localStorage.setItem('dustline-settings',JSON.stringify({primary:loadout.primary,callsign:cleanCallsign(),callsignExplicit:!!cleanCallsign(),sensitivity:view.sensitivity,fov:view.fov,volume:audio.volume,quality:view.quality,bindings,loadouts:presets,activeLoadout:activePreset}));
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showMenuPage(next:typeof page){
  if(phase!=='menu'&&next!=='loadout')return;
  if(next==='loadout'){matchLoadoutOpen=phase==='playing';if(document.pointerLockElement)document.exitPointerLock();draftPresets=presets.map(p=>({name:p.name,weapons:{...p.weapons}}));draftPreset=activePreset;}
  page=next;audio.click();
  $('play-panel').classList.toggle('hidden',next!=='play'||!!room);
  $('rooms-panel').classList.toggle('hidden',next!=='play'||!!room);
  $('lobby-panel').classList.toggle('hidden',next!=='play'||!room);
  $('loadout-panel').classList.toggle('hidden',next!=='loadout');
  $('controls-panel').classList.toggle('hidden',next!=='controls');
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===next));
  if(next==='loadout')selectPreset(draftPreset);
  syncOverlays();
}
function resetControls(){keys.clear();queuedGrenade=undefined;fire=false;ads=false;lastFire=false;lastFrag=false;lastFlash=false;localMeleeUntil=0;tabHeld=false;syncOverlays();}
function requestLock(){
  audio.unlock();
  if(!net.connected){toast('Reconnecting to the server…');return;}
  try{const result=$('game-canvas').requestPointerLock();if(result&&typeof result.catch==='function')result.catch(()=>toast('Mouse capture is unavailable here. Open this game in a desktop browser to play.'));}catch{toast('Mouse capture is unavailable here. Open this game in a desktop browser to play.');}
}
function syncOverlays(){
  const playing=phase==='playing';
  $('menu').classList.toggle('hidden',phase!=='menu'&&!matchLoadoutOpen);$('menu').classList.toggle('in-match-armory',matchLoadoutOpen);
  $('hud').classList.toggle('hidden',!playing);
  $('pause').classList.toggle('hidden',!playing||self?.hp===0||!!document.pointerLockElement||settingsOpen||matchLoadoutOpen);
  $('scoreboard').classList.toggle('hidden',matchLoadoutOpen||(phase!=='finished'&&!(playing&&tabHeld)));
  $('post-match').classList.toggle('hidden',phase!=='finished');
  $('scoreboard-title').textContent=phase==='finished'?'MATCH COMPLETE':'SCOREBOARD';
  if(phase==='finished'&&room){const host=room.host===net.id;$<HTMLButtonElement>('return-lobby').disabled=!host;$('return-lobby').innerHTML=host?'RETURN TO LOBBY <b>→</b>':'WAITING FOR HOST';}
}
function leaveRoom(){net.send({type:'leave'});}
function openSettings(){settingsOpen=true;if(document.pointerLockElement)document.exitPointerLock();$('settings').classList.remove('hidden');syncOverlays();}
function closeSettings(){captureBinding=undefined;paintBindings();resetControls();settingsOpen=false;$('settings').classList.add('hidden');syncOverlays();save();}
function paintActiveLoadout(){
  hudText('active-primary',WEAPONS[loadout.primary].shortName);hudText('active-secondary',`${WEAPONS[loadout.secondary].shortName} / KNIFE`);
  hudText('active-loadout-number',String(activePreset+1).padStart(2,'0'));
  const queued=!!self&&!sameLoadout(self.loadout,loadout);
  const status=queued?`NEXT SPAWN · ${WEAPONS[loadout.primary].shortName} / ${WEAPONS[loadout.secondary].shortName}`:'';
  hudText('pending-loadout',status);hudText('respawn-loadout-status',status);
}
function selectPreset(index:number){
  draftPreset=index;draftLoadout=draftPresets[index].weapons;
  $<HTMLInputElement>('loadout-name').value=draftPresets[index].name;
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(button=>{const i=Number(button.dataset.preset);button.classList.toggle('selected',i===index);button.setAttribute('aria-pressed',String(i===index));button.querySelector('strong')!.textContent=draftPresets[i].name;});
  $('loadout-timing').textContent=phase==='playing'?'Changes apply on your next respawn. The match keeps running.':'Choose your weapons. Your knife and grenades are always equipped.';
  $('save-loadout').innerHTML=phase==='playing'?'EQUIP NEXT SPAWN <span>→</span>':'EQUIP LOADOUT <span>→</span>';
  $('loadout-status').textContent='';
  paintLoadout(draftLoadout);view.preview(draftLoadout.primary,$<HTMLCanvasElement>('weapon-preview'));previewReady=true;
}
function selectWeapon(id:WeaponId){
  if(PRIMARY_WEAPONS.includes(id as PrimaryId))draftLoadout.primary=id as PrimaryId;
  else if(id!=='knife')draftLoadout.secondary=id as SecondaryId;
  paintLoadout(draftLoadout,id);view.preview(id,$<HTMLCanvasElement>('weapon-preview'));audio.click();
}
function closeLoadout(){
  matchLoadoutOpen=false;page='play';$('loadout-panel').classList.add('hidden');
  if(phase==='menu')showMenuPage('play');else syncOverlays();
}
function applyLoadout(){
  if(room&&!net.connected){$('loadout-status').textContent='Reconnecting. Wait for the connection before equipping.';return;}
  presets=draftPresets.map(p=>({name:p.name,weapons:{...p.weapons}}));activePreset=draftPreset;loadout={...draftLoadout};
  save();if(room)net.send({type:'loadout',loadout});paintActiveLoadout();closeLoadout();
  toast(phase==='playing'?`${presets[activePreset].name} queued for your next respawn.`:`${WEAPONS[loadout.primary].name} / ${WEAPONS[loadout.secondary].name} equipped.`);
}
function create(practice:boolean){if(!requireCallsign())return;if(!net.connected){toast('Connecting to the server…');return;}save();autoStart=practice;loading=true;net.send({type:'create',name:cleanCallsign(),loadout,bots:3,private:practice});if(practice)requestLock();}
function join(code:string){if(!requireCallsign())return;if(!code.trim()){toast('Enter a room code to join.');$<HTMLInputElement>('room-code').focus();return;}save();net.send({type:'join',code:code.trim().toUpperCase(),name:cleanCallsign(),loadout});}
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
document.querySelectorAll<HTMLElement>('[data-weapon]').forEach(b=>b.onclick=()=>selectWeapon(b.dataset.weapon as WeaponId));
$('save-loadout').onclick=applyLoadout;
$('close-loadout').onclick=closeLoadout;$('pause-loadout').onclick=()=>showMenuPage('loadout');$('respawn-loadout').onclick=()=>showMenuPage('loadout');
document.querySelectorAll<HTMLElement>('[data-preset]').forEach(button=>button.onclick=()=>selectPreset(Number(button.dataset.preset)));
$('loadout-name').addEventListener('input',()=>{draftPresets[draftPreset].name=$<HTMLInputElement>('loadout-name').value.trim().slice(0,24)||`Loadout ${draftPreset+1}`;document.querySelector(`[data-preset="${draftPreset}"] strong`)!.textContent=draftPresets[draftPreset].name;});
$('leave-lobby').onclick=leaveRoom;$('quit-match').onclick=leaveRoom;$('post-leave').onclick=leaveRoom;
$('start-match').onclick=()=>{net.send({type:'start'});requestLock();};
$('ready-button').onclick=()=>{const me=room?.players.find(p=>p.id===net.id);net.send({type:'ready',ready:!me?.ready});audio.click();};
$('return-lobby').onclick=()=>net.send({type:'return'});
['bot-count','score-limit','time-limit','map-select','mode-select'].forEach(id=>$(id).addEventListener('change',()=>{
  const mode=$<HTMLSelectElement>('mode-select').value as GameMode;
  net.send({type:'settings',bots:Math.min(Number($<HTMLSelectElement>('bot-count').value),MODES[mode].maxPlayers-(room?.players.length||1)),limit:id==='mode-select'?MODES[mode].defaultLimit:Number($<HTMLSelectElement>('score-limit').value),duration:Number($<HTMLSelectElement>('time-limit').value),map:$<HTMLSelectElement>('map-select').value as MapId,mode});
}));
$('copy-invite').onclick=async()=>{if(!room)return;const origin=(location.hostname==='localhost'||location.hostname==='127.0.0.1')&&lanUrl?lanUrl:location.origin;try{await navigator.clipboard.writeText(`${origin}/?room=${room.code}`);toast(`Invite copied. Room ${room.code}.`);}catch{toast(`Room code: ${room.code}. Join from another browser on this server.`);}};
$('resume').onclick=requestLock;$('game-canvas').onclick=()=>{if(phase==='playing'&&!document.pointerLockElement&&!settingsOpen&&!matchLoadoutOpen)requestLock();};
$('manual-settings').onclick=()=>{openSettings();$<HTMLDetailsElement>('keybind-settings').open=true;$('keybind-settings').scrollIntoView();};
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
refreshSettings();paintLoadout(loadout);paintActiveLoadout();
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode)$<HTMLInputElement>('room-code').value=inviteCode.toUpperCase();
fetch('/api/info').then(r=>r.json()).then(data=>{lanUrl=data.lanUrls?.find((url:string)=>!url.includes('192.168.64.'))||data.lanUrls?.[0]||'';}).catch(()=>{});

document.addEventListener('pointerlockchange',()=>{resetControls();syncOverlays();});
document.addEventListener('pointerlockerror',()=>{if(phase==='playing')syncOverlays();});
addEventListener('blur',resetControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetControls();});
for(const event of ['contextmenu','auxclick'])addEventListener(event,e=>{switch(phase==='playing'||settingsOpen){case true:e.preventDefault();}});
addEventListener('mousemove',e=>{if(!document.pointerLockElement||phase!=='playing'||self?.hp===0)return;const factor=.0021*view.sensitivity*(view.ads>.5?(slot===0&&self?.loadout.primary==='intervention'?.25:.72):1);yaw-=e.movementX*factor;pitch=THREE.MathUtils.clamp(pitch-e.movementY*factor,-1.45,1.45);});
$('keybind-list').innerHTML=ACTIONS.map(action=>`<div class="binding-row"><span>${CONTROLS[action].label}</span><button type="button" data-bind="${action}" aria-label="Change ${CONTROLS[action].label}"></button></div>`).join('');
function paintBindings(){
  document.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(button=>{
    const action=button.dataset.bind as Action;
    button.textContent=captureBinding===action?'Press a key or mouse button…':bindings[action].map(controlLabel).join(' / ');
    button.setAttribute('aria-pressed',String(captureBinding===action));
  });
  document.querySelectorAll<HTMLElement>('[data-control]').forEach(element=>{element.textContent=bindings[element.dataset.control as Action].map(controlLabel).join(' / ');});
}
$('keybind-list').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-bind]');
  switch(!!button){case false:return;}
  captureBinding=button!.dataset.bind as Action;paintBindings();
  button!.after($('binding-status'));button!.setAttribute('aria-describedby','binding-status');button!.focus({preventScroll:true});
  $('binding-status').textContent='Press a key or mouse button. Press Escape to cancel. Used controls must be changed first.';
});
$('reset-bindings').onclick=()=>{bindings=defaultBindings();captureBinding=undefined;resetControls();paintBindings();save();$('binding-status').textContent='Default controls restored.';};
function captureControl(event:KeyboardEvent|MouseEvent){
  switch(captureBinding){case undefined:return;}
  // UI buttons remain usable while waiting; clicking the active binding assigns LMB.
  const clicked=event instanceof MouseEvent&&event.button===0&&(event.target as HTMLElement).closest('button,summary,input,select');
  switch(!!clicked&&clicked!==document.querySelector(`[data-bind="${captureBinding}"]`)){
    case true:captureBinding=undefined;paintBindings();$('binding-status').textContent='No change made.';return;
  }
  event.preventDefault();event.stopImmediatePropagation();
  const code=normalizeCode(event instanceof KeyboardEvent?event.code:`Mouse${event.button}`);
  switch(code){case 'Escape':captureBinding=undefined;paintBindings();$('binding-status').textContent='No change made.';return;}
  const error=bindingError(bindings,captureBinding,code);
  switch(!!error){case true:$('binding-status').textContent=error;toast(error);return;}
  bindings[captureBinding]=[code];captureBinding=undefined;resetControls();paintBindings();save();
  $('binding-status').textContent='Control saved in this browser.';
}
addEventListener('keydown',captureControl,true);
// Capture the completed click so it cannot also start another binding edit.
addEventListener('click',captureControl,true);
addEventListener('auxclick',captureControl,true);
function pressControl(code:string,repeat=false){
  switch(phase!=='playing'||settingsOpen||matchLoadoutOpen){case true:return;}
  const action=actionForCode(bindings,code);
  if(repeat&&(action==='frag'||action==='flash'))return;
  switch(action){
    case 'scoreboard':keys.add(code);tabHeld=true;syncOverlays();return;
    case 'pause':document.pointerLockElement&&document.exitPointerLock();return;
  }
  switch(!document.pointerLockElement){case true:return;}
  keys.add(code);
  switch(action){case 'fire':fire=true;break;case 'aim':ads=true;break;}
  switch(repeat){case true:return;}
  if(action==='frag'||action==='flash')queuedGrenade=action;
  const slots:Partial<Record<Action,Slot>>={primary:0,secondary:1,knife:2,swap:slot===0?1:0};
  const next=action&&slots[action];
  switch(next){
    case undefined:break;
    default:slot=next;ads=false;fire=false;lastFire=false;localMeleeUntil=0;predictedReload=undefined;nextLocalShot=net.now()+.2;audio.click();
  }
  switch(action==='melee'&&!localMeleeUntil){
    case true:restoreSlot=slot;slot=2;ads=false;fire=false;lastFire=false;predictedReload=undefined;localMeleeUntil=net.now()+.7;nextLocalShot=net.now()+.2;
  }
}
function releaseControl(code:string){
  keys.delete(code);
  switch(actionForCode(bindings,code)){
    case 'fire':fire=held(bindings,keys,'fire');break;
    case 'aim':ads=held(bindings,keys,'aim');break;
    case 'scoreboard':tabHeld=held(bindings,keys,'scoreboard');syncOverlays();break;
  }
}
addEventListener('mousedown',event=>{switch(!!document.pointerLockElement){case true:event.preventDefault();audio.unlock();pressControl(`Mouse${event.button}`);}});
addEventListener('mouseup',event=>releaseControl(`Mouse${event.button}`));
addEventListener('keydown',event=>{
  if(matchLoadoutOpen){if(event.code==='Escape'){event.preventDefault();closeLoadout();}return;}
  switch(settingsOpen||phase!=='playing'||(event.target as HTMLElement).matches('input,select,textarea')){case true:return;}
  switch(!!actionForCode(bindings,event.code)){case true:event.preventDefault();}
  pressControl(event.code,event.repeat);
});
addEventListener('keyup',event=>releaseControl(event.code));
paintBindings();

net.onStatus=connected=>{
  $('connection').classList.toggle('online',connected);$('connection').innerHTML=`<i></i>${connected?'SERVER ONLINE':'RECONNECTING'}`;
  if(!connected&&room){resuming=true;pending=[];outgoing=[];predictedShots=[];predictedReload=undefined;resetControls();toast('Connection interrupted. Reconnecting to your operator…');}
};
net.onMessage=(message:ServerMessage)=>{
  if(message.type==='welcome'){
    if(message.resumed){resuming=true;toast('Reconnected. Your operator and score are preserved.');}
    else if(room&&resuming){room=undefined;phase='menu';matchLoadoutOpen=false;body=undefined;self=undefined;snapshot=undefined;pending=[];outgoing=[];history=[];seq=0;lastEvent=0;resuming=false;resetControls();if(document.pointerLockElement)document.exitPointerLock();showMenuPage('play');syncOverlays();toast('Your previous session expired. Join a lobby to play again.');}
    return;
  }
  if(message.type==='rooms'){paintRooms(message.rooms);return;}
  if(message.type==='error'){toast(message.message);loading=false;autoStart=false;if(phase==='menu'&&document.pointerLockElement)document.exitPointerLock();return;}
  if(message.type==='left'){room=undefined;phase='menu';matchLoadoutOpen=false;body=undefined;self=undefined;snapshot=undefined;pending=[];outgoing=[];history=[];seq=0;lastEvent=0;resetControls();settingsOpen=false;$('settings').classList.add('hidden');if(document.pointerLockElement)document.exitPointerLock();showMenuPage('play');syncOverlays();net.send({type:'list'});return;}
  if(message.type==='room'){
    const returningToLobby=phase!=='menu',joiningLobby=!room;
    room=message.room;loading=false;view.setMap(room.map);
    const desired=room.players.find(p=>p.id===net.id)?.loadout;if(desired){loadout={...desired};paintActiveLoadout();}
    $('hud-mode').textContent=MODES[room.mode].name.toUpperCase();$('minimap-name').textContent=getMap(room.map).name.toUpperCase();
    $('pause-match').textContent=$('scoreboard-match').textContent=`${getMap(room.map).name.toUpperCase()} / ${MODES[room.mode].name.toUpperCase()}`;
    if(room.state==='lobby'){
      if(phase!=='menu'){phase='menu';matchLoadoutOpen=false;body=undefined;self=undefined;snapshot=undefined;pending=[];outgoing=[];history=[];seq=0;lastEvent=0;resetControls();if(document.pointerLockElement)document.exitPointerLock();}
      paintLobby(room,net.id);if(returningToLobby||joiningLobby||page==='play')showMenuPage('play');syncOverlays();
      if(autoStart){autoStart=false;net.send({type:'start'});}
    }
    $('hud-limit').textContent=String(room.limit);$('scoreboard-room').textContent=`ROOM ${room.code}`;
    if(phase==='finished')syncOverlays();
    return;
  }
  if(message.type==='snapshot')receiveSnapshot(message);
};
function receiveSnapshot(next:Snapshot){
  if(!room||room.state==='lobby'||next.matchId!==room.matchId)return;
  if(snapshot&&next.time<snapshot.time)return;
  if(snapshot&&snapshot.matchId===next.matchId&&next.tick<=snapshot.tick&&!resuming)return;
  const arrival=performance.now()/1000;
  if(lastArrival&&next.matchId===snapshot?.matchId){const jitter=Math.abs((arrival-lastArrival)-(next.time-lastServerTime));arrivalJitter=arrivalJitter*.9+Math.min(.15,jitter)*.1;}
  lastArrival=arrival;lastServerTime=next.time;lastSnapshotReceived=performance.now();
  view.setMap(next.map);view.setObjectives(next.flags,net.id);
  const previous=self;const incoming=snapshotIndex(next).players.get(net.id);if(!incoming)return;
  const entering=phase==='menu'||resuming||snapshot?.matchId!==next.matchId;resuming=false;const respawned=!!previous&&previous.hp<=0&&incoming.hp>0;
  snapshot=next;self=incoming;paintActiveLoadout();view.setGrenades(next.grenades);
  predictedShots=predictedShots.filter(shot=>shot.seq>incoming.ack);
  if(predictedReload&&predictedReload.seq<=incoming.ack)predictedReload=undefined;
  if(entering){remoteTime=next.time-renderDelay;arrivalJitter=0;predictedShots=[];predictedReload=undefined;localThrowUntil=0;nextLocalGrenade=0;seq=Math.max(0,incoming.ack+1);pending=[];outgoing=[];history=[];lastEvent=0;feed=[];accumulator=0;slot=incoming.slot;yaw=incoming.body.yaw;pitch=incoming.body.pitch;nextLocalShot=incoming.nextFire;body={...incoming.body};view.eye=1.6;correction.set(0,0,0);}
  if(respawned){predictedShots=[];predictedReload=undefined;localThrowUntil=0;nextLocalGrenade=0;pending=[];outgoing=[];slot=incoming.slot;yaw=incoming.body.yaw;pitch=0;nextLocalShot=incoming.nextFire;correction.set(0,0,0);resetControls();}
  pending=pending.filter(input=>input.seq>incoming.ack);
  const before=body?{...body}:undefined;
  body={...incoming.body};
  if(incoming.hp>0&&pending.length){const map=activeMap(),index=collisionIndex(map);for(const input of pending)body=move(body,input,DT,map,index);}
  if(before&&!entering&&!respawned){const delta=new THREE.Vector3(before.x-body.x,before.y-body.y,before.z-body.z);correctionMagnitude=delta.length();if(delta.length()<1.5)correction.add(delta);else correction.set(0,0,0);}
  if(pending.length>120){pending=[];outgoing=[];body={...incoming.body};correction.set(0,0,0);}
  history.push(next);history=history.filter(s=>s.time>next.time-.7).slice(-18);
  if(previous&&incoming.hp<previous.hp){lastDamageTime=performance.now()/1000;audio.land();}
  if(incoming.reloading>net.now()&&(!previous||previous.reloading<=net.now())){reloadStarted=net.now();}
  for(const event of next.events){if(event.id>lastEvent){if(event.time>net.now()-1.5)handleEvent(event);lastEvent=event.id;}}
  phase=next.state==='finished'?'finished':'playing';
  if(phase==='finished'){matchLoadoutOpen=false;resetControls();if(document.pointerLockElement)document.exitPointerLock();updateScoreboard(next.players);const winner=[...next.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)[0];$('winner-text').textContent=next.mode!=='ffa'?(next.winner?`${next.winner.toUpperCase()} TEAM WINS · ${next.teamScores.red} — ${next.teamScores.blue}`:`DRAW · ${next.teamScores.red} — ${next.teamScores.blue}`):next.winner&&winner?`${winner.name} wins with ${winner.kills} eliminations.`:'Match drawn.';}
  if(entering||respawned||incoming.hp!==previous?.hp||phase==='finished')syncOverlays();
}
function handleEvent(e:GameEvent){
  const now=performance.now()/1000,index=snapshot?snapshotIndex(snapshot).players:undefined;const player=e.player?index?.get(e.player):undefined,target=e.target?index?.get(e.target):undefined;
  if(e.type==='shot'&&e.from&&e.to){
    if(e.player!==net.id&&body){const distance=Math.hypot(e.from.x-body.x,e.from.z-body.z);audio.shot(e.weapon||'ak47',distance,Math.sin(Math.atan2(e.from.x-body.x,e.from.z-body.z)-yaw));view.tracer(e.from,e.to,now);}
    // Local shot audio and muzzle kick were already predicted with the input.
  }
  if(e.type.startsWith('flag_')){
    const action=e.type==='flag_pickup'?'took':e.type==='flag_drop'?'dropped':e.type==='flag_capture'?'captured':'returned';
    const label=e.type==='flag_capture'?`${player?.name||'A player'} captured for ${e.team?.toUpperCase()} TEAM`:`${player?.name||e.team?.toUpperCase()||'A player'} ${action} the ${e.team||''} flag`;
    feed.push({text:escapeHTML(label),until:now+6});feed=feed.slice(-5);
    if(e.player===net.id){toast(e.type==='flag_pickup'?'Flag secured. Bring it to your base.':e.type==='flag_capture'?'Flag captured!':label);audio.hit(e.type==='flag_capture');}
  }
  if(e.type==='grenade_explode'&&e.from&&e.grenade){view.explode(e.from,e.grenade,now);audio.explosion(e.grenade,body?Math.hypot(e.from.x-body.x,e.from.y-body.y,e.from.z-body.z):0);}
  if(e.type==='grenade_throw'&&e.player===net.id)audio.throwGrenade();
  if(e.type==='flash'&&e.target===net.id)audio.flash(e.strength||0);
  if(e.type==='hit'&&e.player===net.id&&e.target!==net.id){hitUntil=now+.16;$('hitmarker').classList.remove('kill');audio.hit();}
  if(e.type==='kill'){
    const killer=player?.name||'Operator',victim=target?.name||'Operator';
    feed.push({text:`<span class="${e.player===net.id?'feed-you':''}">${escapeHTML(killer)}</span><span class="feed-gun">${e.grenade==='frag'?'FRAG':WEAPONS[e.weapon||'knife'].shortName}${e.headshot?' ⊕':''}</span><b class="${e.target===net.id?'feed-you':''}">${escapeHTML(victim)}</b>`,until:now+5});feed=feed.slice(-5);
    if(e.player===net.id&&e.target!==net.id){hitUntil=now+.25;$('hitmarker').classList.add('kill');audio.hit(true);noticeUntil=now+2;$('kill-notice').querySelector('strong')!.textContent=e.quickscope?'QUICKSCOPE +100':e.headshot?'HEADSHOT +100':'ELIMINATION +100';$('kill-notice').querySelector('span')!.textContent=target?.name||'OPERATOR';}
    if(e.target===net.id)$('killer-name').textContent=`Eliminated by ${killer} · ${e.grenade==='frag'?'Frag grenade':WEAPONS[e.weapon||'knife'].name}`;
  }
}
function fixedStep(map:MapDefinition,index:CollisionIndex|undefined){
  if(phase!=='playing'||!self||!body||!net.connected||resuming)return;
  const active=!!document.pointerLockElement&&self.hp>0&&!settingsOpen&&!matchLoadoutOpen;
  const now=net.now();
  const melee=localMeleeUntil>now;
  if(localMeleeUntil&&now>=localMeleeUntil){slot=restoreSlot;localMeleeUntil=0;}
  const firing=active&&(fire||(melee&&now>=localMeleeUntil-.43));
  const aiming=active&&ads&&slot!==2&&reloadUntil()<=now&&throwUntil()<=now&&!body.vault&&body.stance!=='slide';
  const sprint=active&&held(bindings,keys,'sprint')&&!firing&&!aiming;
  const input:Input={seq:seq++,yaw,pitch,forward:active?Number(held(bindings,keys,'forward'))-Number(held(bindings,keys,'backward')):0,right:active?Number(held(bindings,keys,'right'))-Number(held(bindings,keys,'left')):0,jump:active&&held(bindings,keys,'jump'),sprint,crouch:active&&held(bindings,keys,'crouch'),ads:aiming,fire:firing,reload:active&&held(bindings,keys,'reload'),frag:active&&(queuedGrenade==='frag'||held(bindings,keys,'frag')),flash:active&&(queuedGrenade==='flash'||held(bindings,keys,'flash')),slot,time:now,viewTime:renderTime(),matchId:snapshot?.matchId};
  queuedGrenade=undefined;
  if(self.hp>0){body=move(body,input,DT,map,index);pending.push(input);if(pending.length>120){pending=pending.slice(-120);}}
  if(body.vault)predictedReload=undefined;
  outgoing.push(input);
  if(outgoing.length>=2){net.send({type:'inputs',inputs:outgoing});outgoing=[];}
  const grenade=input.frag&&!lastFrag?'frag':input.flash&&!lastFlash?'flash':undefined;
  if(grenade&&!body.vault&&self.grenades[grenade]>0&&now>=Math.max(self.nextGrenade,nextLocalGrenade)){localThrowUntil=now+.45;nextLocalGrenade=now+.65;view.throwGrenade();nextLocalShot=Math.max(nextLocalShot,localThrowUntil);predictedReload=undefined;}
  lastFrag=!!input.frag;lastFlash=!!input.flash;
  const id=weaponForSlot(self.loadout,slot),weapon=WEAPONS[id];
  if(input.reload&&!body.vault&&throwUntil()<=now&&reloadUntil()<=now&&id!=='knife'&&availableAmmo(slot)<weapon.mag&&self.reserve[slot]>0){predictedReload={seq:input.seq,until:now+weapon.reloadTime};}
  if(firing&&!body.vault&&throwUntil()<=now&&(weapon.automatic||!lastFire)&&now>=nextLocalShot&&reloadUntil()<=now&&(id==='knife'||availableAmmo(slot)>0)){
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
  return snapshot?interpolatePlayers(snapshot,history,renderTime(),net.id):[];
}
function drawMinimap(){
  if(!body||!snapshot)return;
  const map=activeMap(),MAP_SIZE=map.size,ctx=minimapContext,s=176/MAP_SIZE;
  if(minimapMap!==map){
    const background=minimapBackground.getContext('2d')!;background.clearRect(0,0,176,176);background.fillStyle='#08110de8';background.fillRect(0,0,176,176);
    if(map.outline){background.beginPath();map.outline.forEach((point,index)=>{const x=(point.x+MAP_SIZE/2)*s,z=(point.z+MAP_SIZE/2)*s;if(index===0)background.moveTo(x,z);else background.lineTo(x,z);});background.closePath();background.fillStyle='#243328';background.fill();background.strokeStyle='#aec39780';background.stroke();}
    background.strokeStyle='#8ea57916';background.lineWidth=1;for(let i=0;i<176;i+=22){background.beginPath();background.moveTo(i,0);background.lineTo(i,176);background.moveTo(0,i);background.lineTo(176,i);background.stroke();}
    for(const box of map.boxes){background.fillStyle=box.y>3?'#66755490':'#83936b85';background.fillRect((box.x-box.w/2+MAP_SIZE/2)*s,(box.z-box.d/2+MAP_SIZE/2)*s,Math.max(1,box.w*s),Math.max(1,box.d*s));}
    minimapMap=map;
  }
  ctx.clearRect(0,0,176,176);ctx.drawImage(minimapBackground,0,0);
  const shooters=snapshotIndex(snapshot).shooters;
  for(const p of snapshot.players){if(p.id===net.id||p.hp<=0)continue;const friendly=!!self?.team&&p.team===self.team;if(!shooters.has(p.id)&&!friendly)continue;ctx.fillStyle=friendly?'#7bc9ff':'#ed825b';ctx.beginPath();ctx.arc((p.body.x+MAP_SIZE/2)*s,(p.body.z+MAP_SIZE/2)*s,2.5,0,Math.PI*2);ctx.fill();}
  for(const f of snapshot.flags){ctx.fillStyle=f.team==='red'?'#ff947c':'#7bc9ff';const x=(f.position.x+MAP_SIZE/2)*s,z=(f.position.z+MAP_SIZE/2)*s;ctx.fillRect(x-3,z-3,6,6);ctx.strokeStyle='#fff';ctx.strokeRect(x-3,z-3,6,6);}
  ctx.save();ctx.translate((body.x+MAP_SIZE/2)*s,(body.z+MAP_SIZE/2)*s);ctx.rotate(-yaw);ctx.fillStyle='#d0f778';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3.5,4);ctx.lineTo(0,2);ctx.lineTo(-3.5,4);ctx.closePath();ctx.fill();ctx.restore();
}
function updateHUD(time:number){
  if(!self||!body||!snapshot)return;
  const weapon=WEAPONS[weaponForSlot(self.loadout,slot)],now=net.now(),ammo=availableAmmo(slot),speed=Math.hypot(body.vx,body.vz);
  hudClass('team-score','hidden',snapshot.mode==='ffa');
  if(snapshot.mode!=='ffa')hudHTML('team-score',`<span class="red"><small>RED${self.team==='red'?' · YOU':''}</small>${snapshot.teamScores.red}</span><span class="blue"><small>BLUE${self.team==='blue'?' · YOU':''}</small>${snapshot.teamScores.blue}</span>`);
  hudClass('objective-hud','hidden',snapshot.mode!=='ctf');
  if(snapshot.mode==='ctf'){const players=snapshotIndex(snapshot).players;hudHTML('objective-hud',snapshot.flags.map(f=>{const carrier=f.carrier?players.get(f.carrier):undefined;const state=f.carrier===net.id?'YOU HAVE THE FLAG':carrier?`CARRIED BY ${escapeHTML(carrier.name)}`:f.returnAt>0?`DROPPED · ${Math.ceil(Math.max(0,f.returnAt-now))}s`:'AT BASE';return `<span class="${f.team} ${f.carrier===net.id?'carrying':''}"><strong>${f.team.toUpperCase()} FLAG</strong>${state}</span>`;}).join(''));}
  hudText('match-timer',timer(snapshot.endsAt-now));hudText('hud-ping',`${Math.round(net.rtt)} MS`);hudText('hud-fps',`${Math.round(fps)} FPS`);
  hudText('health',String(self.hp));hudStyle('health-bar','width',`${self.hp}%`);hudStyle('health-bar','background',self.hp<35?'#ee9476':'#d0f778');
  hudText('hud-name',self.name);hudText('personal-score',`${self.kills} K / ${self.deaths} D`);
  hudText('stance',self.hp<=0?'KIA':body.vault?'VAULTING':!body.grounded?'AIRBORNE':body.stance==='slide'?'SLIDING':body.stance==='crouch'?'CROUCHED':speed>7?'SPRINTING':self.protectedUntil>now?'PROTECTED':'READY');
  hudText('hud-secondary',WEAPONS[self.loadout.secondary].shortName);hudText('frag-count',String(self.grenades.frag));hudText('flash-count',String(self.grenades.flash));
  hudText('hud-weapon',weapon.shortName);hudText('ammo',weapon.id==='knife'?'∞':String(ammo).padStart(2,'0'));hudText('reserve',String(self.reserve[slot]));
  hudStyle('ammo','color',weapon.id!=='knife'&&ammo<=Math.ceil(weapon.mag*.2)?'#efb680':'');
  for(let i=0;i<3;i++)hudClass(`slot-${i}`,'selected',slot===i);
  hudStyle('crosshair','--gap',`${7+(held(bindings,keys,'sprint')?5:0)+(speed>1?4:0)+view.kick*90}px`);
  const interrupted=performance.now()-lastSnapshotReceived>1800;
  hudText('action-notice',interrupted?'CONNECTION INTERRUPTED':body.vault?'VAULTING':throwUntil()>now?'THROWING':reloadUntil()>now?'RELOADING':weapon.id==='intervention'&&nextLocalShot>now+.2&&now-self.nextFire<1?'CYCLING BOLT':ammo===0?`PRESS ${bindings.reload.map(controlLabel).join(' / ')} TO RELOAD`:'');
  hudStyle('kill-notice','opacity',time<noticeUntil?'1':'0');
  const hurt=Math.max(0,1-(time-lastDamageTime)*1.3);hudStyle('damage-vignette','opacity',String(Math.max(self.hp>0?(100-self.hp)/160:0,hurt*.8)));
  feed=feed.filter(f=>f.until>time);hudHTML('killfeed',feed.map(f=>`<div class="feed-line">${f.text}</div>`).join(''));
  hudClass('respawn','hidden',self.hp>0);if(self.hp<=0)hudText('respawn-count',String(Math.max(1,Math.ceil(self.respawnAt-now))));
  if(tabHeld||phase==='finished')updateScoreboard(snapshot.players);
  drawMinimap();
}
function animate(ms:number){
  const time=ms/1000,dt=Math.min(.1,time-previousTime);previousTime=time;
  fps=THREE.MathUtils.lerp(fps,1/Math.max(.001,dt),.035);
  renderDelay=THREE.MathUtils.damp(renderDelay,Math.min(.32,Math.max(.1,Math.max(net.rtt,net.latency)/2000+.065+arrivalJitter*2)),5,dt);
  remoteTime=Math.max(remoteTime,net.now()-renderDelay);
  accumulator+=dt;
  const movementMap=activeMap(),movementIndex=accumulator>=DT&&phase==='playing'&&self&&self.hp>0&&body&&net.connected&&!resuming?collisionIndex(movementMap):undefined;
  let steps=0;while(accumulator>=DT&&steps<6){fixedStep(movementMap,movementIndex);accumulator-=DT;steps++;}
  correction.multiplyScalar(Math.exp(-dt*20));
  const current=weaponForSlot(self?.loadout||loadout,slot);view.setWeapon(current);
  const now=net.now();const aiming=ads&&slot!==2&&!!document.pointerLockElement&&self?.hp!==0&&!!self&&reloadUntil()<=now&&throwUntil()<=now&&!body?.vault&&body?.stance!=='slide';
  const sprint=!!body&&Math.hypot(body.vx,body.vz)>7&&body.stance==='stand'&&!aiming;
  const reloading=phase==='playing'&&self&&self.hp>0&&slot===self.slot&&!body?.vault&&throwUntil()<=now&&net.connected&&!resuming&&reloadUntil()>now;
  const reloadProgress=reloading?THREE.MathUtils.clamp(1-(reloadUntil()-now)/WEAPONS[current].reloadTime,0,1):0;
  audio.updateReload(current,reloadProgress);
  view.draw(time,dt,body,yaw,pitch,phase!=='menu',aiming,sprint,reloadProgress,!!self&&self.hp>0,interpolatedPlayers(),net.id,correction,(phase==='menu'||matchLoadoutOpen)&&page==='loadout'&&previewReady);
  hudClass('scope','hidden',!(current==='intervention'&&view.ads>=.999&&self&&self.hp>0));
  hudStyle('crosshair','opacity',!self||self.hp<=0?'0':String(1-view.ads));
  hudStyle('flash-overlay','opacity',String(phase==='playing'&&self&&self.hp>0?Math.min(.98,Math.max(0,self.flashUntil-now)/1.4)*self.flashStrength:0));
  hudStyle('hitmarker','opacity',time<hitUntil?'1':'0');
  if(time-hudTime>(view.quality==='low'?.14:.08)){hudTime=time;updateHUD(time);}
  requestAnimationFrame(animate);
}
net.connect();
setInterval(()=>{if(phase==='menu'&&!room)net.send({type:'list'});},5000);
$('loading').classList.add('hidden');
showMenuPage('play');syncOverlays();requestAnimationFrame(animate);
// Read-only diagnostics for the included browser tests and local troubleshooting.
Object.defineProperty(window,'__dustline',{value:{get state(){return{phase,room,loadout,activePreset,presets,matchLoadoutOpen,quality:view.quality,pixelRatio:view.renderer.getPixelRatio(),grenades:snapshot?.grenades,body,self,pending:pending.length,seq,correction:correctionMagnitude,rtt:net.rtt,ads:view.ads,slot,yaw,pitch,fps,connected:net.connected,locked:!!document.pointerLockElement,snapshotTime:snapshot?.time,matchId:snapshot?.matchId,map:snapshot?.map,mode:snapshot?.mode,teamScores:snapshot?.teamScores,flags:snapshot?.flags,arrivalJitter,latency:net.latency,renderDelay,predictedAmmo:availableAmmo(slot),renderCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};}}});
