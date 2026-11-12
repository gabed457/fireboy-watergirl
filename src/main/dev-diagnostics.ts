import {app,BrowserWindow,type WebContentsView} from 'electron';
import fs from 'node:fs/promises';import path from 'node:path';import readline from 'node:readline';import type {Controller} from './controller';import {InputBroker} from '../core/broker';
/** Builder-only stdin, installed ONLY in an unpackaged diagnostic process. Never a player tool. */
export function installDiagnostics(c:Controller,panel:BrowserWindow,views:Record<string,WebContentsView>,layout:()=>void){
 readline.createInterface({input:process.stdin}).on('line',async line=>{try{const q=JSON.parse(line);let result:any;
 if(q.cmd==='open'){c.game.open();result='opened';}
 else if(q.cmd==='focus'){result={window:panel.isFocused(),game:c.game.contents?.isFocused()};}
 else if(q.cmd==='menu'||q.cmd==='active-click'){if(q.cmd==='menu'&&c.game.active)throw Error('Stop before menu navigation');const wc=c.game.contents!;wc.sendInputEvent({type:'mouseDown',x:q.x,y:q.y,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',x:q.x,y:q.y,button:'left',clickCount:1});result='clicked';}
 else if(q.cmd==='pulse'){
  if(c.active&&['running','paused','starting'].includes(c.active.status))throw Error('Stop the model attempt before calibration.');
  const events:any[]=[];const broker=new InputBroker(c.game,e=>events.push(e));c.game.setActive(true);broker.open('development-calibration',1);const id='calibration-'+Date.now();broker.observe({id,attemptId:'development-calibration',runGeneration:1,targetId:c.game.identity(),capturedAt:Date.now(),room:'level',status:'unknown',confidence:0});
  try{result=await broker.act({attemptId:'development-calibration',runGeneration:1,observationId:id,actionId:id,action:q.action,durationMs:q.ms});}finally{broker.close('Calibration finished');c.game.setActive(false);}
  result={result,events,state:(await c.game.readState()).state};
 }
 else if(q.cmd==='inspect'){result={windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,title:w.getTitle()})),url:c.game.contents?.getURL(),frames:c.game.contents?.mainFrame.framesInSubtree.filter(f=>f.url.includes('/play')).map(f=>({url:f.url,routingId:f.routingId})),focused:c.game.contents?.isFocused(),windowFocused:panel.isFocused(),windowVisible:panel.isVisible(),actualZoom:c.game.contents?.getZoomFactor(),loading:c.game.contents?.isLoading(),geometry:await c.game.contents?.mainFrame.executeJavaScript(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,readyState:document.readyState,text:document.body.innerText.slice(0,2500),buttons:[...document.querySelectorAll('button,a,[role=button]')].filter(e=>/continue|play|accept|reject/i.test(e.textContent)).map(e=>({text:e.textContent.trim().slice(0,100),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}}))})`),display:c.game.state.display,surface:c.game.surface};}
 else if(q.cmd==='calibrate'){await c.verifyViewport();c.confirmRoom();result=c.game.surface;}
 else if(q.cmd==='connect'){await c.connect();result={...c.codex.state,runtime:undefined};}
 else if(q.cmd==='draft'){await c.saveProfile(q.value);result=c.store.profile;}
 else if(q.cmd==='settings'){await c.saveSettings(q.value);result=c.store.settings;}
 else if(q.cmd==='start'){await c.start('development model-only',q.profile);result={id:c.active.id,threadId:c.active.threadId};}
 else if(q.cmd==='pause'){await c.pause();result=c.active?.status;}
 else if(q.cmd==='resume'){await c.resume();result=c.active?.status;}
 else if(q.cmd==='stop'){await c.stop();result='stopped';}
 else if(q.cmd==='retry'){await c.retry();result=c.game.state;}
 else if(q.cmd==='full-page'){await c.pause();c.game.showPage();result=c.game.state;}
 else if(q.cmd==='ui-focus'){views[q.view||'sidebar'].webContents.focus();await new Promise(r=>setTimeout(r,100));result={status:c.active?.status,phase:c.phase,calibrated:c.game.calibrated,room:c.game.state.roomVerified,owned:c.broker.ownedKeys};}
 else if(q.cmd==='ui-layout'){const v=views.sidebar;result={bounds:v.getBounds(),zoom:v.webContents.getZoomFactor(),dom:await v.webContents.executeJavaScript(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,items:[...document.querySelectorAll('.sidebar,.model-card,.section-label,.model-fields,.harness-heading,select')].map(e=>({selector:e.tagName+'.'+e.className,label:e.getAttribute('aria-label'),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))})`)};}
 else if(q.cmd==='resize'){panel.setContentSize(q.width,q.height);layout();result=c.game.state;}
 else if(q.cmd==='background-menu'){
  if(process.env.WATERGIRL_BACKGROUND_TEST!=='1'||c.game.active)throw Error('Background idle test window only.');
  const f=c.game.contents!.mainFrame.framesInSubtree.find(f=>f.url.split('?')[0]===c.game.state.build);if(!f)throw Error('Complete publisher loading first.');
  if(q.read)result=await f.executeJavaScript(`({hidden:document.hidden,rootVisible:window.AVMPlayerCoolmath?.root?.visible,childCount:window.AVMPlayerCoolmath?.root?._children?.length,text:document.body.innerText,buttons:[...document.querySelectorAll('button,a,[role=button]')].map(e=>({text:e.textContent,id:e.id})),html:document.body.innerHTML.slice(0,3000),progress:document.querySelector('#progress__line')?.getAttribute('style'),splash:document.querySelector('#splash__image')?.getAttribute('style')})`);
  else {const x=Number(q.x),y=Number(q.y);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Point required');result=await f.executeJavaScript(`(()=>{const x=${x}/960*innerWidth,y=${y}/720*innerHeight,e=document.elementFromPoint(x,y);if(!e)return null;for(const type of ['mousedown','mouseup','click'])e.dispatchEvent(new MouseEvent(type,{clientX:x,clientY:y,button:0,buttons:type==='mousedown'?1:0,bubbles:true,cancelable:true}));return{tag:e.tagName,id:e.id};})()`,true);}
 }
 else if(q.cmd==='research'){if(process.env.WATERGIRL_BACKGROUND_TEST!=='1'||c.game.active)throw Error('Idle background research only');const f=c.game.frame||c.game.contents?.mainFrame.framesInSubtree.find(f=>f.url.split('?')[0]===c.game.state.build);if(!f)throw Error('Game frame not loaded');result=await f.executeJavaScript(await fs.readFile(path.join(process.cwd(),'scripts/research-engine.js'),'utf8'));}
 else if(q.cmd==='state'){result=(await c.game.readState()).state;}
 else if(q.cmd==='snapshot'){const a=c.active;result={game:c.game.state,phase:c.phase,error:c.error,connection:{status:c.codex.state.status,models:c.codex.state.models},active:a?{id:a.id,model:a.model,effort:a.effort,status:a.status,outcome:a.outcome,pauseReason:a.pauseReason,toolCalls:a.toolCalls,observations:a.observations.length,proposals:a.proposals,events:a.events.slice(-8)}:null};}
 else if(q.cmd==='quit'){await c.shutdown();app.exit();return;}else throw Error('Unknown diagnostic command');
 console.log(JSON.stringify({cmd:q.cmd,result}));}catch(e){console.log(JSON.stringify({error:String(e)}));}});
}
