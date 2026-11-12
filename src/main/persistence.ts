import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {baseline,profileSchema,type Profile} from '../core/harness';
export async function atomic(file:string,value:unknown){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+randomUUID()+'.tmp';const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}finally{await h.close();}await fs.rename(tmp,file);}
export class Store{
 profile:Profile=baseline();settings:any={model:'',effort:'low',callCap:80,timeCapMinutes:10,retentionMB:500,codexPath:'',muted:true};runs:any[]=[];private queue=Promise.resolve();
 constructor(readonly dir:string){}
 async init(){await fs.mkdir(path.join(this.dir,'runs'),{recursive:true,mode:0o700});try{this.profile=profileSchema.parse(JSON.parse(await fs.readFile(path.join(this.dir,'profile.json'),'utf8')));}catch(e:any){if(e.code!=='ENOENT')throw Error('Saved profile is invalid; it was preserved for recovery.');}
 try{this.settings={...this.settings,...JSON.parse(await fs.readFile(path.join(this.dir,'settings.json'),'utf8'))};}catch(e:any){if(e.code!=='ENOENT')throw e;}
 for(const name of (await fs.readdir(path.join(this.dir,'runs'))).filter(n=>/^[0-9a-f-]{36}$/.test(n))){try{const run=JSON.parse(await fs.readFile(path.join(this.dir,'runs',name,'record.json'),'utf8'));if(['running','paused','starting'].includes(run.status)){run.status='finished';run.outcome='interrupted by application exit';run.endedAt=Date.now();await atomic(path.join(this.dir,'runs',name,'record.json'),run);}this.runs.push(run);}catch{}}
 this.runs.sort((a,b)=>b.startedAt-a.startedAt);await this.saveProfile(this.profile);}
 saveProfile(p:Profile){this.profile=structuredClone(profileSchema.parse(p));return this.enqueue(()=>atomic(path.join(this.dir,'profile.json'),this.profile));}
 saveSettings(s:any){this.settings=structuredClone(s);return this.enqueue(()=>atomic(path.join(this.dir,'settings.json'),this.settings));}
 async begin(run:any){this.runs.unshift(run);await this.record(run);}
 record(run:any){const copy=structuredClone(run);return this.enqueue(()=>atomic(path.join(this.dir,'runs',run.id,'record.json'),copy));}
 event(id:string,event:any){const line=JSON.stringify(event)+'\n';return this.enqueue(async()=>{await fs.mkdir(path.join(this.dir,'runs',id),{recursive:true,mode:0o700});await fs.appendFile(path.join(this.dir,'runs',id,'events.jsonl'),line,{mode:0o600});});}

 async sizeMB(){let bytes=0;async function walk(d:string){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else bytes+=(await fs.stat(p)).size;}}await walk(path.join(this.dir,'runs'));return bytes/1048576;}
 async exportRun(id:string,dest:string){if(!this.runs.some(x=>x.id===id))throw Error('Unknown attempt');await this.queue;await fs.cp(path.join(this.dir,'runs',id),dest,{recursive:true,errorOnExist:true,force:false});}
 private enqueue(fn:()=>Promise<any>){this.queue=this.queue.then(fn);return this.queue;}
 flush(){return this.queue;}
}
