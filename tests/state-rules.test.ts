import test from 'node:test';import assert from 'node:assert/strict';
import {InputBroker,type Observation,type Proposal} from '../src/core/broker';
import {validateRule,evaluateRules} from '../src/core/rules';
import fs from 'node:fs';import {compile} from '../src/core/harness';
const rule=validateRule({id:'early',name:'Authored takeoff check',message:'Takeoff too early',onUnknown:'deny',denyWhen:{all:[{field:'action.action',op:'eq',value:'jump_right'},{field:'observed.watergirl.x',op:'lt',value:425}]}});
const proposal:Proposal={attemptId:'a',runGeneration:1,actionId:'p',observationId:'original',action:'jump_right',durationMs:50};
const obs=(x=440):Observation=>({id:'original',attemptId:'a',runGeneration:1,targetId:'g',capturedAt:Date.now(),room:'1',status:'unknown',confidence:0,state:{watergirl:{x,bottomY:680,confidence:.95}}});
test('position rules use a fresh guard state, reject without input and never substitute',async()=>{
 const keys:any[]=[];let measuredX=410,captures=0;
 const b=new InputBroker({identity:()=>'g',validate:async()=>true,send:(key,type)=>{keys.push({key,type});}},()=>{},20000,async prior=>{captures++;return{...obs(measuredX),id:'guard'};});
 b.open('a',1,[rule]);b.observe(obs(440));
 assert.equal((await b.act(proposal)).accepted,false);assert.equal(captures,1);assert.equal(keys.length,0);
 measuredX=440;assert.equal((await b.act({...proposal,actionId:'chosen-again'})).accepted,true);
 assert.deepEqual(keys.map(x=>x.key),['D','W','D','W']);assert.equal(captures,2);
});
test('unknown, low-confidence and stale state positions follow explicit unknown policy',()=>{
 for(const kind of ['missing','confidence','age']){const o=obs();if(kind==='missing')delete o.state;if(kind==='confidence')(o.state as any).watergirl.confidence=.7;if(kind==='age')o.capturedAt-=1100;assert.match(evaluateRules([rule],proposal,o,Date.now())!,/Unknown/);assert.equal(evaluateRules([{...rule,onUnknown:'allow'}],proposal,o,Date.now()),null);}
});
test('cancellation during a guard state cannot send keys',async()=>{
 const keys:any[]=[];let finish!:(o:Observation)=>void;
 const b=new InputBroker({identity:()=>'g',validate:async()=>true,send:(key,type)=>{keys.push({key,type});}},()=>{},20000,()=>new Promise(r=>{finish=r;}));
 b.open('a',1,[rule]);b.observe(obs());const result=b.act(proposal);await new Promise(r=>setTimeout(r,5));b.close('operator pause');finish(obs());assert.equal((await result).accepted,false);assert.deepEqual(keys,[]);
});
test('current profile contains no room coordinates and permits equivalent actions anywhere',()=>{
 const profile=JSON.parse(fs.readFileSync('filming-profiles/live-state/profile.json','utf8'));
 const b=compile({...profile,skillsAndGuardrailsEnabled:true});
 assert.doesNotMatch(b.baseInstructions+b.developerInstructions,/x\s*[=≈]|y\s*[=≈]|room.?1|first fire jump|purple pressure/i);
 for(const x of [10,400,900]){const o=obs(x);assert.equal(evaluateRules(b.rules,{...proposal,action:'right',durationMs:200},o,Date.now()),null);assert.match(evaluateRules(b.rules,{...proposal,action:'right',durationMs:900},o,Date.now())!,/shorter/);}
 const unknown=obs();delete unknown.state;assert.match(evaluateRules(b.rules,proposal,unknown,Date.now())!,/position/);
});
