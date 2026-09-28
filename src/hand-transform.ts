import { Euler, Quaternion, Vector3 } from 'three';
import { clamp, copy, snap, type Item, type Vec3 } from './model';
import type { HandSample } from './hand-tracking';
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function pairMetrics(a:HandSample,b:HandSample,aspect:number){
  return {point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},span:Math.hypot((b.x-a.x)*aspect,b.y-a.y),angle:Math.atan2(-(b.y-a.y),(b.x-a.x)*aspect),yaw:Math.atan2(b.normal[0],Math.max(.3,b.normal[2])),pitch:Math.atan2(b.normal[1],Math.max(.3,b.normal[2]))};
}
export type PairMetrics=ReturnType<typeof pairMetrics>;
function dead(value:number,threshold:number){return Math.abs(value)<threshold?0:value-Math.sign(value)*threshold;}
export function dualTransform(start:Item,initial:PairMetrics,current:PairMetrics,worldDelta:Vec3,cameraRotation:Quaternion,snapping:boolean):Item{
  const out=copy(start);
  const ratio=Math.exp(dead(Math.log(Math.max(.08,current.span)/Math.max(.08,initial.span)),.025));
  const factor=clamp(ratio,.2,5);
  out.scale=start.scale.map(v=>factor===1?v:clamp(snap(v*factor,snapping?.1:0),.05,20)) as Vec3;
  const step=snapping?Math.PI/12:0;
  const yaw=snap(dead(angleDelta(current.yaw,initial.yaw),.05),step);
  const pitch=snap(dead(angleDelta(current.pitch,initial.pitch),.05),step);
  const roll=snap(dead(angleDelta(current.angle,initial.angle),.035),step);
  const turn=new Quaternion().setFromEuler(new Euler(pitch,yaw,roll,'YXZ'));
  const q=cameraRotation.clone().multiply(turn).multiply(cameraRotation.clone().invert()).multiply(new Quaternion().setFromEuler(new Euler(...start.rotation)));
  const r=new Euler().setFromQuaternion(q);out.rotation=[r.x,r.y,r.z];
  out.position=start.position.map((v,i)=>worldDelta[i]===0?v:clamp(snap(v+worldDelta[i],snapping?.25:0),-100,100)) as Vec3;
  return out;
}
export function moveWithDepth(start:Item,delta:Vec3,toward:Vector3,depth:number,snapping:boolean):Item{
  const out=copy(start);
  out.position=start.position.map((v,i)=>{const change=delta[i]+toward.getComponent(i)*depth;return change===0?v:clamp(snap(v+change,snapping?.25:0),-100,100);}) as Vec3;
  return out;
}
/** Deliberate Z translation: X/Y, object scale and rotation are invariant. */
export function depthTransform(start:Item,dy:number,snapping:boolean):Item{
  return moveWithDepth(start,[0,0,0],new Vector3(0,0,1),clamp(dead(dy,.008)*14,-8,8),snapping);
}
/** Screen-space yaw/pitch works with a stationary palm normal and one or two hands. */
export function rotateTransform(start:Item,dx:number,dy:number,camera:Quaternion,snapping:boolean,roll=0):Item{
  const out=copy(start),step=snapping?Math.PI/12:0;
  const turn=new Quaternion().setFromEuler(new Euler(snap(dead(dy,.008)*Math.PI*2,step),snap(dead(dx,.008)*Math.PI*2,step),snap(roll,step),'YXZ'));
  const q=camera.clone().multiply(turn).multiply(camera.clone().invert()).multiply(new Quaternion().setFromEuler(new Euler(...start.rotation)));
  const r=new Euler().setFromQuaternion(q);out.rotation=[r.x,r.y,r.z];return out;
}
export function scaleTransform(start:Item,factor:number,snapping:boolean):Item{
  const out=copy(start);out.scale=start.scale.map(v=>factor===1?v:clamp(snap(v*clamp(factor,.2,5),snapping?.1:0),.05,20)) as Vec3;return out;
}
