import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {baseline,compile,type Profile} from '../src/core/harness';
import {InputBroker} from '../src/core/broker';
import {Store} from '../src/main/persistence';

function profile():Profile {
 const p=baseline();
 p.systemPrompt='Keep this exact prompt\n  ';
 p.skills=[{id:'s1',name:'Enabled skill',body:'SKILL_ENABLED\n  ',enabled:true},{id:'s2',name:'Disabled skill',body:'SKILL_DISABLED',enabled:false}];
 p.guardrails=[{id:'i',name:'Instruction',type:'instruction',body:'INSTRUCTION_GUARD',enabled:true},{id:'r',name:'Runtime',type:'runtime',enabled:true,body:JSON.stringify({id:'r',name:'No right',message:'CUSTOM_RULE_DENIED',onUnknown:'deny',denyWhen:{field:'action.action',op:'eq',value:'right'}})},{id:'d',name:'Disabled guard',type:'instruction',body:'GUARD_DISABLED',enabled:false}];
 return p;
}

test('master off excludes all authored extras, preserves exact entries and frozen bundles, and restores the same hash',()=>{
 const p=profile(),original=structuredClone(p),on=compile(p);
 assert.ok(on.developerInstructions.includes('SKILL_ENABLED\n  '));assert.ok(on.developerInstructions.includes('INSTRUCTION_GUARD'));assert.equal(on.rules.length,1);
 p.skillsAndGuardrailsEnabled=false;const off=compile(p);
 for(const text of ['SKILL_ENABLED','SKILL_DISABLED','INSTRUCTION_GUARD','GUARD_DISABLED','CUSTOM_RULE_DENIED'])assert.ok(!off.developerInstructions.includes(text));
 assert.deepEqual(off.rules,[]);assert.equal(off.baseInstructions,original.systemPrompt);
 assert.deepEqual(off.profile.skills,original.skills);assert.deepEqual(off.profile.guardrails,original.guardrails);
 assert.notEqual(off.hash,on.hash);assert.equal(on.rules.length,1);assert.deepEqual(on.profile,original);
 delete p.skillsAndGuardrailsEnabled;assert.equal(compile(p).hash,on.hash);assert.deepEqual(p,original);
 const invalid={...p,guardrails:[{...p.guardrails[1],body:'{'}]};assert.throws(()=>compile(invalid));assert.deepEqual(compile({...invalid,skillsAndGuardrailsEnabled:false}).rules,[]);
});

test('master off bypasses custom runtime denial while fixed Watergirl-only validation still rejects arrows',async()=>{
 const p=profile();
 for(const enabled of [true,false]){
  const events:unknown[]=[];const bundle=compile({...p,skillsAndGuardrailsEnabled:enabled});
  const b=new InputBroker({identity:()=> 'fixture',validate:async()=>true,send:(key,type)=>{events.push({key,type});}});
  b.open('fixture',1,bundle.rules);b.observe({id:'obs',attemptId:'fixture',runGeneration:1,targetId:'fixture',capturedAt:Date.now(),room:'1',status:'unknown',confidence:0});
  const action={attemptId:'fixture',runGeneration:1,actionId:'right',observationId:'obs',action:'right',durationMs:50};
  assert.equal((await b.act(action)).accepted,!enabled);
  const count=events.length;assert.equal((await b.act({...action,actionId:'arrow',action:'ArrowRight'})).accepted,false);assert.equal(events.length,count);
  assert.deepEqual(events,enabled?[]:[{key:'D',type:'keyDown'},{key:'D',type:'keyUp'}]);b.close('fixture complete');
 }
});

test('master off survives restart without changing individual selections or text',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'watergirl-master-toggle-'));
 const p={...profile(),skillsAndGuardrailsEnabled:false};const store=new Store(dir);await store.init();await store.saveProfile(p);await store.flush();
 const restarted=new Store(dir);await restarted.init();assert.deepEqual(restarted.profile,p);assert.deepEqual(compile(restarted.profile).rules,[]);
});
