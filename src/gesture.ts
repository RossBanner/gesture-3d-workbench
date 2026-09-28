export interface Point { x: number; y: number }
export interface HandInput extends Point { pinch: number; identity: string }
export type GestureEvent = { type: 'start' | 'move' | 'end' | 'lost'; point: Point };
export type GesturePhase = 'waiting' | 'ready' | 'pinching' | 'holding' | 'releasing';
/** Pinch distance is divided by palm width; no camera-depth inference is used. */
export class GestureMachine {
  constructor(private readonly pinchDwellMs=110,private readonly lossTimeoutMs=220,private readonly releaseDwellMs=90) {}
  phase: GesturePhase = 'waiting';
  point: Point = { x: 0.5, y: 0.5 };
  private since = 0;
  private lastTime = 0;
  private identity = '';
  private hasPoint = false;
  private raw: Point | null = null;
  reset(): GestureEvent[] {
    const held = this.phase === 'holding' || this.phase === 'releasing';
    this.phase = 'waiting'; this.hasPoint = false; this.raw = null; this.identity = ''; this.lastTime = 0; this.since = 0;
    return held ? [{ type: 'lost', point: { ...this.point } }] : [];
  }
  update(input: HandInput | null, now: number): GestureEvent[] {
    if (!input || !Number.isFinite(input.x + input.y + input.pinch) || input.pinch < 0) return this.reset();
    const events: GestureEvent[] = [];
    if (this.hasPoint && (input.identity !== this.identity || now - this.lastTime > this.lossTimeoutMs || (this.raw && Math.hypot(input.x - this.raw.x, input.y - this.raw.y) > 0.30))) events.push(...this.reset());
    const dt = this.hasPoint ? Math.max(0, now - this.lastTime) : 0;
    const alpha = this.hasPoint ? 1 - Math.exp(-dt / 65) : 1;
    this.point = { x: this.point.x + (input.x - this.point.x) * alpha, y: this.point.y + (input.y - this.point.y) * alpha };
    this.identity = input.identity; this.lastTime = now; this.hasPoint = true; this.raw = { x: input.x, y: input.y };
    if (this.phase === 'waiting') {
      if (input.pinch > 0.48) { if (!this.since) this.since = now; if (now - this.since >= 120) { this.phase = 'ready'; this.since = 0; } }
      else this.since = 0;
    } else if (this.phase === 'ready') {
      if (input.pinch < 0.28) { this.phase = 'pinching'; this.since = now; }
    } else if (this.phase === 'pinching') {
      if (input.pinch >= 0.28) this.phase = 'ready';
      else if (now - this.since >= this.pinchDwellMs) { this.phase = 'holding'; events.push({ type: 'start', point: { ...this.point } }); }
    } else if (this.phase === 'holding') {
      if (input.pinch > 0.48) { this.phase = 'releasing'; this.since = now; }
      else events.push({ type: 'move', point: { ...this.point } });
    } else if (this.phase === 'releasing') {
      if (input.pinch <= 0.48) this.phase = 'holding';
      else if (now - this.since >= this.releaseDwellMs) { this.phase = 'ready'; events.push({ type: 'end', point: { ...this.point } }); }
    }
    return events;
  }
}
export interface Landmark { x: number; y: number; z: number }
export function handInput(points: Landmark[], identity: string): HandInput | null {
  if (points.length !== 21 || points.some(p => !Number.isFinite(p.x + p.y + p.z))) return null;
  const palm = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
  if (palm < 0.025) return null;
  return { x: Math.min(1, Math.max(0, 1 - (points[4].x + points[8].x) / 2)), y: Math.min(1, Math.max(0, (points[4].y + points[8].y) / 2)), pinch: Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) / palm, identity };
}
