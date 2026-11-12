import {app,BrowserWindow,WebContentsView,ipcMain,dialog,shell,Menu,type WebContents} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {Controller} from './controller';
import {baseline} from '../core/harness';
import {safeError} from './rpc';
app.setName('Watergirl Teammate');
app.setPath('userData',process.env.WATERGIRL_DIAGNOSTIC_DATA||path.join(app.getPath('appData'),'Watergirl Teammate'));
const single=app.requestSingleInstanceLock();if(!single)app.quit();
const backgroundTest=!app.isPackaged&&process.env.WATERGIRL_BACKGROUND_TEST==='1';
if(backgroundTest)app.setActivationPolicy('prohibited');
let panel:BrowserWindow,c:Controller,quitting=false;
const trusted=new Set<WebContents>();
app.on('second-instance',()=>{panel?.show();panel?.focus();});
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Watergirl Teammate',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'windowMenu'}]));
 c=new Controller(app.getPath('userData'));await c.init();
 panel=new BrowserWindow({show:!backgroundTest,title:'Watergirl Teammate',width:1440,height:842,minWidth:1120,minHeight:740,backgroundColor:'#0a1018',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 if(backgroundTest){panel.setOpacity(0);panel.setIgnoreMouseEvents(true);panel.showInactive();}
 const protect=(wc:WebContents)=>{trusted.add(wc);wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',e=>e.preventDefault());};protect(panel.webContents);
 const ui=path.join(__dirname,'ui/index.html');
 const views:Record<string,WebContentsView>={};
 function layout(){
  if(!panel||panel.isDestroyed())return;
  const [w,h]=panel.getContentSize(),rail=w<1280?340:380,top=72,bottom=142,left=w-rail;
  const stage={x:0,y:top,width:left,height:h-top-bottom};
  const shown=c.game.layout(stage);
  // On macOS a native child is not clipped by a plain View. The trusted UI
  // panels cover the publisher page outside the fitted viewport. No second window.
  const fitted=c.game.state.mode==='game';
  const edge=fitted?shown.x+shown.width:left;
  const foot=fitted?shown.y+shown.height:h-bottom;
  views.header?.setBounds({x:0,y:0,width:w,height:top});
  views.sidebar?.setBounds({x:edge,y:top,width:w-edge,height:h-top});
  views.transport?.setBounds({x:0,y:foot,width:edge,height:h-foot});
 }
 c.game.attach(panel,layout);
 for(const name of ['header','sidebar','transport']){const v=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});v.setBackgroundColor('#0d1520');protect(v.webContents);panel.contentView.addChildView(v);views[name]=v;}
 panel.on('resize',layout);layout();
 let timer:ReturnType<typeof setTimeout>|null=null;
 c.on('change',()=>{if(timer)return;timer=setTimeout(()=>{timer=null;for(const wc of trusted)if(!wc.isDestroyed())wc.send('watergirl:changed');},80);});
 const handle=(name:string,fn:(v:any)=>any)=>ipcMain.handle('watergirl:'+name,async(e,v)=>{if(!trusted.has(e.sender)||e.senderFrame!==e.sender.mainFrame)throw Error('Untrusted sender');try{return{ok:true,value:await fn(v)};}catch(error){c.error=safeError(error);c.changed();return{ok:false,error:safeError(error)};}});
 handle('snapshot',()=>c.snapshot());handle('connect',()=>c.connect());handle('login',async()=>shell.openExternal(await c.codex.login()));c.codex.on('login-completed',()=>void c.codex.refreshAccount());
 handle('open-game',()=>{c.game.open();c.game.mute(c.store.settings.muted);});
 handle('full-page',async()=>{await c.pause('Publisher page opened');c.game.showPage();});
 handle('verify-viewport',()=>c.verifyViewport());handle('confirm-room',async()=>{await c.verifyViewport();c.confirmRoom();c.error='';c.changed();});
 handle('start',()=>c.start(!app.isPackaged&&process.env.WATERGIRL_DEV_DIAGNOSTICS==='1'?'development model-only':'human-plus-AI'));handle('pause',()=>c.pause());handle('resume',()=>c.resume());handle('stop',()=>c.stop());handle('retry',()=>c.retry());
 handle('save-profile',v=>c.saveProfile(v));handle('save-settings',v=>c.saveSettings(v));handle('reset-profile',()=>c.saveProfile(baseline()));handle('outcome',v=>c.confirmOutcome(v));
 handle('clear-error',()=>{c.error='';c.changed();});
 handle('choose-codex',async()=>{await c.pause('Choosing Codex');const r=await dialog.showOpenDialog(panel,{properties:['openFile','showHiddenFiles'],title:'Choose installed Codex executable'});if(r.canceled)return null;await c.store.saveSettings({...c.store.settings,codexPath:r.filePaths[0]});return r.filePaths[0];});
 handle('import-text',async()=>{await c.pause('Importing harness text');const r=await dialog.showOpenDialog(panel,{properties:['openFile'],filters:[{name:'Instructions',extensions:['md','txt']}]});if(r.canceled)return null;const p=r.filePaths[0];if(!/\.(md|txt)$/i.test(p))throw Error('Only .md and .txt files');if((await fs.stat(p)).size>30000)throw Error('Instruction file exceeds 30 KB');return{name:path.basename(p),body:await fs.readFile(p,'utf8')};});
 handle('export-run',async id=>{if(!c.store.runs.some(x=>x.id===id))throw Error('Unknown attempt');const base=path.join(c.dataDir,'exports');await fs.mkdir(base,{recursive:true});const dest=path.join(base,'Watergirl-attempt-'+id+'-'+Date.now());await c.store.exportRun(id,dest);shell.showItemInFolder(path.join(dest,'record.json'));return dest;});
 handle('review',async id=>{await c.pause('Reviewing saved evidence');const run=c.store.runs.find(x=>x.id===id);if(!run)throw Error('Unknown attempt');return{run};});
 await panel.loadFile(ui,{hash:'shell'});
 await Promise.all(Object.entries(views).map(([name,v])=>v.webContents.loadFile(ui,{hash:name})));
 layout();
 if(!app.isPackaged&&process.env.WATERGIRL_DEV_DIAGNOSTICS==='1'){
  const {installDiagnostics}=await import('./dev-diagnostics');installDiagnostics(c,panel,views,layout);
 }
 if(process.env.WATERGIRL_TEST_NO_AUTOSTART!=='1'){c.game.open();c.game.mute(c.store.settings.muted);void c.connect().catch(()=>{});}
});
app.on('before-quit',e=>{if(quitting)return;e.preventDefault();quitting=true;if(c)void c.shutdown().finally(()=>app.quit());else app.quit();});
app.on('window-all-closed',()=>app.quit());
