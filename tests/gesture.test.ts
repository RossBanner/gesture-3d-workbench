import { describe,expect,it } from 'vitest';
import { GestureMachine,handInput } from '../src/gesture';
const hand=(pinch=.8,x=.5,identity='Right')=>({x,y:.5,pinch,identity});
function ready(){const g=new GestureMachine();g.update(hand(),1);g.update(hand(),131);return g;}
function holding(){const g=ready();g.update(hand(.1),140);g.update(hand(.1),260);return g;}
describe('gesture safety and stability',()=>{
  it('requires an open hand before the first pinch',()=>{const g=new GestureMachine();expect(g.update(hand(.1),1)).toEqual([]);expect(g.update(hand(.1),200)).toEqual([]);expect(g.phase).toBe('waiting');});
  it('debounces a short pinch and only emits one start',()=>{const g=ready();g.update(hand(.1),140);expect(g.update(hand(.8),170)).toEqual([]);g.update(hand(.1),180);expect(g.update(hand(.1),300)[0]?.type).toBe('start');expect(g.update(hand(.1),330)[0]?.type).toBe('move');});
  it('uses hysteresis and debounced release',()=>{const g=holding();expect(g.update(hand(.36),280)[0]?.type).toBe('move');expect(g.update(hand(.6),300)).toEqual([]);expect(g.update(hand(.2),330)).toEqual([]);g.update(hand(.8),350);expect(g.update(hand(.8),450)[0]?.type).toBe('end');});
  it('tracking loss releases once and requires a fresh open hand',()=>{const g=holding();expect(g.update(null,280)[0]?.type).toBe('lost');expect(g.update(null,300)).toEqual([]);expect(g.update(hand(.1),320)).toEqual([]);expect(g.phase).toBe('waiting');});
  it('identity switches, discontinuities, and stale frames never keep grabbing',()=>{for(const input of [hand(.1,.8),hand(.1,.5,'Left')]){const g=holding();expect(g.update(input,280)[0]?.type).toBe('lost');expect(g.phase).toBe('waiting');}const g=holding();expect(g.update(hand(.1),600)[0]?.type).toBe('lost');});
  it('smooths jitter without changing the gesture state',()=>{const g=holding();g.update(hand(.1,.6),280);expect(g.point.x).toBeGreaterThan(.5);expect(g.point.x).toBeLessThan(.55);expect(g.phase).toBe('holding');});
  it('rejects invalid input safely',()=>{const g=holding();expect(g.update({...hand(),x:NaN},280)[0]?.type).toBe('lost');expect(g.phase).toBe('waiting');});
  it('mirrors the pinch midpoint and normalizes against palm width',()=>{const p=Array.from({length:21},()=>({x:.2,y:.5,z:0}));p[17].x=.4;p[4].x=.21;const input=handInput(p,'Right')!;expect(input.x).toBeCloseTo(.795);expect(input.pinch).toBeCloseTo(.05);expect(handInput([],'' )).toBeNull();p[17].x=.2;expect(handInput(p,'Right')).toBeNull();});
});
