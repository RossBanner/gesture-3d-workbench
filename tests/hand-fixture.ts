import type { DetectedHand } from '../src/hand-tracking';
/** Synthetic articulated fingers; pinched fingertips and tightly tucked fists share the same gap. */
export function syntheticHand(x=.4,y=.5,pinch=false,size=1,fist=false,handedness='Right'):DetectedHand {
  const center=1-(.12+x*.76);y=.20+y*.60;
  const p=Array.from({length:21},()=>({x:center,y,z:0}));
  const set=(i:number,dx:number,dy:number)=>p[i]={x:center+dx*size,y:y+dy*size,z:0};
  const gap=pinch||fist?.012:.12;
  const shift=fist?-.11:0;
  set(0,0,.20+shift);
  set(1,.06,.15+shift);set(2,.08,.08+shift);set(3,.055,.035+shift);
  set(4,gap/2,0);
  for(const [mcp,dx] of [[5,-.06],[9,0],[13,.032],[17,.064]]){
    set(mcp,dx,.09+shift);
    set(mcp+1,dx,.035+shift);
    set(mcp+2,dx*.8,fist?-.025:.005);
    set(mcp+3,mcp===5?-gap/2:dx,fist?.015: mcp===5?0:-.03);
  }
  set(8,-gap/2,0);
  return {landmarks:p,worldLandmarks:p.map(pt=>({...pt,x:pt.x-center,y:pt.y-y})),handedness};
}
/** Rotate the entire articulated hand in 3D, preserving the fingertip midpoint on screen. */
export function tiltHand(hand:DetectedHand,yaw:number,pitch=0):DetectedHand {
  const p=hand.landmarks,c={x:(p[4].x+p[8].x)/2,y:(p[4].y+p[8].y)/2,z:0};
  const rotate=(v:{x:number;y:number;z:number})=>{
    const x=v.x*Math.cos(yaw)+v.z*Math.sin(yaw),z=-v.x*Math.sin(yaw)+v.z*Math.cos(yaw);
    return {x,y:v.y*Math.cos(pitch)-z*Math.sin(pitch),z:v.y*Math.sin(pitch)+z*Math.cos(pitch)};
  };
  return {...hand,landmarks:p.map(v=>{const q=rotate({x:v.x-c.x,y:v.y-c.y,z:v.z});return{x:c.x+q.x,y:c.y+q.y,z:q.z};}),worldLandmarks:hand.worldLandmarks?.map(rotate)};
}
