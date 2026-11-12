import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import fs from 'node:fs';import {READ_STATE,identifyState,STATE_METHOD} from '../src/core/structured';
import {physicsWorld as fixture} from './fixtures/physics-world';
function engine(raw:any){
 const tag=(t:any)=>t==null||typeof t!=='object'?t:{axClass:{classInfo:{instanceInfo:{multiname:{name:t.className}}}},_adaptee:t.name==='ground'?undefined:{id:raw.bodies.findIndex((b:any)=>b.userData===t),name:t.name},...Object.fromEntries(Object.entries(t.properties).map(([k,v])=>['$Bg'+k,v]))};
 const bodies=raw.bodies.map((b:any)=>{const shapes=b.shapes.map((s:any)=>({m_type:s.type,m_vertices:s.vertices,m_vertexCount:s.vertices?.length,m_radius:s.radius,m_localPosition:s.localPosition,m_isSensor:s.sensor,m_userData:tag(s.userData)}));shapes.forEach((s:any,i:number)=>s.m_next=shapes[i+1]||null);return{m_type:b.type,m_xf:{position:b.position,R:b.rotation},m_linearVelocity:b.velocity,m_angularVelocity:b.angularVelocity,m_userData:tag(b.userData),m_shapeCount:b.shapeCount,m_shapeList:shapes[0]||null};});
 bodies.forEach((b:any,i:number)=>b.m_next=bodies[i+1]||null);
 const l:any={$BgCurrentLevel:raw.level,$Bgm_world:{m_bodyCount:bodies.length,m_bodyList:bodies[0],m_jointCount:0,m_jointList:null,m_gravity:raw.gravity},$BgmyContactListener:{}};
 for(const [name,n] of [['watergirl',2],['fireboy',1]] as const){const m=raw.players[name];l['$Bgpers'+n]=bodies[raw.bodies.findIndex((b:any)=>b.id===m.bodyId)];l['$Bgallowjump'+n]=m.canJump;l['$Bgprohibjump'+n]=m.jumpProhibited;l.$BgmyContactListener['$Bgdead'+(n===2?'Water':'Fire')]=m.dead;}
 return{root:{_children:[{adapter:{axClass:{classInfo:{instanceInfo:{multiname:{name:'Game'}}}},$Bgm_level:l}}]}};
}
function freeze(o:any,seen=new Set()){if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);Object.values(o).forEach(v=>freeze(v,seen));Object.freeze(o);}
test('fixed reader extracts synthetic physics fixtures without mutating the frozen engine',()=>{
 const p=engine(fixture());freeze(p);const raw=JSON.parse(JSON.stringify(vm.runInNewContext(READ_STATE,{window:{AVMPlayerCoolmath:p}})));const s=identifyState(raw);
 assert.equal(s.coverage.shapesRead,raw.bodies.reduce((n:number,b:any)=>n+b.shapeCount,0));assert.equal(s.watergirl.canJump,true);assert.equal(s.fireboy.className,'FireBoy');assert.equal(s.method,STATE_METHOD);
 assert.throws(()=>vm.runInNewContext(READ_STATE,{window:{}}),/Collision map unavailable/);
});
test('complete terrain preserves holes, entire pools, slopes, objects and every shape',()=>{
 const raw=fixture(),s=identifyState(raw),ground=s.terrain.layers.find((x:any)=>x.material==='solid');
 assert.equal(s.coverage.groundShapes,20);assert.equal(s.coverage.omittedShapes,0);assert.equal(s.coverage.bodiesRead,raw.bodyCount);assert.equal(s.joints.length,raw.jointCount);
 assert.ok(ground.regions[0].rings.length>1,'empty level interior must remain a hole');
 const area=(ring:number[][])=>Math.abs(ring.slice(0,-1).reduce((a,p,i)=>a+p[0]*ring[i+1][1]-ring[i+1][0]*p[1],0)/2);
 const unionArea=ground.regions.reduce((a:number,r:any)=>a+area(r.rings[0])-r.rings.slice(1).reduce((a:number,h:any)=>a+area(h),0),0);
 const rawArea=raw.bodies.find((b:any)=>b.userData?.name==='ground').shapes.filter((x:any)=>!x.userData).reduce((a:number,x:any)=>{const r=x.vertices.map((v:any)=>[v.x,v.y]);return a+area([...r,r[0]]);},0);
 assert.ok(Math.abs(unionArea-rawArea)<1e-6,'union must preserve filled area');
 for(const material of ['water','fire','green']){const l=s.terrain.layers.find((x:any)=>x.material===material);assert.equal(l.sourceShapeCount,5);assert.ok(l.regions[0].rings[0].length>4);assert.equal(l.regions[0].bounds.width,5);}
 assert.ok(s.terrain.surfaces.some((e:any)=>e.from[1]!==e.to[1]),'slope endpoints retained');
 for(const cls of ['Platform1','ButtonBox','LeverMc','MovingBox','FinishGirl','FinishBoy','BlueDiamond','RedDiamond'])assert.ok(s.objects.some((o:any)=>o.className===cls&&o.shapes.length));
 assert.equal(s.watergirl.shapes.filter((x:any)=>x.kind==='circle').length,2);
});
test('level changes and translated geometry are read without a route or fixed coordinate table',()=>{
 const raw=fixture(),before=identifyState(raw);raw.level=17;for(const b of raw.bodies){b.position.x+=123.25;b.position.y-=71;}
 const after=identifyState(raw);assert.equal(after.level,17);assert.equal(after.watergirl.x,before.watergirl.x+123.25);
 assert.equal(after.terrain.surfaces.length,before.terrain.surfaces.length);
 for(let i=0;i<after.terrain.surfaces.length;i++){assert.equal(after.terrain.surfaces[i].from[0],before.terrain.surfaces[i].from[0]+123.25);assert.equal(after.terrain.surfaces[i].from[1],before.terrain.surfaces[i].from[1]-71);}
 const box=raw.bodies.find((b:any)=>b.userData?.className==='MovingBox');box.rotation={col1:{x:0,y:1},col2:{x:-1,y:0}};const moved=identifyState(raw).objects.find((o:any)=>o.id===box.id);assert.equal(moved.shapes[0].vertices[0][0],box.position.x-box.shapes[0].vertices[0].y);
});
test('missing shapes, players, terrain, joints and unsupported colliders fail closed',()=>{
 for(const corrupt of [(r:any)=>r.bodies.pop(),(r:any)=>r.bodies[0].shapes.pop(),(r:any)=>r.bodies[0].shapes[0].type=42,(r:any)=>r.players.watergirl.bodyId='missing',(r:any)=>r.joints.pop(),(r:any)=>r.bodies.find((b:any)=>b.userData?.name==='ground').userData.name='unknown']){const r=fixture();corrupt(r);assert.throws(()=>identifyState(r));}
});
test('production observation path contains no image capture, detector or model image content',()=>{
 const game=fs.readFileSync('src/main/game.ts','utf8'),controller=fs.readFileSync('src/main/controller.ts','utf8');
 assert.doesNotMatch(game,/capturePage|measureWatergirl|toBitmap|toPNG/);
 assert.doesNotMatch(controller,/inputImage|type:\s*['"]image['"]|store\.screenshot/);
});

test('background adapter dispatch does not require desktop focus or activate a window',()=>{
 const game=fs.readFileSync('src/main/game.ts','utf8'),driver=fs.readFileSync('src/main/keyboard-driver.ts','utf8');
 const validate=game.slice(game.indexOf('async validate()'),game.indexOf('async focus()'));
 const send=game.slice(game.indexOf('async send('),game.indexOf('async readState()'));
 assert.doesNotMatch(validate+send,/isFocused|g\.focused|c\.focus/);
 assert.doesNotMatch(driver,/hasFocus|addEventListener\('blur'/);
 assert.doesNotMatch(game,/window\??\.show\(|window\??\.focus\(|window\.on\('blur'|wc\.on\('blur'/);
});
