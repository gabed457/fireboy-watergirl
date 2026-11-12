/** Synthetic collision world, authored for tests. No recorded game/session data. */
export function physicsWorld():any {
 const v=(x:number,y:number)=>({x,y});
 const poly=(points:number[][],tag:any=null,sensor=false)=>({type:1,vertices:points.map(([x,y])=>v(x,y)),sensor,userData:tag});
 const rect=(x:number,y:number,w:number,h:number,tag:any=null,sensor=false)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],tag,sensor);
 const circle=(x:number,y:number,radius:number,tag:any=null)=>({type:0,localPosition:v(x,y),radius,sensor:false,userData:tag});
 const body=(id:string,className:string,x:number,y:number,shapes:any[],name=className)=>({id,type:2,position:v(x,y),rotation:{col1:v(1,0),col2:v(0,1)},velocity:v(0,0),angularVelocity:0,userData:{className,name,properties:name==='ground'?{name:'ground'}:{}},shapeCount:shapes.length,shapes});
 const playerShapes=(tag:string)=>[rect(-.4,-.5,.8,1),circle(0,.5,.25,tag),circle(0,-.5,.4)];
 const bodies=[body('watergirl','WaterGirl',3,17,playerShapes('waterlegs')),body('fireboy','FireBoy',6,17,playerShapes('firelegs'))];
 for(const [i,cls] of ['MovingBox','ButtonBox','LeverMc','Platform1','FinishGirl','FinishBoy','BlueDiamond','RedDiamond'].entries())bodies.push(body('object-'+i,cls,3+i*2,7,[rect(-.5,-.5,1,1)]));
 // Four non-overlapping walls enclose an empty hole. A separate triangle is a ramp.
 const ground=[rect(0,0,30,1),rect(0,1,1,18),rect(29,1,1,18),rect(0,19,30,1),poly([[10,10],[14,14],[10,14]])];
 // Five connected pieces per pool; stepped edges distinguish full outlines from boxes.
 for(const [i,tag] of ['water','fire','black'].entries())for(let n=0;n<5;n++)ground.push(rect(2+n,22+i*3+(n===0||n===4?.25:0),1,1,tag,true));
 bodies.push(body('ground','Object',0,0,ground,'ground'),body('anchor','Object',0,0,[]));
 const joints=[{id:'joint-0',bodyA:'object-3',bodyB:'anchor',type:2,anchorA:v(0,0),anchorB:v(9,7),axisA:v(0,1),limitsEnabled:true,motorEnabled:true,motorSpeed:1,lowerTranslation:-2,upperTranslation:0,groups:['myActuateds']}];
 const player=(bodyId:string)=>({bodyId,canJump:true,jumpProhibited:false,dead:false,exitContact:-1});
 return{method:'awayfl-box2d-geometry-v2',level:1,mode:'synthetic-test',paused:false,ended:false,bodyCount:bodies.length,jointCount:joints.length,bodies,joints,players:{watergirl:player('watergirl'),fireboy:player('fireboy')},gravity:v(0,20)};
}
