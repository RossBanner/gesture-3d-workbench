import { describe,it,expect } from 'vitest';
import { Quaternion,Vector3 } from 'three';
import { dualTransform,pairMetrics,moveWithDepth,angleDelta,depthTransform,rotateTransform,scaleTransform } from '../src/hand-transform';
import { sampleScene } from '../src/model';
import type { HandSample } from '../src/hand-tracking';
const h=(x:number,y=.5):HandSample=>({id:String(x),x,y,pinch:.1,size:.15,normal:[0,0,1],fist:false});
describe('bimanual transform',()=>{
  const initial=pairMetrics(h(.3),h(.7),4/3),o=sampleScene().objects[1];
  it('spreading scales uniformly and squeezing shrinks',()=>{for(const xs of [[.2,.8],[.4,.6]]){const result=dualTransform(o,initial,pairMetrics(h(xs[0]),h(xs[1]),4/3),[0,0,0],new Quaternion(),false);expect(Math.sign(result.scale[0]-o.scale[0])).toBe(xs[0]===.2?1:-1);expect(result.scale[0]/result.scale[1]).toBeCloseTo(o.scale[0]/o.scale[1]);}});
  it('turning the hand-to-hand line rotates without requiring a mode change',()=>{const result=dualTransform(o,initial,pairMetrics(h(.3,.6),h(.7,.4),4/3),[0,0,0],new Quaternion(),false);expect(Math.abs(result.rotation[2])).toBeGreaterThan(.1);});
  it('second palm yaw and pitch tumble the object',()=>{const next={...initial,yaw:.6,pitch:.4};const result=dualTransform(o,initial,next,[0,0,0],new Quaternion(),false);expect(Math.abs(result.rotation[0])).toBeGreaterThan(.1);expect(Math.abs(result.rotation[1]-o.rotation[1])).toBeGreaterThan(.1);});
  it('rebasing with snapping does not jump position or scale',()=>{const result=dualTransform(o,initial,initial,[0,0,0],new Quaternion(),true);expect(result.position).toEqual(o.position);expect(result.scale).toEqual(o.scale);expect(result.rotation[1]).toBeCloseTo(o.rotation[1]);});
  it('wraps angles around pi without a full-turn flip',()=>expect(angleDelta(-Math.PI+.03,Math.PI-.03)).toBeCloseTo(.06));
  it('camera depth changes the correct 3D direction and stays bounded',()=>{const result=moveWithDepth(o,[0,0,0],new Vector3(0,0,1),2,false);expect(result.position[2]).toBeCloseTo(o.position[2]+2);expect(result.position.slice(0,2)).toEqual(o.position.slice(0,2));expect(moveWithDepth(o,[0,0,0],new Vector3(0,0,1),1000,false).position[2]).toBe(100);});
  it('explicit Z depth preserves X/Y, rotation and every size component in both directions',()=>{
    for(const dy of [-.25,.25]){const result=depthTransform(o,dy,false);expect(Math.sign(result.position[2]-o.position[2])).toBe(Math.sign(dy));expect(result.position.slice(0,2)).toEqual(o.position.slice(0,2));expect(result.scale).toEqual(o.scale);expect(result.rotation).toEqual(o.rotation);}
  });
  it('hand motion rotates and tilts without palm normal estimates or changes in size/position',()=>{
    for(const [dx,dy] of [[.2,0],[0,.2]]){const result=rotateTransform(o,dx,dy,new Quaternion(),false);expect(result.rotation.some((v,i)=>Math.abs(v-o.rotation[i])>.5)).toBe(true);expect(result.position).toEqual(o.position);expect(result.scale).toEqual(o.scale);}
  });
  it('size control changes size without changing depth or rotation',()=>{const result=scaleTransform(o,1.5,false);expect(result.scale[0]).toBeCloseTo(o.scale[0]*1.5);expect(result.position).toEqual(o.position);expect(result.rotation).toEqual(o.rotation);});
});
