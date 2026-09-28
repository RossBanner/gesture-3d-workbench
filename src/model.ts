export type Vec3 = [number, number, number];
export type Shape = 'cube' | 'sphere';
export type Mode = 'move' | 'rotate' | 'scale';
export type Constraint = 'screen' | 'floor' | 'x' | 'y' | 'z';
export interface Item { id: string; name: string; shape: Shape; color: string; position: Vec3; rotation: Vec3; scale: Vec3 }
export interface SceneData { format: 'gesture-3d-workbench'; version: 1; objects: Item[] }
export const copy = <T>(value: T): T => structuredClone(value);
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const snap = (v: number, step: number) => step ? Math.round(v / step) * step : v;
export const MAX_OBJECTS = 200;
export const MAX_SCENE_BYTES = 512_000;
export function newItem(shape: Shape, count: number): Item {
  return { id: crypto.randomUUID(), name: `${shape === 'cube' ? 'Cube' : 'Sphere'} ${count}`, shape, color: shape === 'cube' ? '#71e4ce' : '#b5a1ff', position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}
export function sampleScene(): SceneData {
  return { format: 'gesture-3d-workbench', version: 1, objects: [
    { id: 'sample-plinth', name: 'Foundation', shape: 'cube', color: '#58716f', position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [5.5, 0.4, 3.4] },
    { id: 'sample-cube', name: 'Mint block', shape: 'cube', color: '#71e4ce', position: [-1.5, 1.05, 0.3], rotation: [0, 0.22, 0], scale: [1.3, 1.3, 1.3] },
    { id: 'sample-tower', name: 'Lavender tower', shape: 'cube', color: '#b5a1ff', position: [0.25, 1.6, -0.5], rotation: [0, -0.16, 0], scale: [1.1, 2.4, 1.1] },
    { id: 'sample-sphere', name: 'Amber sphere', shape: 'sphere', color: '#f4be78', position: [1.65, 1.1, 0.55], rotation: [0, 0, 0], scale: [1.4, 1.4, 1.4] }
  ] };
}
const vec = (value: unknown, name: string, low: number, high: number): Vec3 => {
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < low || v > high)) throw new Error(`${name} must have three finite values from ${low} to ${high}.`);
  return [...value] as Vec3;
};
export function parseScene(text: string): SceneData {
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw new Error('Scene is too large (maximum 500 KB).');
  let d: unknown;
  try { d = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!d || typeof d !== 'object') throw new Error('This is not a scene file.');
  const data = d as Record<string, unknown>;
  if (data.format !== 'gesture-3d-workbench' || data.version !== 1) throw new Error('Unsupported scene format or version. Choose a version 1 Workbench scene.');
  if (!Array.isArray(data.objects) || data.objects.length > MAX_OBJECTS) throw new Error(`A scene may contain up to ${MAX_OBJECTS} objects.`);
  const ids = new Set<string>();
  const objects = data.objects.map((value: unknown): Item => {
    if (!value || typeof value !== 'object') throw new Error('Invalid object entry.');
    const o = value as Record<string, unknown>;
    if (typeof o.id !== 'string' || !/^[\w-]{1,80}$/.test(o.id) || ids.has(o.id)) throw new Error('Objects must have unique valid IDs.');
    ids.add(o.id);
    if (typeof o.name !== 'string' || o.name.length < 1 || o.name.length > 60 || /[\u0000-\u001f]/.test(o.name)) throw new Error('Object names must contain 1–60 printable characters.');
    if (o.shape !== 'cube' && o.shape !== 'sphere') throw new Error('Unsupported object shape.');
    if (typeof o.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.color)) throw new Error('Invalid object colour.');
    return { id: o.id, name: o.name, shape: o.shape, color: o.color, position: vec(o.position, 'Position', -100, 100), rotation: vec(o.rotation, 'Rotation', -Math.PI * 100, Math.PI * 100), scale: vec(o.scale, 'Scale', 0.05, 20) };
  });
  return { format: 'gesture-3d-workbench', version: 1, objects };
}

/** A drag is a single transaction; snapshots are bounded and never alias live state. */
export class History {
  state: SceneData;
  private past: SceneData[] = [];
  private future: SceneData[] = [];
  private baseline: SceneData | null = null;
  constructor(initial: SceneData) { this.state = copy(initial); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get active() { return !!this.baseline; }
  begin() { if (!this.baseline) this.baseline = copy(this.state); }
  commit() {
    if (this.baseline && JSON.stringify(this.baseline) !== JSON.stringify(this.state)) {
      this.past.push(this.baseline); if (this.past.length > 80) this.past.shift(); this.future = [];
    }
    this.baseline = null;
  }
  cancel() { if (this.baseline) this.state = this.baseline; this.baseline = null; }
  change(fn: (state: SceneData) => void) { this.commit(); this.begin(); fn(this.state); this.commit(); }
  undo() { this.commit(); const s = this.past.pop(); if (s) { this.future.push(copy(this.state)); this.state = s; } }
  redo() { this.commit(); const s = this.future.pop(); if (s) { this.past.push(copy(this.state)); this.state = s; } }
}

export function transformDrag(start: Item, mode: Mode, constraint: Constraint, dx: number, dy: number, worldDelta: Vec3, snapping: boolean): Item {
  const item = copy(start);
  if (mode === 'move') {
    const delta: Vec3 = constraint === 'x' ? [dx * 12, 0, 0] : constraint === 'y' ? [0, -dy * 12, 0] : constraint === 'z' ? [0, 0, dy * 12] : worldDelta;
    item.position = start.position.map((v, i) => delta[i] === 0 ? v : clamp(snap(v + delta[i], snapping ? 0.25 : 0), -100, 100)) as Vec3;
  } else if (mode === 'rotate') {
    const delta: Vec3 = constraint === 'x' ? [-dy * Math.PI * 2, 0, 0] : constraint === 'z' ? [0, 0, dx * Math.PI * 2] : constraint === 'y' || constraint === 'floor' ? [0, dx * Math.PI * 2, 0] : [-dy * Math.PI * 2, dx * Math.PI * 2, 0];
    item.rotation = start.rotation.map((v, i) => delta[i] === 0 ? v : clamp(snap(v + delta[i], snapping ? Math.PI / 12 : 0), -Math.PI * 100, Math.PI * 100)) as Vec3;
  } else {
    const factor = Math.exp(-dy * 3);
    item.scale = start.scale.map((v, i) => {
      const apply = constraint === 'screen' || constraint === 'floor' || ['x','y','z'][i] === constraint;
      return apply ? clamp(snap(v * factor, snapping ? 0.1 : 0), 0.05, 20) : v;
    }) as Vec3;
  }
  return item;
}
