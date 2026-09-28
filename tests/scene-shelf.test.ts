import { describe,it,expect } from 'vitest';
import { addToShelf,readShelf } from '../src/scene-shelf';
import { sampleScene } from '../src/model';
describe('hands-only local shelf',()=>{
  it('saves a validated independent snapshot without a filename',()=>{const scene=sampleScene(),entries=addToShelf([],scene);scene.objects=[];expect(readShelf(JSON.stringify({version:1,entries}))[0].scene.objects).toHaveLength(4);expect(entries[0].name).toContain('Assembly');});
  it('bounds slots without silently overwriting existing scenes',()=>{let entries=addToShelf([],sampleScene());for(let i=1;i<6;i++)entries=addToShelf(entries,sampleScene());expect(()=>addToShelf(entries,sampleScene())).toThrow(/full/);expect(entries).toHaveLength(6);});
  it('rejects invalid or future scene data in stored entries',()=>{const entries=addToShelf([],sampleScene());(entries[0].scene as any).version=2;expect(()=>readShelf(JSON.stringify({version:1,entries}))).toThrow();expect(()=>readShelf('{}')).toThrow();expect(readShelf(null)).toEqual([]);});
});
