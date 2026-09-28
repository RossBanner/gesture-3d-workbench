import { GestureMachine, type Landmark, type Point } from './gesture';
import { clamp } from './model';

export interface DetectedHand { landmarks: Landmark[]; worldLandmarks?: Landmark[]; handedness: string }
export interface HandSample extends Point {
  id: string; pinch: number; size: number; normal: [number,number,number]; fist: boolean;
  palm?: Point; openPalm?: boolean;
}
export interface TrackedHand extends HandSample {
  machine: GestureMachine; started: boolean; ended: boolean; lost: boolean; visible: boolean; reacquired: boolean;
}
const distance=(a:Landmark,b:Landmark,aspect:number)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const distance3=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Reach the whole workbench while keeping fingers inside the webcam image. */
export function cameraToPointer(p:Point):Point{return {x:clamp((p.x-.12)/.76,0,1),y:clamp((p.y-.20)/.60,0,1)};}
export function measureHand(hand:DetectedHand,aspect=4/3):Omit<HandSample,'id'>|null {
  const p=hand.landmarks;
  if(p.length!==21||p.some(v=>!Number.isFinite(v.x+v.y+v.z)))return null;
  const palmLength=distance(p[0],p[9],aspect),palmWidth=distance(p[5],p[17],aspect);
  const size=Math.hypot(palmLength,palmWidth)/Math.SQRT2;
  if(size<.035)return null;
  // Joint-space distances keep a tilted hand valid even when its image width collapses.
  const w=hand.worldLandmarks?.length===21&&hand.worldLandmarks.every(v=>Number.isFinite(v.x+v.y+v.z))
    ?hand.worldLandmarks:p.map(v=>({x:v.x*aspect,y:v.y,z:v.z*aspect}));
  const pinch=distance3(w[4],w[8])/Math.max(.001,distance3(w[5],w[17]),distance3(w[0],w[9])*.65);
  const folded=[5,9,13,17].map(i=>{
    const path=distance3(w[i],w[i+1])+distance3(w[i+1],w[i+2])+distance3(w[i+2],w[i+3]);
    const chord=distance3(w[i],w[i+3])/Math.max(.0001,path);
    return chord<.78&&distance3(w[i+3],w[0])<distance3(w[i+1],w[0])*1.10;
  });
  // A tucked thumb often touches the index in a fist. Finger curl takes priority.
  const fist=folded[0]&&folded.slice(1).filter(Boolean).length>=2;
  const openPalm=folded.filter(Boolean).length===0&&pinch>.60;
  const a=[w[5].x-w[0].x,w[5].y-w[0].y,w[5].z-w[0].z],b=[w[17].x-w[0].x,w[17].y-w[0].y,w[17].z-w[0].z];
  let normal:[number,number,number]=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length=Math.hypot(...normal);
  normal=length>1e-8?normal.map(v=>v/length) as typeof normal:[0,0,0];
  const sign=normal[2]<0?-1:1;normal=[-normal[0]*sign,-normal[1]*sign,Math.abs(normal[2])];
  return {...cameraToPointer({x:1-(p[4].x+p[8].x)/2,y:(p[4].y+p[8].y)/2}),
    palm:{x:1-(p[0].x+p[5].x+p[9].x+p[17].x)/4,y:(p[0].y+p[5].y+p[9].y+p[17].y)/4},
    pinch,size,normal,fist,openPalm};
}

/** A fist latches until a deliberate open palm. Uncertain frames cannot toggle the mode. */
export class StableHandPose {
  fist=false;
  private evidence=0;
  private last:number|null=null;
  private opening:number|null=null;
  update(rawFist:boolean,openPalm:boolean,now:number){
    const dt=this.last===null?0:clamp(now-this.last,0,90);this.last=now;
    if(!this.fist){
      this.opening=null;
      this.evidence=clamp(this.evidence+(rawFist?dt:-dt*.6),0,160);
      if(this.evidence>=160)this.fist=true;
    }else{
      if(openPalm){this.opening??=now;if(now-this.opening>=220){this.fist=false;this.opening=null;this.evidence=0;}}
      else this.opening=null;
    }
    return {fist:this.fist,blockPinch:rawFist||this.fist||this.evidence>0};
  }
}

type Track={sample:HandSample;time:number;machine:GestureMachine;pose:StableHandPose;missing:boolean};
export const HAND_LOSS_GRACE_MS=600;
/** Palm continuity survives brief occlusion, detector reorder and thumb movement. */
export class HandTracker {
  private tracks:Track[]=[];
  private nextId=1;
  reset(){this.tracks=[];}
  update(detections:DetectedHand[],now:number,aspect=4/3):{hands:TrackedHand[];lostIds:string[];ambiguous:boolean}{
    const measured=detections.slice(0,2).map(h=>measureHand(h,aspect)).filter((h):h is NonNullable<typeof h>=>!!h);
    const previous=this.tracks.filter(p=>now-p.time<=HAND_LOSS_GRACE_MS);
    const lostIds=this.tracks.filter(p=>now-p.time>HAND_LOSS_GRACE_MS).map(p=>p.sample.id);
    const cost=(i:number,j:number)=>{
      const a=measured[i].palm!,b=previous[j].sample.palm!;
      return Math.hypot(a.x-b.x,a.y-b.y)+.02*Math.abs(Math.log(measured[i].size/previous[j].sample.size));
    };
    let mapping:number[]=[];
    if(measured.length===2&&previous.length===2)mapping=cost(0,0)+cost(1,1)<=cost(0,1)+cost(1,0)?[0,1]:[1,0];
    else if(measured.length===1&&previous.length)mapping=[previous.length===1||cost(0,0)<=cost(0,1)?0:1];
    else if(measured.length===2&&previous.length===1)mapping=cost(0,0)<=cost(1,0)?[0,-1]:[-1,0];
    const seen=new Set<string>();
    const visible=measured.map((h,i)=>{
      const j=mapping[i];
      let track=j!==undefined&&j>=0&&cost(i,j)<.23?previous[j]:undefined;
      const reacquired=!!track?.missing;
      if(!track)track={sample:{...h,id:`hand-${this.nextId++}`},time:now,machine:new GestureMachine(75,HAND_LOSS_GRACE_MS,150),pose:new StableHandPose(),missing:false};
      const alpha=1-Math.exp(-Math.max(1,now-track.time)/75);
      const normal=track.sample.normal.map((v,k)=>v+(h.normal[k]-v)*alpha) as HandSample['normal'];
      const norm=Math.hypot(...normal)||1;
      const pose=track.pose.update(h.fist,!!h.openPalm,now);
      const sample:HandSample={...h,id:track.sample.id,fist:pose.fist,
        size:track.sample.size+(h.size-track.sample.size)*alpha,normal:normal.map(v=>v/norm) as HandSample['normal']};
      // Feed release, never pinch, while fingers form a fist. A fist cannot click UI.
      const events=track.machine.update({...sample,pinch:pose.blockPinch?1:sample.pinch,identity:sample.id},now);
      track.sample=sample;track.time=now;track.missing=false;seen.add(sample.id);
      return {track,hand:{...sample,x:track.machine.point.x,y:track.machine.point.y,machine:track.machine,
        started:!pose.blockPinch&&events.some(e=>e.type==='start'),ended:events.some(e=>e.type==='end'),
        lost:events.some(e=>e.type==='lost'),visible:true,reacquired}};
    });
    const retained=previous.filter(t=>!seen.has(t.sample.id));
    const keep=retained.slice(0,Math.max(0,2-visible.length));
    keep.forEach(t=>{
      // Missing time may preserve an existing grab, but may never complete a new pinch dwell.
      if(t.machine.phase!=='holding'&&t.machine.phase!=='releasing')t.machine.reset();
      t.missing=true;
    });
    retained.filter(t=>!keep.includes(t)).forEach(t=>lostIds.push(t.sample.id));
    this.tracks=[...visible.map(v=>v.track),...keep];
    const hands:TrackedHand[]=[...visible.map(v=>v.hand),...keep.map(t=>({...t.sample,x:t.machine.point.x,y:t.machine.point.y,machine:t.machine,started:false,ended:false,lost:false,visible:false,reacquired:false}))];
    const ambiguous=visible.length===2&&Math.hypot(visible[0].hand.x-visible[1].hand.x,visible[0].hand.y-visible[1].hand.y)<.065;
    if(ambiguous)for(const h of hands){h.machine.reset();h.started=false;h.lost=true;}
    return {hands,lostIds,ambiguous};
  }
  disarm(){for(const track of this.tracks)track.machine.reset();}
}


/** Relative size cue, not measured depth. Palm turns rebase instead of becoming false translation. */
export class RelativeDepth {
  private size=0;
  private normal:HandSample['normal']=[0,0,1];
  private last=0;
  private base=0;
  value=0;
  paused=false;
  reset(hand:HandSample,now:number){this.size=hand.size;this.normal=[...hand.normal];this.last=now;this.value=0;this.base=0;this.paused=false;}
  update(hand:HandSample,now:number){
    const dt=clamp((now-this.last)/1000,0,.15);this.last=now;
    const alignment=hand.normal.reduce((sum,v,i)=>sum+v*this.normal[i],0);
    if(hand.normal[2]<.55||alignment<.94){this.size=hand.size;this.normal=[...hand.normal];this.base=this.value;this.paused=true;return this.value;}
    if(this.paused){this.size=hand.size;this.normal=[...hand.normal];this.base=this.value;this.paused=false;return this.value;}
    const log=Math.log(hand.size/this.size), dead=.025;
    const target=clamp(this.base+(Math.abs(log)>dead?log-Math.sign(log)*dead:0)*7,-5,5);
    this.value+=clamp((target-this.value)*(1-Math.exp(-dt/.16)),-3*dt,3*dt);
    return this.value;
  }
}
