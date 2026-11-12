import {z} from 'zod';
import {evaluateRules,rulesUsePosition,type RuntimeRule} from './rules';
export const PULSE_MAX_MS=1000;
export const ACTIONS=['left','right','jump','jump_left','jump_right','wait'] as const;
export const actionSchema=z.object({attemptId:z.string().min(1).max(100),runGeneration:z.number().int().nonnegative(),actionId:z.string().min(1).max(100),observationId:z.string().min(1).max(100),action:z.enum(ACTIONS),durationMs:z.number().int().min(50).max(PULSE_MAX_MS),intent:z.string().max(240).optional()}).strict();
export type Proposal=z.infer<typeof actionSchema>;
export type OwnedKey='A'|'W'|'D';
const KEYS:Record<Proposal['action'],readonly OwnedKey[]>={left:['A'],right:['D'],jump:['W'],jump_left:['A','W'],jump_right:['D','W'],wait:[]};
export type Observation={id:string;attemptId:string;runGeneration:number;targetId:string;capturedAt:number;room:string;status:'unknown'|'playing'|'menu'|'completed'|'lost';confidence:number;[k:string]:unknown};
export type ActionResult={accepted:boolean;reason:string;actionId?:string;startedAt?:number;releasedAt?:number;requestedMs?:number;actualMs?:number;keys?:OwnedKey[];interrupted?:boolean;};
export interface InputTarget {identity():string;validate():Promise<boolean>;send(key:OwnedKey,type:'keyDown'|'keyUp'):void|Promise<void>;}
export class InputBroker {
 private gate=false;private epoch=0;private attemptId='';private generation=0;private targetId='';private owned=new Set<OwnedKey>();private observations=new Map<string,Observation>();private delivered=new Map<string,Promise<ActionResult>>();private busy=false;private cancelPulse?:()=>void;private rules:RuntimeRule[]=[];
 constructor(private target:InputTarget,private event:(e:any)=>void=()=>{},readonly freshnessMs=20000,private refreshGuardObservation?:(prior:Observation)=>Promise<Observation>){}
 open(attemptId:string,generation:number,rules:RuntimeRule[]=[]){this.close('New action generation');this.attemptId=attemptId;this.generation=generation;this.targetId=this.target.identity();this.rules=structuredClone(rules);this.gate=true;}
 observe(obs:Observation){if(obs.attemptId===this.attemptId&&obs.runGeneration===this.generation&&obs.targetId===this.targetId){this.observations.set(obs.id,obs);if(this.observations.size>8)this.observations.delete(this.observations.keys().next().value!);}}
 close(reason:string){this.gate=false;this.epoch++;this.cancelPulse?.();this.cancelPulse=undefined;this.release();this.event({type:'gate-closed',at:Date.now(),reason});}
 private async release(){const keys=[...this.owned];this.owned.clear();for(const key of keys){try{await this.target.send(key,'keyUp');this.event({type:'key-up',key,at:Date.now()});}catch(e){this.event({type:'release-error',key,at:Date.now(),reason:String(e)});}finally{this.owned.delete(key);}}}
 get isOpen(){return this.gate;}get ownedKeys(){return [...this.owned];}
 async act(raw:unknown):Promise<ActionResult>{
  const parsed=actionSchema.safeParse(raw);if(!parsed.success)return this.reject('Invalid action schema; only semantic Watergirl actions and bounded durations are accepted.');
  const p=parsed.data,key=p.attemptId+':'+p.actionId;
  if(this.delivered.has(key))return this.delivered.get(key)!;
  if(this.delivered.size>=10000)return this.reject('Action history cap reached; start a new attempt.',p);
  const pending=this.perform(p);this.delivered.set(key,pending);return pending;
 }
 private reject(reason:string,p?:Proposal):ActionResult{const r={accepted:false,reason,actionId:p?.actionId};this.event({type:'action-result',at:Date.now(),proposal:p,result:r});return r;}
 private async perform(p:Proposal):Promise<ActionResult>{
  if(!this.gate||p.attemptId!==this.attemptId||p.runGeneration!==this.generation)return this.reject('Inactive or stale attempt generation.',p);
  if(this.busy)return this.reject('One action is already in flight; no queue.',p);
  const obs=this.observations.get(p.observationId);if(!obs||obs.targetId!==this.targetId)return this.reject('Unknown observation or replaced target.',p);
  if(Date.now()-obs.capturedAt>this.freshnessMs)return this.reject('Observation is stale; observe again.',p);
  const epoch=this.epoch;this.busy=true;
  try{
   if(!await this.target.validate()||this.target.identity()!==this.targetId){this.close('Target mismatch');return this.reject('Target mismatch.',p);}
   if(!this.gate||epoch!==this.epoch)return this.reject('Cancelled before dispatch.',p);
   if(Date.now()-obs.capturedAt>this.freshnessMs)return this.reject('Observation expired during validation.',p);
   let guardObs=obs;
   if(rulesUsePosition(this.rules)){
    if(!this.refreshGuardObservation)return this.reject('Position guardrail requires a fresh position measurement.',p);
    guardObs=await this.refreshGuardObservation(obs);
    if(!this.gate||epoch!==this.epoch)return this.reject('Cancelled during guardrail observation.',p);
    if(guardObs.targetId!==this.targetId||guardObs.attemptId!==this.attemptId||guardObs.runGeneration!==this.generation||Date.now()-guardObs.capturedAt>1000)return this.reject('Guardrail observation is stale or mismatched.',p);
    if(!await this.target.validate()||!this.gate||epoch!==this.epoch||this.target.identity()!==this.targetId)return this.reject('Target changed during guardrail observation.',p);
    this.event({type:'guard-observation',at:Date.now(),actionId:p.actionId,observation:guardObs});
   }
   const denied=evaluateRules(this.rules,p,guardObs,Date.now());if(denied)return this.reject(denied,p);
   const startedAt=Date.now(),keys=[...KEYS[p.action]];let interrupted=false;
   this.event({type:'action-start',at:startedAt,proposal:p,keys});
   await new Promise<void>((resolve,reject)=>{
    let done=false;let timer:ReturnType<typeof setTimeout>;
    const finish=(cancel=false)=>{if(done)return;done=true;clearTimeout(timer);interrupted=cancel;this.cancelPulse=undefined;void this.release().then(resolve,reject);};
    this.cancelPulse=()=>finish(true);timer=setTimeout(()=>finish(),p.durationMs);
    void (async()=>{try{for(const key of keys){if(done)break;if(!this.gate||epoch!==this.epoch){finish(true);break;}this.owned.add(key);await this.target.send(key,'keyDown');this.event({type:'key-down',key,at:Date.now()});}}catch(e){finish(true);reject(e);}})();
   });
   const releasedAt=Date.now(),result={accepted:true,reason:interrupted?'Input interrupted; owned keys released.':p.action==='wait'?'Wait completed without gameplay keys.':'Pulse completed; owned keys released.',actionId:p.actionId,startedAt,releasedAt,requestedMs:p.durationMs,actualMs:releasedAt-startedAt,keys,interrupted};
   this.event({type:'action-result',at:releasedAt,proposal:p,result});return result;
  }catch(e){this.close('Input driver failure');return this.reject('Input driver failure: '+String(e),p);}finally{this.busy=false;}
 }
}
