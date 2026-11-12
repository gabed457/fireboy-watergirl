import {BrowserWindow, WebContentsView, type WebFrameMain, type Rectangle} from 'electron';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import type {InputTarget,OwnedKey} from '../core/broker';
import {keyboardScript} from './keyboard-driver';
import {READ_STATE,identifyState} from '../core/structured';
export const HOST='https://www.coolmathgames.com/0-fireboy-and-water-girl-in-the-forest-temple';
export const BUILD=HOST+'/play';
const GEOMETRY=`(()=>{const e=document.querySelector('iframe#html5game');if(!e||e.src.split('?')[0]!==${JSON.stringify(BUILD)})return null;const r=e.getBoundingClientRect();const points=[[r.x+r.width/2,r.y+r.height/2],[r.x+5,r.y+5],[r.right-5,r.bottom-5]];return {rect:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)},visible:r.width>300&&r.height>200&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&points.every(([x,y])=>document.elementFromPoint(x,y)===e),focused:document.activeElement===e,dpr:devicePixelRatio,window:{width:innerWidth,height:innerHeight}}})()`;
const CANVAS=`(()=>{const c=document.querySelector('canvas');const a=document.activeElement;return {assets:Array.from(document.scripts).map(s=>s.src).filter(s=>s.includes('/public_games/')),canvas:!!c,focus:document.hasFocus(),editable:!!a&&(a.matches('input,textarea,select')||a.isContentEditable),size:c?{width:c.width,height:c.height}:null}})()`;
async function timeout<T>(p:Promise<T>,ms=1500):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([p,new Promise<T>((_,r)=>{timer=setTimeout(()=>r(Error('Game surface query timed out.')),ms);})]);}finally{clearTimeout(timer!);}}
const normalized=(url:string)=>url.split('#')[0].split('?')[0];
const roundRect=(r:Rectangle):Rectangle=>({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});

/** The remote publisher page lives in a sandboxed native child of the ONE app window.
 * Native UI views mask the outside of its viewport for filming; the publisher DOM,
 * game engine, advertisements and launch flow are never modified. */
export class GameAdapter extends EventEmitter implements InputTarget{
 window?:BrowserWindow; view?:WebContentsView; frame?:WebFrameMain; surface:any; token='';active=false;calibrated=false;
 private monitor?:ReturnType<typeof setInterval>;private checking=false;private opened=false;private muted=true;
 private stage:Rectangle={x:0,y:76,width:960,height:650};private zoom=1;private crop?:Rectangle;private relayout?:()=>void;
 state:any={status:'Open the game to begin',source:HOST,build:BUILD,room:'Forest Temple · level',controlsVerified:false,roomVerified:false,opened:false,mode:'page',manualInput:'Physical A/W/D is blocked. Your arrow keys go directly to the game.',driver:'Frame-scoped A/W/D only; independent 1000 ms renderer lease'};
 get contents(){return this.view?.webContents;}
 attach(window:BrowserWindow,relayout:()=>void){
  this.window=window;this.relayout=relayout;
  const v=new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,partition:'persist:forest-temple'}});this.view=v;window.contentView.addChildView(v);v.setBackgroundColor('#080e15');
  const wc=v.webContents;wc.setAudioMuted(this.muted);wc.setWindowOpenHandler(()=>({action:'deny'}));wc.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));wc.session.setPermissionCheckHandler(()=>false);
  window.on('resize',()=>this.invalidate('Window size changed. Click Confirm level to refresh the viewport.'));
  window.on('enter-full-screen',()=>this.invalidate('Fullscreen changed. Click Confirm level.'));
  window.on('leave-full-screen',()=>this.invalidate('Fullscreen changed. Click Confirm level.'));
  wc.on('did-start-navigation',(_e,_url,_inPlace,isMain,pid,rid)=>{if(isMain||this.frame&&pid===this.frame.processId&&rid===this.frame.routingId)this.invalidate('Game loaded or changed. Open a level, then click Confirm level.');});
  wc.on('render-process-gone',()=>this.invalidate('The game renderer stopped. Reopen the game.'));wc.on('destroyed',()=>this.invalidate('Game closed'));
  wc.on('before-input-event',(event,input)=>{const key=input.key.toUpperCase();if(['A','W','D'].includes(key)){event.preventDefault();if(this.active)this.emit('manual-blocked',{key,type:input.type,at:Date.now()});}});
  // Clicking an already-running game must not silently kill the first model turn.
  // Swallow menu clicks during a run. The visible Pause AI button unlocks menus.
  wc.on('before-mouse-event',(event,input)=>{if(this.active&&['mouseDown','mouseUp','mouseWheel'].includes(input.type)){event.preventDefault();if(input.type==='mouseDown')this.emit('click-blocked',{at:Date.now(),reason:'Game click ignored while AI runs. Pause AI before using game menus.'});}});
  wc.on('did-finish-load',()=>{this.relayout?.();this.state.topURL=wc.getURL();this.state.status='Click Play and select an unlocked level. Then Confirm level.';this.emit('change');});
  this.monitor=setInterval(()=>{if(this.active&&!this.checking){this.checking=true;void this.validate().then(ok=>{if(!ok&&this.active)this.invalidate('Game surface changed. Confirm level before resuming.');}).catch(()=>this.invalidate('Game surface unavailable. Confirm level before resuming.')).finally(()=>{this.checking=false;});}},150);this.monitor.unref();
 }
 open(){if(!this.contents||!this.window)throw Error('The game view is not attached.');if(this.opened){return;}this.opened=true;this.state.opened=true;this.state.status='Loading the official Coolmath page…';this.emit('change');void this.contents.loadURL(HOST).catch(e=>{this.state.status='Host loading error: '+e.message;this.emit('change');});}
 layout(stage:Rectangle):Rectangle{
  this.stage=roundRect(stage);if(!this.view)return stage;
  const source=this.crop??{x:0,y:0,width:1280,height:900};
  const z=Math.max(0.35,Math.floor(Math.min(stage.width/source.width,stage.height/source.height)*20)/20);this.zoom=z;
  const visible=roundRect({x:this.crop?stage.x:stage.x+(stage.width-source.width*z)/2,y:this.crop?stage.y:stage.y+(stage.height-source.height*z)/2,width:source.width*z,height:source.height*z});
  this.view.setBounds(roundRect({x:visible.x-source.x*z,y:visible.y-source.y*z,width:1280*z,height:900*z}));
  if(Math.abs(this.contents!.getZoomFactor()-z)>0.0001)this.contents!.setZoomFactor(z);this.state.display={stage:this.stage,visible,zoom:z};return visible;
 }
 showPage(){this.invalidate('Full publisher page shown. Finish its Play flow, then Confirm level.');this.crop=undefined;this.state.mode='page';this.relayout?.();this.emit('change');}
 private suspend(reason:string){this.active=false;this.state.status=reason;this.emit('invalidated',reason);this.emit('change');}
 invalidate(reason:string){this.active=false;this.calibrated=false;this.state.roomVerified=false;this.state.status=reason;this.emit('invalidated',reason);this.emit('change');}
 identity(){return this.token;}
 // Query the committed frame directly: webContents.executeJavaScript waits for
 // every page resource to finish, including unrelated hanging publisher embeds.
 private async settledGeometry(){
  const wc=this.contents!;let previous='',stable=0,last:any;
  for(let n=0;n<35;n++){
   await new Promise(r=>setTimeout(r,100));
   const g:any=await timeout(wc.mainFrame.executeJavaScript(GEOMETRY));last=g;
   const fingerprint=JSON.stringify(g&&{rect:g.rect,window:g.window,dpr:g.dpr});
   if(g?.visible&&Math.abs(g.window.width-1280)<=1&&Math.abs(g.window.height-900)<=1&&fingerprint===previous)stable++;else stable=0;
   previous=fingerprint;if(stable>=4)return g;
  }
  throw Error('The publisher layout has not settled. Wait for its Play screen, then Confirm level. '+JSON.stringify(last&&{visible:last.visible,window:last.window}));
 }
 async calibrate(){
  const wc=this.contents;if(!wc||wc.isDestroyed()||!this.opened)throw Error('Open the game first.');
  this.calibrated=false;this.state.roomVerified=false;
  if(normalized(wc.getURL())!==HOST)throw Error('Unexpected publisher page. Reopen the official game.');
  const f=wc.mainFrame.framesInSubtree.find(f=>normalized(f.url)===BUILD);if(!f)throw Error('Finish the publisher’s normal Play / advertisement flow first.');
  // Visible presentation fitting is optional; hidden state reads need no viewport.
  if(!this.window?.isVisible()||process.env.WATERGIRL_BACKGROUND_TEST==='1'){
   const c:any=await timeout(f.executeJavaScript(CANVAS));if(!c.canvas)throw Error('The game has not loaded.');
   this.frame=f;this.surface={frameUrl:f.url,processId:f.processId,routingId:f.routingId,buildAssets:c.assets,presentation:'background structured state'};this.token=randomUUID();this.calibrated=true;this.state.controlsVerified=process.versions.electron==='45.2.3'&&c.assets.includes('https://www.coolmathgames.com/sites/default/files/public_games/55667/js/loader.js');return this.surface;
  }
  // Always establish the same CSS viewport before measuring. Quantized native zoom
  // keeps both 1280*z and 900*z integral, avoiding responsive-layout feedback.
  this.crop=undefined;this.state.mode='page';this.relayout?.();
  let g=await this.settledGeometry();let c:any=await timeout(f.executeJavaScript(CANVAS));
  if(!c.canvas||c.editable)throw Error('The playable canvas is not ready. Finish the normal game launch first.');
  this.crop=g.rect;this.state.mode='game';this.relayout?.();
  g=await this.settledGeometry();c=await timeout(f.executeJavaScript(CANVAS));
  if(JSON.stringify(this.crop)!==JSON.stringify(g.rect))throw Error('Publisher layout changed during fitting. Confirm level again.');
  this.frame=f;this.surface={...g,zoom:this.zoom,canvas:c.size,buildAssets:c.assets,frameUrl:f.url,processId:f.processId,routingId:f.routingId,presentation:'single-window native viewport crop'};
  this.token=randomUUID();this.calibrated=true;this.state.controlsVerified=process.versions.electron==='45.2.3'&&c.assets.includes('https://www.coolmathgames.com/sites/default/files/public_games/55667/js/loader.js');
  this.state.calibration='A/W/D observed; 50–1000 ms pulses; renderer lease 1000 ms';this.state.surface=this.surface;this.state.status='Level data read. Ready for operator confirmation.';this.emit('change');return this.surface;
 }
 private sameSurface(c:any){const f=this.frame;return !!c?.canvas&&!c.editable&&!!f&&!f.isDestroyed()&&f.url===this.surface?.frameUrl&&f.processId===this.surface.processId&&f.routingId===this.surface.routingId&&JSON.stringify(c.assets)===JSON.stringify(this.surface.buildAssets);}
 async validate(){const wc=this.contents,f=this.frame;if(!this.window||this.window.isDestroyed()||!wc||wc.isDestroyed()||!f||f.isDestroyed()||!this.calibrated||normalized(wc.getURL())!==HOST)return false;const c:any=await timeout(f.executeJavaScript(CANVAS));return this.sameSurface(c);}
 async focus(){if(!this.window?.isFocused())return;const wc=this.contents;if(!wc||wc.isDestroyed())return;wc.focus();if(this.calibrated){await timeout(wc.mainFrame.executeJavaScript(`(()=>{const e=document.querySelector('iframe#html5game');if(e&&e.src.split('?')[0]===${JSON.stringify(BUILD)})e.focus({preventScroll:true});})()`));}}
 async send(key:OwnedKey,type:'keyDown'|'keyUp'){
  if(!['A','W','D'].includes(key))throw Error('Driver key outside allowlist');const wc=this.contents,f=this.frame;if(!wc||wc.isDestroyed()||!f||f.isDestroyed())return;
  if(f.url!==this.surface?.frameUrl||f.processId!==this.surface.processId||f.routingId!==this.surface.routingId){if(type==='keyDown')throw Error('Game frame replaced');return;}
  if(type==='keyDown'&&(!this.active||!this.calibrated))throw Error('Input target not active');await timeout(f.executeJavaScript(keyboardScript(key,type)),1000);
 }
 async readState(){const wc=this.contents,f=this.frame;if(!wc||!f||!this.calibrated)throw Error('Confirm level first.');const token=this.token;const c:any=await timeout(f.executeJavaScript(CANVAS));if(!this.sameSurface(c))throw Error('The game surface changed. Confirm level again.');const state=identifyState(await timeout(f.executeJavaScript(READ_STATE),4000));if(token!==this.token||!this.calibrated)throw Error('Target changed during observation');this.state.structured=state;this.state.room='Forest Temple · level '+state.level;return{state,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex')};}

 setActive(v:boolean){this.active=v;if(v){this.state.status='AI is running. Your arrows control Fireboy.';this.emit('change');}}
 retry(){this.active=false;this.state.roomVerified=false;this.state.status='Click Retry Level in the game. If needed, open its green pause button first. After reset, Confirm level.';this.emit('change');}
 mute(v:boolean){this.muted=v;this.contents?.setAudioMuted(v);}
 close(){clearInterval(this.monitor);this.active=false;if(this.contents&&!this.contents.isDestroyed())this.contents.close();}
}
