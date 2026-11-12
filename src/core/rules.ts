import type {Observation,Proposal} from './broker';
export type Expr={all:Expr[]}|{any:Expr[]}|{not:Expr}|{field:string;op:'eq'|'ne'|'lt'|'lte'|'gt'|'gte';value:string|number|boolean};
export type RuntimeRule={id:string;name:string;denyWhen:Expr;onUnknown:'deny'|'allow';message:string};
const fields=new Set(['action.action','action.durationMs','observed.status','observed.confidence','observed.ageMs','observed.room','observed.watergirl.x','observed.watergirl.bottomY','observed.watergirl.confidence']);
export const rulesUsePosition=(rules:RuntimeRule[])=>JSON.stringify(rules).includes('"observed.watergirl.');
export function validateRule(raw:unknown):RuntimeRule{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Rule must be a JSON object.');
 const r=raw as RuntimeRule;const keys=Object.keys(r);if(keys.some(k=>!['id','name','denyWhen','onUnknown','message'].includes(k)))throw Error('Unknown runtime-rule field.');
 for(const k of ['id','name','message'] as const)if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>300)throw Error('Rule '+k+' is required (1–300 characters).');
 if(!['deny','allow'].includes(r.onUnknown))throw Error('onUnknown must explicitly be deny or allow.');
 let nodes=0;function check(e:any,depth=0){if(++nodes>64||depth>6)throw Error('Rule exceeds 64 nodes or depth 6.');if(!e||typeof e!=='object'||Array.isArray(e))throw Error('Invalid expression.');
  const ks=Object.keys(e);if(ks.length===1&&('all'in e||'any'in e)){const a=e.all??e.any;if(!Array.isArray(a)||!a.length||a.length>16)throw Error('all/any require 1–16 expressions.');a.forEach(x=>check(x,depth+1));}
  else if(ks.length===1&&'not'in e)check(e.not,depth+1);
  else if(ks.length===3&&ks.every(k=>['field','op','value'].includes(k))){if(!fields.has(e.field)||!['eq','ne','lt','lte','gt','gte'].includes(e.op)||!['string','number','boolean'].includes(typeof e.value)||typeof e.value==='number'&&!Number.isFinite(e.value))throw Error('Unsupported comparison or field.');}
  else throw Error('Expression must be all, any, not, or field/op/value.');
 }check(r.denyWhen);return structuredClone(r);
}
export function evaluateRules(rules:RuntimeRule[],p:Proposal,o:Observation,now:number):string|null{
 const values:Record<string,unknown>={'action.action':p.action,'action.durationMs':p.durationMs,'observed.status':o.status==='unknown'?undefined:o.status,'observed.confidence':o.confidence,'observed.ageMs':now-o.capturedAt,'observed.room':o.room||undefined};
 const body=(o.state as any)?.watergirl;
 for(const key of ['x','bottomY','confidence'])values['observed.watergirl.'+key]=now-o.capturedAt<=1000&&body?.confidence>=.9?body[key]:undefined;
 function ev(e:Expr):boolean|undefined{if('all'in e){const v=e.all.map(ev);return v.includes(false)?false:v.includes(undefined)?undefined:true;}if('any'in e){const v=e.any.map(ev);return v.includes(true)?true:v.includes(undefined)?undefined:false;}if('not'in e){const v=ev(e.not);return v===undefined?undefined:!v;}
  // Gameplay assertions are unknown when older than 1 s or confidence < .9. Raw age/confidence stay available.
  let a=values[e.field];if(['observed.status','observed.room'].includes(e.field)&&(now-o.capturedAt>1000||o.confidence<.9))a=undefined;
  if(a===undefined||typeof a!==typeof e.value)return undefined;
  switch(e.op){case'eq':return a===e.value;case'ne':return a!==e.value;case'lt':return typeof a==='number'&&a<(e.value as number);case'lte':return typeof a==='number'&&a<=(e.value as number);case'gt':return typeof a==='number'&&a>(e.value as number);case'gte':return typeof a==='number'&&a>=(e.value as number);}
 }
 for(const r of rules){const v=ev(r.denyWhen);if(v===true||v===undefined&&r.onUnknown==='deny')return r.message+(v===undefined?' (Unknown, stale, or low-confidence field.)':'');}return null;
}
