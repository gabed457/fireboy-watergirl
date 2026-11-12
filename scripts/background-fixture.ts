import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {Controller} from '../src/main/controller';
import {keyboardScript} from '../src/main/keyboard-driver';
app.setActivationPolicy('prohibited');
app.setPath('userData',path.join(os.tmpdir(),'watergirl-background-fixture-'+process.pid));
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{let c:Controller|undefined,w:BrowserWindow|undefined;try{
 c=new Controller(await fs.mkdtemp(path.join(os.tmpdir(),'watergirl-bg-fixture-')));await c.init();
 w=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{sandbox:true,backgroundThrottling:false}});
 c.game.attach(w,()=>{});c.game.layout({x:0,y:0,width:700,height:600});
 await c.game.contents!.loadURL('data:text/html,<script>window.x=0;window.events=[];document.addEventListener("keydown",e=>{events.push({key:e.key,type:e.type});if(e.key==="d")x+=10});document.addEventListener("keyup",e=>events.push({key:e.key,type:e.type}));</script>');
 const f=c.game.contents!.mainFrame;c.game.frame=f;c.game.surface={frameUrl:f.url,processId:f.processId,routingId:f.routingId};c.game.token='fixture';c.game.calibrated=true;c.game.state.roomVerified=true;c.game.state.controlsVerified=true;
 // The fixture has its own URL; the production identity check is covered separately.
 c.game.validate=async()=>!f.isDestroyed();
 c.game.readState=async()=>({state:{method:'fixture',watergirl:{x:await f.executeJavaScript('window.x')},fireboy:{x:33},objects:[]},sha256:'fixture'});
 c.codex.state.authenticated=true;c.codex.state.models=[{model:'fixture'}];c.store.settings.model='fixture';
 c.codex.startThread=async()=>({thread:{id:'fixture-thread'},model:'fixture',reasoningEffort:'low'} as any);c.codex.turn=async()=>{c!.codex.turnId='fixture-turn';};c.codex.interrupt=async()=>{};
 await c.start('hidden infrastructure fixture');assert.equal(c.active.status,'running');assert.equal(w.isVisible(),false);assert.equal(w.isFocused(),false);assert.equal(await f.executeJavaScript('document.hasFocus()'),false);
 w.emit('blur');c.game.contents!.emit('blur');assert.equal(c.active.status,'running');
 for(let n=0;n<2;n++){const prior=c.active.observations.at(-1);const result=await c.codex.onTool!({threadId:'fixture-thread',turnId:'fixture-turn',tool:'watergirl_act',arguments:{attemptId:c.active.id,runGeneration:c.active.runGeneration,actionId:'bg-'+n,observationId:prior.id,action:'right',durationMs:50}});const data=JSON.parse(result.contentItems[0].text);assert.equal(data.result.accepted,true);assert.equal(data.observation.state.watergirl.x,(n+1)*10);assert.notEqual(data.observation.id,prior.id);assert.equal(data.observation.state.fireboy.x,33);assert.equal(result.contentItems.every((v:any)=>v.type==='inputText'),true);}
 await f.executeJavaScript(keyboardScript('W','keyDown'));await f.executeJavaScript('window.dispatchEvent(new Event("blur"))');await sleep(1100);
 const events=await f.executeJavaScript('window.events');assert.equal(events.filter((e:any)=>e.key==='w'&&e.type==='keyup').length,1);assert.equal(w.isFocused(),false);assert.equal(w.isVisible(),false);
 await c.pause();assert.deepEqual(c.broker.ownedKeys,[]);assert.equal(c.active.status,'paused');await c.resume();assert.equal(c.active.status,'running');assert.equal(w.isFocused(),false);c.game.readState=async()=>{throw Error('Missing terrain fixture');};await assert.rejects(()=>c!.observe(true),/Missing terrain fixture/);assert.equal(c.active.status,'paused');assert.deepEqual(c.broker.ownedKeys,[]);await c.stop();
 const result={passed:true,hidden:true,focused:false,checks:['hidden background action dispatch','blur does not pause AI','two short sequential actions each return new coordinates','JSON-only model response','renderer lease releases without focus','explicit pause and resume preserve no-focus operation','missing geometry pauses the controller and releases input'],events};await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/background-fixture-v0.5.0.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await c.shutdown();w.close();app.exit(0);
 }catch(e){console.error(e);await c?.shutdown();w?.close();app.exit(1);}});
