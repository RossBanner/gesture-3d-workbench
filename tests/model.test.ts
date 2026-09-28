import { describe, expect, it } from 'vitest';
import { History, sampleScene, parseScene, copy, transformDrag } from '../src/model';
describe('versioned scene validation',()=>{
  it('round-trips a scene without retaining unknown fields',()=>{const s=sampleScene();expect(parseScene(JSON.stringify({...s,extra:'discard'}))).toEqual(s);});
  it.each([
    ['malformed','not json'],
    ['future version',JSON.stringify({...sampleScene(),version:2})],
    ['unsupported shape',JSON.stringify({...sampleScene(),objects:[{...sampleScene().objects[0],shape:'script'}]})],
    ['duplicate IDs',JSON.stringify({...sampleScene(),objects:[sampleScene().objects[0],sampleScene().objects[0]]})],
    ['invalid colour',JSON.stringify({...sampleScene(),objects:[{...sampleScene().objects[0],color:'url(https://example.com)'}]})],
    ['invalid scale',JSON.stringify({...sampleScene(),objects:[{...sampleScene().objects[0],scale:[0,1,1]}]})],
    ['nonfinite number',JSON.stringify({...sampleScene(),objects:[{...sampleScene().objects[0],position:[Infinity,1,1]}]})],
    ['out of bounds',JSON.stringify({...sampleScene(),objects:[{...sampleScene().objects[0],position:[101,0,0]}]})],
    ['too many objects',JSON.stringify({...sampleScene(),objects:Array(201).fill(sampleScene().objects[0])})],
    ['oversized',' '.repeat(512001)],
  ])('rejects %s without mutating the current scene',(_,text)=>{const s=sampleScene(),h=new History(s);expect(()=>parseScene(text)).toThrow();expect(h.state).toEqual(s);});
  it('accepts an empty assembly',()=>expect(parseScene(JSON.stringify({...sampleScene(),objects:[]})).objects).toHaveLength(0));
});
describe('history transactions',()=>{
  it('collapses hundreds of drag updates into a single reversible action',()=>{const h=new History(sampleScene()),original=copy(h.state);h.begin();for(let i=0;i<200;i++)h.state.objects[0].position[0]=i/10;h.commit();const moved=copy(h.state);h.undo();expect(h.state).toEqual(original);expect(h.canUndo).toBe(false);h.redo();expect(h.state).toEqual(moved);});
  it('cancels a grab and preserves redo on a no-op selection',()=>{const h=new History(sampleScene()),original=copy(h.state);h.begin();h.state.objects.pop();h.cancel();expect(h.state).toEqual(original);h.change(s=>s.objects.pop());h.undo();h.begin();h.commit();expect(h.canRedo).toBe(true);});
  it('clears redo on a new edit and does not alias external input',()=>{const s=sampleScene(),h=new History(s);h.change(x=>x.objects.pop());h.undo();h.change(x=>x.objects[0].name='Edited');expect(h.canRedo).toBe(false);expect(s.objects[0].name).not.toBe('Edited');});
  it('undoes scene replacement including object deletion',()=>{const h=new History(sampleScene()),original=copy(h.state);h.change(s=>s.objects=[]);h.undo();expect(h.state).toEqual(original);});
});
describe('transforms',()=>{
  it('moves only the selected axis and preserves the original',()=>{const o=sampleScene().objects[1];const t=transformDrag(o,'move','y',.5,-.25,[9,9,9],false);expect(t.position).toEqual([o.position[0],o.position[1]+3,o.position[2]]);expect(o.position[1]).toBe(1.05);});
  it('applies world-plane delta and snapping',()=>{const o=sampleScene().objects[0];const t=transformDrag(o,'move','screen',0,0,[.13,.07,-.38],true);expect(t.position).toEqual([.25,.25,-.5]);});
  it('rotates deliberately in radians and snaps to 15 degrees',()=>{const o=sampleScene().objects[0];const t=transformDrag(o,'rotate','y',.07,0,[0,0,0],true);expect(t.rotation[1]).toBeCloseTo(Math.PI/6);expect(t.rotation[0]).toBe(0);});
  it('bounds scale and positions even for extreme pointer input',()=>{const o=sampleScene().objects[0];expect(transformDrag(o,'scale','screen',0,-100,[0,0,0],false).scale).toEqual([20,20,20]);expect(transformDrag(o,'scale','screen',0,100,[0,0,0],false).scale).toEqual([.05,.05,.05]);expect(transformDrag(o,'move','x',100,0,[0,0,0],false).position[0]).toBe(100);});
  it('scales one axis without changing the others',()=>{const o=sampleScene().objects[1];const t=transformDrag(o,'scale','x',0,-.2,[0,0,0],false);expect(t.scale[0]).toBeGreaterThan(o.scale[0]);expect(t.scale.slice(1)).toEqual(o.scale.slice(1));});
  it('snapping preserves height on the floor plane and unconstrained axes',()=>{const o=sampleScene().objects[1];expect(transformDrag(o,'move','floor',0,0,[.4,0,.3],true).position[1]).toBe(o.position[1]);expect(transformDrag(o,'move','x',.1,0,[0,0,0],true).position.slice(1)).toEqual(o.position.slice(1));});
});
