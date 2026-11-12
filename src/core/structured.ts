import clipping, {type MultiPolygon, type Ring} from 'polygon-clipping';
export const STATE_METHOD='awayfl-box2d-geometry-v2';
/** Read-only world traversal. No display bounds, pixels, model code, setters, or game actions. */
export const READ_STATE=`(()=>{
 const p=window.AVMPlayerCoolmath,cls=o=>o?.axClass?.classInfo?.instanceInfo?.multiname?.name||'';
 const level=p?.root?._children?.find(n=>cls(n.adapter)==='Game')?.adapter?.$Bgm_level,w=level?.$Bgm_world;
 if(!w)throw Error('Collision map unavailable. Enter a playable level, then confirm it.');
 const vec=v=>v?{x:v.x,y:v.y}:null, list=[];
 for(let b=w.m_bodyList;b;b=b.m_next){if(list.length>=10000||list.includes(b))throw Error('Incomplete body list');list.push(b);}
 const id=b=>b?('body-'+(b.m_userData?._adaptee?.id??('world-'+list.indexOf(b)))):null;
 const tag=v=>v==null?null:typeof v!=='object'?v:{className:cls(v),name:v._adaptee?.name||v.$Bgname||'',properties:Object.fromEntries(Object.entries(v).filter(([k,x])=>k.startsWith('$Bg')&&['number','string','boolean'].includes(typeof x)).map(([k,x])=>[k.slice(3),x]))};
 const bodies=list.map(b=>{const shapes=[],seen=new Set();for(let s=b.m_shapeList;s;s=s.m_next){if(shapes.length>=10000||seen.has(s))throw Error('Incomplete shape list');seen.add(s);shapes.push({type:s.m_type,vertices:s.m_vertices?.slice(0,s.m_vertexCount).map(vec),radius:s.m_radius,localPosition:vec(s.m_localPosition),sensor:s.m_isSensor,userData:tag(s.m_userData)});}
 return{id:id(b),type:b.m_type,position:vec(b.m_xf?.position),rotation:{col1:vec(b.m_xf?.R?.col1),col2:vec(b.m_xf?.R?.col2)},velocity:vec(b.m_linearVelocity),angularVelocity:b.m_angularVelocity,userData:tag(b.m_userData),shapeCount:b.m_shapeCount,shapes};});
 const joints=[],seen=new Set();for(let j=w.m_jointList;j;j=j.m_next){if(joints.length>=10000||seen.has(j))throw Error('Incomplete joint list');seen.add(j);joints.push({id:'joint-'+joints.length,bodyA:id(j.m_body1),bodyB:id(j.m_body2),type:j.m_type,anchorA:vec(j.m_localAnchor1),anchorB:vec(j.m_localAnchor2),axisA:vec(j.m_localXAxis1),limitsEnabled:j.m_enableLimit,motorEnabled:j.m_enableMotor,motorSpeed:j.m_motorSpeed,lowerTranslation:j.m_lowerTranslation,upperTranslation:j.m_upperTranslation,lowerAngle:j.m_lowerAngle,upperAngle:j.m_upperAngle,limitState:j.m_limitState,groups:['myActuateds','myActuateds2','myJumpers','mySliders','myLevers','myPushers','myWinds'].filter(n=>(level['$Bg'+n]?.value||[]).includes(j))});}
 const c=level.$BgmyContactListener;
 return{method:'awayfl-box2d-geometry-v2',level:level.$BgCurrentLevel,mode:level.$BgCurrentMode,paused:level.$Bgpause,ended:level.$Bgended,bodyCount:w.m_bodyCount,jointCount:w.m_jointCount,bodies,joints,players:{watergirl:{bodyId:id(level.$Bgpers2),canJump:level.$Bgallowjump2,jumpProhibited:level.$Bgprohibjump2,dead:c?.$BgdeadWater,exitContact:c?.$Bgfinish2},fireboy:{bodyId:id(level.$Bgpers1),canJump:level.$Bgallowjump1,jumpProhibited:level.$Bgprohibjump1,dead:c?.$BgdeadFire,exitContact:c?.$Bgfinish1}},gravity:vec(w.m_gravity)};
})()`;
type Point=[number,number];
const round=(v:number)=>Math.round(v*1e6)/1e6;
function point(v:any):Point {if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))throw Error('Invalid physics coordinate');return [v.x,v.y];}
function transform(b:any,p:any):Point {const [x,y]=point(p),[ox,oy]=point(b.position),[ax,ay]=point(b.rotation.col1),[bx,by]=point(b.rotation.col2);return [round(ox+ax*x+bx*y),round(oy+ay*x+by*y)];}
function bounds(points:Point[]){if(!points.length)throw Error('Empty collision geometry');const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),right=Math.max(...points.map(p=>p[0])),bottomY=Math.max(...points.map(p=>p[1]));return{x,y,width:round(right-x),height:round(bottomY-y),right,bottomY};}
function polygon(s:any,b:any):Ring {if(!Array.isArray(s.vertices)||s.vertices.length<3)throw Error('Invalid polygon collider');const ring=s.vertices.map((v:any)=>transform(b,v));ring.push([...ring[0]]);return ring;}
function regionGeometry(polygons:MultiPolygon,prefix:string){return polygons.map((rings,i)=>({id:prefix+'-'+i,bounds:bounds(rings[0]),rings}));}
/** Positive winding outer rings / negative winding holes from polygon-clipping; Y points down. */
function surfaces(regions:ReturnType<typeof regionGeometry>){return regions.flatMap(region=>region.rings.flatMap(ring=>ring.slice(0,-1).flatMap((a,i)=>{const b=ring[i+1];return b[0]>a[0]+1e-7?[{regionId:region.id,from:a,to:b}]:[];})));}
export function identifyState(raw:any){
 if(raw.method!==STATE_METHOD||!Array.isArray(raw.bodies)||raw.bodies.length!==raw.bodyCount||!Array.isArray(raw.joints)||raw.joints.length!==raw.jointCount)throw Error('Incomplete physics map; confirm a playable level.');
 const groups=new Map<string,{material:string;sensor:boolean;rings:Ring[]}>(),objects:any[]=[],byId=new Map<string,any>();let shapeCount=0,groundShapeCount=0;
 for(const b of raw.bodies){if(!b.id||byId.has(b.id)||b.shapeCount!==b.shapes.length)throw Error('Incomplete or ambiguous body geometry');byId.set(b.id,b);const isGround=b.userData?.name==='ground',shapes:any[]=[];
  for(const s of b.shapes){shapeCount++;if(s.type!==0&&s.type!==1)throw Error('Unsupported collision shape: '+s.type);
   const material=typeof s.userData==='string'?({black:'green'} as any)[s.userData]||s.userData:'solid';
   if(s.type===1){const ring=polygon(s,b);if(isGround){groundShapeCount++;const key=material+':'+!!s.sensor;if(!groups.has(key))groups.set(key,{material,sensor:!!s.sensor,rings:[]});groups.get(key)!.rings.push(ring);}else shapes.push({kind:'polygon',vertices:ring.slice(0,-1),sensor:!!s.sensor,tag:s.userData});}
   else{if(!Number.isFinite(s.radius)||s.radius<=0)throw Error('Invalid circle collider');shapes.push({kind:'circle',center:transform(b,s.localPosition),radius:s.radius,sensor:!!s.sensor,tag:s.userData});}
  }
  if(shapes.length){const pts:Point[]=shapes.flatMap(s=>s.kind==='polygon'?s.vertices:[[s.center[0]-s.radius,s.center[1]-s.radius],[s.center[0]+s.radius,s.center[1]+s.radius]]);objects.push({id:b.id,className:b.userData?.className||'unknown',name:b.userData?.name||'',position:point(b.position),velocity:point(b.velocity),angularVelocity:b.angularVelocity,bounds:bounds(pts),properties:b.userData?.properties||{},shapes});}
 }
 if(!groundShapeCount)throw Error('No ground collision map. Refusing an incomplete observation.');
 const terrain:any[]=[];
 for(const group of groups.values()){const polys=group.rings.map(r=>[r] as Ring[]);const union=clipping.union(polys[0],...polys.slice(1));terrain.push({material:group.material,sensor:group.sensor,sourceShapeCount:group.rings.length,regions:regionGeometry(union,group.material)});}
 const pick=(name:string)=>{const meta=raw.players?.[name],body=objects.find(o=>o.id===meta?.bodyId);if(!body||body.className.toLowerCase()!==name)throw Error('Both player collision bodies are required');return{...body,x:body.position[0],y:body.position[1],bottomY:body.bounds.bottomY,confidence:1,canJump:meta.canJump,jumpProhibited:meta.jumpProhibited,dead:meta.dead,exitContact:meta.exitContact};};
 const joints=raw.joints.map((j:any)=>{const a=byId.get(j.bodyA),b=byId.get(j.bodyB);if(!a||!b)throw Error('Joint references missing body');return{...j,anchorA:j.anchorA?transform(a,j.anchorA):null,anchorB:j.anchorB?transform(b,j.anchorB):null,axisA:j.axisA?point(j.axisA):null};});
 const state={method:STATE_METHOD,coordinateSpace:'Native physics world units: x right, y down. All positions, vertices, bounds, radii, velocities and joint anchors use this same space. Geometry rounded to 0.000001 units. No screen coordinates.',level:raw.level,mode:raw.mode,paused:raw.paused,ended:raw.ended,gravity:raw.gravity?point(raw.gravity):null,coverage:{complete:true,bodiesRead:raw.bodies.length,engineBodyCount:raw.bodyCount,shapesRead:shapeCount,groundShapes:groundShapeCount,jointsRead:joints.length,unsupportedShapes:0,omittedBodies:0,omittedShapes:0},watergirl:pick('watergirl'),fireboy:pick('fireboy'),terrain:{layers:terrain,surfaces:surfaces(terrain.filter(t=>t.material==='solid'&&!t.sensor).flatMap(t=>t.regions))},objects:objects.filter(o=>!['WaterGirl','FireBoy'].includes(o.className)),joints};
 // Keep payload compact and deterministic; never estimate geometry from an image.
 return JSON.parse(JSON.stringify(state,(_k,v)=>typeof v==='number'?round(v):v));
}
