import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { measureHand,HandTracker,RelativeDepth,StableHandPose,type HandSample } from '../src/hand-tracking';
import { syntheticHand,tiltHand } from './hand-fixture';
const sample=(size=.15,normal:HandSample['normal']=[0,0,1]):HandSample=>({id:'a',x:.5,y:.5,pinch:.1,size,normal,fist:false});
describe('two-hand measurement and identity',()=>{
  it('measures both mirrored pinch positions and normalized size',()=>{const h=measureHand(syntheticHand(.3,.4))!;expect(h.x).toBeCloseTo(.3);expect(h.y).toBeCloseTo(.4);expect(h.normal[2]).toBeCloseTo(1);expect(measureHand(syntheticHand(.3,.4,false,1.4))!.size/h.size).toBeCloseTo(1.4);});
  it('distinguishes a pinch from the deliberate helper fist',()=>{expect(measureHand(syntheticHand(.3,.4,true))!.fist).toBe(false);expect(measureHand(syntheticHand(.3,.4,false,1,true))!.fist).toBe(true);});
  it('recognizes the official recorded fist landmarks, with and without world landmarks',()=>{
    const text=readFileSync(new URL('./fixtures/fist_landmarks.pbtxt',import.meta.url),'utf8');
    const points=[...text.matchAll(/landmark\s*\{\s*x:\s*([-\d.e+]+)\s*y:\s*([-\d.e+]+)\s*z:\s*([-\d.e+]+)/gi)].map(m=>({x:Number(m[1]),y:Number(m[2]),z:Number(m[3])}));
    expect(points.length).toBeGreaterThanOrEqual(21);
    expect(measureHand({landmarks:points.slice(0,21),worldLandmarks:points.slice(21,42),handedness:'Right'},1)!.fist).toBe(true);
    expect(measureHand({landmarks:points.slice(0,21),handedness:'Right'},1)!.fist).toBe(true);
  });
  it('retains identities when detector order and handedness labels change',()=>{const t=new HandTracker();const initial=t.update([syntheticHand(.25),syntheticHand(.75)],1);const next=t.update([syntheticHand(.74,.5,false,1,false,'Left'),syntheticHand(.26,.5,false,1,false,'Left')],34);expect(next.hands[1].id).toBe(initial.hands[0].id);expect(next.hands[0].id).toBe(initial.hands[1].id);});
  it('retains briefly hidden hands but expires prolonged tracking loss',()=>{const t=new HandTracker();const id=t.update([syntheticHand()],1).hands[0].id;const gap=t.update([],35);expect(gap.lostIds).toEqual([]);expect(gap.hands[0].visible).toBe(false);expect(t.update([syntheticHand()],170).hands[0].id).toBe(id);expect(t.update([],800).lostIds).toEqual([id]);expect(t.update([syntheticHand()],840).hands[0].id).not.toBe(id);});
  it('disarms overlapping hands and rejects a discontinuous hand jump',()=>{const t=new HandTracker();expect(t.update([syntheticHand(.48),syntheticHand(.52)],1).ambiguous).toBe(true);const id=t.update([syntheticHand(.2)],40).hands[0].id;expect(t.update([syntheticHand(.8,.5,true)],70).hands[0].id).not.toBe(id);});
  it('does not trust stale hand identities or malformed landmarks',()=>{const t=new HandTracker();const id=t.update([syntheticHand()],1).hands[0].id;expect(t.update([syntheticHand(.4,.5,true)],800).hands[0].id).not.toBe(id);expect(measureHand({landmarks:[],handedness:'Right'})).toBeNull();});
  it('accepts a deliberate pinch after 75 ms while rejecting a brief contact',()=>{const t=new HandTracker();t.update([syntheticHand()],1);t.update([syntheticHand()],131);t.update([syntheticHand(.4,.5,true)],150);expect(t.update([syntheticHand(.4,.5,true)],180).hands[0].started).toBe(false);expect(t.update([syntheticHand(.4,.5,true)],230).hands[0].started).toBe(true);});
  it('occlusion cannot finish an unconfirmed pinch and trigger an unintended click',()=>{
    const t=new HandTracker();t.update([syntheticHand()],1);t.update([syntheticHand()],131);t.update([syntheticHand(.4,.5,true)],150);t.update([],180);
    expect(t.update([syntheticHand(.4,.5,true)],400).hands[0].started).toBe(false);expect(t.update([syntheticHand(.4,.5,true)],550).hands[0].machine.phase).toBe('waiting');
  });
  it('a tucked-thumb fist cannot become a pinch, even before the fist dwell completes',()=>{
    const t=new HandTracker();for(let now=0;now<300;now+=40)t.update([syntheticHand()],now);
    for(let now=300;now<1000;now+=40){const h=t.update([syntheticHand(.4,.5,true,1,true)],now).hands[0];expect(h.pinch).toBeLessThan(.28);expect(h.started).toBe(false);expect(h.machine.phase).not.toBe('holding');}
    expect(t.update([syntheticHand(.4,.5,true,1,true)],1040).hands[0].fist).toBe(true);
  });
  it('folded fingers stay a fist through camera tilt while a pinch stays a pinch',()=>{
    for(const yaw of [-1.3,-.5,0,.7,1.3])for(const pitch of [-.7,0,.7]){
      expect(measureHand(tiltHand(syntheticHand(.4,.5,true,1,true),yaw,pitch))!.fist).toBe(true);
      const pinch=measureHand(tiltHand(syntheticHand(.4,.5,true),yaw,pitch))!;
      expect(pinch.fist).toBe(false);expect(pinch.pinch).toBeLessThan(.28);
    }
  });
  it('fist latch tolerates noisy evidence and unlocks only after a deliberate open palm',()=>{
    const pose=new StableHandPose();let now=0;
    for(;now<800;now+=40)pose.update(now%120!==0,false,now);
    expect(pose.fist).toBe(true);
    for(;now<1600;now+=40){pose.update(false,now%120===0,now);expect(pose.fist).toBe(true);}
    for(;now<1920;now+=40)pose.update(false,true,now);
    expect(pose.fist).toBe(false);
  });
  it('a brief missing secondary keeps the primary pinch and fist identity',()=>{
    const t=new HandTracker();let frame;
    for(let now=0;now<300;now+=40)t.update([syntheticHand(.25),syntheticHand(.75)],now);
    for(let now=300;now<700;now+=40)frame=t.update([syntheticHand(.25,.5,true),syntheticHand(.75,.5,true,1,true)],now);
    const ids=frame!.hands.map(h=>h.id);expect(frame!.hands[1].fist).toBe(true);
    const hidden=t.update([syntheticHand(.25,.5,true)],740);expect(hidden.hands[1].visible).toBe(false);
    const back=t.update([syntheticHand(.75,.5,true,1,true),syntheticHand(.25,.5,true)],900);
    expect(back.hands.map(h=>h.id)).toEqual([...ids].reverse());expect(back.hands[0].fist).toBe(true);expect(back.hands[1].machine.phase).toBe('holding');
  });
});
describe('relative depth cue',()=>{
  it('moves toward the viewer when palm size grows and away when it shrinks',()=>{for(const ratio of [1.3,.7]){const d=new RelativeDepth();d.reset(sample(),1);for(let time=35;time<1200;time+=34)d.update(sample(.15*ratio),time);expect(Math.sign(d.value)).toBe(Math.sign(ratio-1));expect(Math.abs(d.value)).toBeGreaterThan(.5);}});
  it('suppresses small size jitter',()=>{const d=new RelativeDepth();d.reset(sample(),1);for(let time=35;time<600;time+=34)d.update(sample(.15*1.01),time);expect(d.value).toBe(0);});
  it('freezes and rebases during palm turns instead of converting foreshortening into depth',()=>{const d=new RelativeDepth();d.reset(sample(),1);d.update(sample(.11,[.9,0,.436]),35);expect(d.value).toBe(0);expect(d.paused).toBe(true);d.update(sample(.14),70);expect(d.value).toBe(0);d.update(sample(.14),104);expect(d.value).toBe(0);});
  it('rate-limits and bounds extreme depth cues',()=>{const d=new RelativeDepth();d.reset(sample(),1);d.update(sample(2),35);expect(d.value).toBeLessThanOrEqual(.102+1e-12);for(let time=70;time<5000;time+=34)d.update(sample(2),time);expect(d.value).toBeLessThanOrEqual(5);});
  it('fresh grabs start at zero, preventing an inherited depth jump',()=>{const d=new RelativeDepth();d.reset(sample(),1);d.update(sample(.3),35);d.reset(sample(.3),70);expect(d.value).toBe(0);});
});

