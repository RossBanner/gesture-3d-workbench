import { parseScene, type SceneData } from './model';
export interface ShelfEntry {id:string;name:string;scene:SceneData}
export function readShelf(text:string|null):ShelfEntry[]{
  if(!text)return [];
  if(text.length>2_500_000)throw new Error('Saved scene shelf is too large.');
  const data=JSON.parse(text);
  if(!data||data.version!==1||!Array.isArray(data.entries)||data.entries.length>6)throw new Error('Saved scene shelf is invalid.');
  const ids=new Set<string>();
  return data.entries.map((entry:unknown)=>{
    if(!entry||typeof entry!=='object')throw new Error('Saved scene is invalid.');
    const e=entry as Record<string,unknown>;
    if(typeof e.id!=='string'||!/^[\w-]{1,80}$/.test(e.id)||ids.has(e.id)||typeof e.name!=='string'||e.name.length>80)throw new Error('Saved scene is invalid.');
    ids.add(e.id);return {id:e.id,name:e.name,scene:parseScene(JSON.stringify(e.scene))};
  });
}
export function addToShelf(entries:ShelfEntry[],scene:SceneData,now=new Date()):ShelfEntry[]{
  if(entries.length>=6)throw new Error('All 6 shelf slots are full. Remove a saved scene before keeping another.');
  const entry={id:crypto.randomUUID(),name:`Assembly · ${now.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`,scene:parseScene(JSON.stringify(scene))};
  const result=[entry,...entries];readShelf(JSON.stringify({version:1,entries:result}));return result;
}
