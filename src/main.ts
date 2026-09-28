import './style.css';
import { Workspace } from './workspace';
import { History, sampleScene, newItem, copy, parseScene, transformDrag, clamp, MAX_OBJECTS, type Item, type Mode, type Constraint, type Vec3 } from './model';
import { GestureMachine, type GestureEvent, type Point, type Landmark } from './gesture';
import { HandCamera } from './camera';
import { HandsController } from './hands-controller';
import { readShelf, addToShelf } from './scene-shelf';
import type { Plane } from 'three';

const icons: Record<string,string> = {
  cube:'M12 3 3 8v9l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v9', sphere:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  move:'M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3', rotate:'M20 7v5h-5 M20 12a8 8 0 1 0-3 6', scale:'M4 9V4h5 M15 20h5v-5 M4 4l6 6 M20 20l-6-6',
  undo:'M8 4 3 9l5 5 M3 9h10a7 7 0 0 1 0 14', redo:'m16 4 5 5-5 5 M21 9H11a7 7 0 0 0 0 14', save:'M5 3h12l4 4v14H3V3Z M7 3v7h10V3 M7 21v-7h10v7', folder:'M3 6h7l2 3h9v11H3Z',
  camera:'M3 7h13v12H3Z M16 11l5-3v10l-5-3', help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17v1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  home:'M3 11 12 3l9 8 M6 9v12h12V9', focus:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6 M9 12h6 M12 9v6', trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  duplicate:'M9 9h12v12H9Z M15 9V3H3v12h6', refresh:'M20 3v6h-6 M4 21v-6h6 M20 9a8 8 0 0 0-14-4 M4 15a8 8 0 0 0 14 4', hand:'M8 12V5a2 2 0 0 1 4 0v6 M12 11V4a2 2 0 0 1 4 0v8 M16 12V7a2 2 0 0 1 4 0v9a7 7 0 0 1-13 4l-4-7a2 2 0 0 1 3-2l2 3', check:'m5 12 4 4L19 6', grid:'M3 3h18v18H3Z M3 9h18 M3 15h18 M9 3v18 M15 3v18', close:'m6 6 12 12 M6 18 18 6'
};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]??icons.cube}"/></svg>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string,label:string,i:string,extra='')=>`<button id="${id}" ${extra}>${icon(i)}<span>${label}</span></button>`;
document.querySelector('#app')!.innerHTML=`
<header class="topbar"><div class="brand"><div class="brand-mark">${icon('cube')}</div><div>Gesture <b>3D</b><small>WORKBENCH</small></div></div><div class="project"><span class="dot"></span><span id="scene-title">Untitled assembly</span><span id="save-state">Local workspace</span></div><div class="header-actions">${button('open','Open','folder','title="Open scene (Ctrl+O)"')}${button('save','Save scene','save','class="primary" title="Save scene (Ctrl+S)"')}<button id="help" class="icon-button" aria-label="Help" title="Help (?)">${icon('help')}</button></div></header>
<div class="body-layout"><aside class="library"><div class="section-label">CREATE</div><h2>Your building blocks</h2><div class="shape-buttons"><button id="add-cube">${icon('cube')}<span>Cube</span><kbd>C</kbd></button><button id="add-sphere">${icon('sphere')}<span>Sphere</span><kbd>B</kbd></button></div><div class="scene-heading"><span class="section-label">SCENE</span><span id="object-count" class="count">4</span></div><div id="objects" class="object-list" role="list" aria-label="Scene objects"></div><div class="library-footer"><div class="mini-grid"></div><h3>Make room for ideas.</h3><p>Build a small world.<br>Move it with your hands.</p>${button('reset','Reset sample','refresh')}</div></aside>
<main class="main-workspace"><nav class="toolbar" aria-label="Editing tools"><div class="mode-group">${button('mode-move','Move','move','class="active" title="Move mode (G)"')}${button('mode-rotate','Rotate','rotate','title="Rotate mode (R)"')}${button('mode-scale','Scale','scale','title="Scale mode (S)"')}</div><span class="divider"></span><label class="plane-label" for="constraint">Along</label><select id="constraint" aria-label="Movement constraint"><option value="screen">Screen plane</option><option value="floor">Floor plane</option><option value="x">X axis</option><option value="y">Y axis · height</option><option value="z">Z axis · depth</option></select><button id="snap" class="compact" aria-pressed="false" title="Snap (N): 0.25 units, 15°, 0.1 scale">${icon('grid')}<span>Snap</span></button><div class="toolbar-end"><button id="undo" class="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button><button id="redo" class="icon-button" title="Redo (Ctrl+Y)" aria-label="Redo">${icon('redo')}</button></div></nav>
<div id="viewport" class="viewport"><div class="viewport-title"><span class="eyebrow">PERSPECTIVE</span><h1>A little space to create.</h1><p id="view-subtitle">Select a shape. Make it yours.</p></div><div class="view-actions"><button id="home" class="icon-button" aria-label="Reset view" title="Reset view (H)">${icon('home')}</button><button id="focus" class="icon-button" aria-label="Focus selection" title="Focus selected object (F)">${icon('focus')}</button><button id="top" title="Top view">Top</button></div><div id="demo-banner" hidden>DEMO INPUT · Move your pointer and hold Space to pinch. No camera tracking.</div><div id="hand-cursor" hidden><span></span><small id="cursor-label">Open hand</small></div><div id="grab-hint" hidden></div><div class="viewport-footer"><span class="axis-key"><b>X</b> <i>Y</i> <em>Z</em></span><span>Right drag to orbit <span>·</span> Wheel to zoom <span>·</span> Middle drag to pan</span></div></div>
<section class="tracking-panel" aria-label="Hand tracking"><div class="preview"><video id="camera-preview" muted playsinline></video><canvas id="landmarks" width="240" height="180"></canvas><div id="preview-empty">${icon('hand')}<span>Your camera stays off<br>until you start it.</span></div><span id="preview-badge">CAMERA OFF</span></div><div class="tracking-content"><div class="tracking-heading"><h2>Put your ideas in motion</h2><span id="tracking-chip" class="status-chip">Camera off</span></div><p id="camera-message" role="status">Start your webcam, then show your hands. No keyboard needed after Start.</p><div class="camera-actions"><select id="camera-select" aria-label="Camera"><option value="">Default camera</option></select><button id="refresh-cameras" class="icon-button" aria-label="Refresh cameras" title="Refresh camera list">${icon('refresh')}</button>${button('start-camera','Start Camera','camera','class="primary"')}<button id="stop-camera" disabled>Stop</button></div><div class="tracking-foot"><span><span class="privacy-dot"></span>Local processing · No recording</span><button id="demo">Try demo input</button></div></div><div class="gesture-guide"><div><span>01</span><p><b>One pinch</b>Move across screen</p></div><div><span>02</span><p><b>Two pinches</b>Resize / steering turn</p></div><div><span>03</span><p><b>Pinch a tool</b>Depth Z / Rotate / Size</p></div></div></section></main>
<aside class="inspector"><div class="section-label">INSPECTOR</div><div id="inspector-empty"><div>${icon('cube')}</div><h2>Select something</h2><p>Click a shape in the scene or point and pinch to make it yours.</p></div><div id="inspector-fields" hidden><div class="selected-heading"><span id="selected-icon">${icon('cube')}</span><div><h2 id="selected-title">Mint block</h2><span id="selected-type">Cube</span></div></div><label class="field-label" for="object-name">Name</label><input id="object-name" maxlength="60" autocomplete="off"><div class="color-heading"><label class="field-label" for="object-color">Colour</label><span id="color-hex"></span></div><div class="color-row"><input id="object-color" type="color" aria-label="Object colour"><div class="swatches">${['#71e4ce','#b5a1ff','#f4be78','#ee8e92','#8cb9e8','#e4e9df'].map(c=>`<button class="swatch" data-color="${c}" style="--swatch:${c}" aria-label="Set colour ${c}"></button>`).join('')}</div></div>${(['position','rotation','scale'] as const).map(group=>`<div class="transform-heading"><span class="field-label">${group[0].toUpperCase()+group.slice(1)}</span><span>${group==='rotation'?'degrees':group==='position'?'scene units':'multiplier'}</span></div><div class="vector-fields">${['x','y','z'].map((axis,i)=>`<label><span class="axis-${axis}">${axis.toUpperCase()}</span><input id="${group}-${i}" type="number" step="any" aria-label="${group} ${axis}" min="${group==='scale'?'.05':group==='rotation'?'-18000':'-100'}" max="${group==='scale'?'20':group==='rotation'?'18000':'100'}"></label>`).join('')}</div>`).join('')}<div class="inspector-buttons">${button('duplicate','Duplicate','duplicate','title="Duplicate (Ctrl+D)"')}${button('delete','Delete','trash','title="Delete selected object"')}</div></div><div class="mode-note"><span class="section-label">MOUSE / DEMO TOOL</span><h3 id="mode-title">Move on screen</h3><p id="mode-description">Grab and move across the screen. The object stays on a plane through its starting position.</p></div><div class="local-note">${icon('check')}<p>Yours, on this computer.<br><span>Use Save scene to keep a portable copy.</span></p></div></aside></div>
<footer class="statusbar"><span><span class="dot"></span>WORKBENCH <b>1.2</b></span><span id="selection-status">4 objects · Nothing selected</span><span id="performance">Ready</span></footer><div id="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close icon-button" aria-label="Close help">${icon('close')}</button><span class="eyebrow">WELCOME TO YOUR WORKBENCH</span><h2>A new way to move ideas.</h2><p class="dialog-intro">Build a 3D assembly with your mouse or a webcam.<br>Everything happens on this computer.</p><div class="help-columns"><section><h3>${icon('hand')} With your hands</h3><ol><li>Choose your webcam and click <b>Start Camera</b>.</li><li>Show both hands in good light. The preview is mirrored, like a mirror.</li><li>Pinch a shape with one hand to move. Open your fingers to place it.</li><li>Pinch <b>Rotate</b>, open, then pinch a shape. Move sideways to turn or up/down to tilt. A second pinch can steer the rotation.</li></ol><p>Pinch <b>Depth Z</b>, open, then pinch a shape and slide up/down. Only Z changes; size stays fixed. In Move, an optional second-hand <b>fist</b> locks the same depth control until you deliberately open the helper palm. In Move, two pinches spread/squeeze to resize and turn like a steering wheel to roll. Pinch <b>Hand menu</b> for add, colour, undo and saved scenes. Pinch empty space to orbit; add a second pinch to zoom. The toolbar modes apply to the mouse.</p></section><section><h3>${icon('move')} With your mouse</h3><p>Click an object to select it. Left drag edits with the current mode. Right drag orbits, middle drag pans, and the wheel zooms. Every value is also editable in the inspector.</p><div class="shortcuts"><span><kbd>G</kbd><kbd>R</kbd><kbd>S</kbd> Move / Rotate / Scale</span><span><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> Axis (press again for screen)</span><span><kbd>C</kbd><kbd>B</kbd> Add cube / sphere</span><span><kbd>F</kbd> Focus <kbd>H</kbd> Home <kbd>N</kbd> Snap</span><span><kbd>Del</kbd> Delete <kbd>Ctrl D</kbd> Duplicate</span><span><kbd>Ctrl Z / Y</kbd> Undo / redo</span><span><kbd>Ctrl S / O</kbd> Save / open scene</span><span><kbd>Esc</kbd> Cancel grab <kbd>↑ ↓ ← →</kbd> Nudge X/Z</span><span><kbd>PgUp / PgDn</kbd> Nudge height</span></div></section></div><div class="help-bottom"><p><b>Try it without a camera.</b> Demo input uses your pointer and Space to simulate a pinch. It tests interaction, not webcam tracking. Scene units are creative coordinates, not measured room depth.</p><button id="begin" class="primary">Let’s build ${icon('move')}</button></div></dialog>`;

let initial=sampleScene(), restoreNotice='';
try { const saved=localStorage.getItem('g3d-recovery-v1'); if(saved){initial=parseScene(saved);restoreNotice='Recovered your last local workspace.';} } catch { restoreNotice='Could not restore the last workspace. The sample scene is ready.'; }
const history=new History(initial);
let selected:string|null='sample-cube';
if(!initial.objects.some(o=>o.id===selected))selected=initial.objects[0]?.id??null;
let mode:Mode='move', constraint:Constraint='screen', snapping=false, demo=false, space=false, pointer:Point={x:.5,y:.5};
let mousePointerId:number|null=null, modalBusy=false;
let drag: { id:string; start:Item; point:Point; plane:Plane; hit:Vec3; source:'mouse'|'hand' } | null=null;
let toastTimer=0, lastHand=0;
const machine=new GestureMachine();
let hands:HandsController|undefined;
let world:Workspace;
try { world=new Workspace($('viewport')); } catch(error) { $('viewport').innerHTML='<div class="render-error"><h2>Could not start the 3D view</h2><p>Close other GPU-heavy apps and restart the workbench. A WebGL-capable graphics driver is required.</p></div>'; throw error; }
const video=$<HTMLVideoElement>('camera-preview');
const overlay=$<HTMLCanvasElement>('landmarks'), ctx=overlay.getContext('2d')!;
const camera=new HandCamera(video,status=>{
  $('camera-message').textContent=status.message;
  $('tracking-chip').textContent=status.state==='running'?`Live · ${status.delegate}`:status.state==='starting'?'Starting…':status.state==='error'?'Needs attention':'Camera off';
  $('tracking-chip').classList.toggle('live',status.state==='running');
  $<HTMLButtonElement>('start-camera').disabled=status.state==='starting'||status.state==='running';
  $<HTMLButtonElement>('stop-camera').disabled=status.state==='off'||status.state==='error';
  $<HTMLSelectElement>('camera-select').disabled=status.state==='starting'||status.state==='running';
  $('preview-empty').hidden=status.state==='running';
  $('preview-badge').textContent=status.state==='running'?'LIVE · MIRRORED':status.state==='starting'?'STARTING':'CAMERA OFF';
  if(status.state==='running')void refreshCameras();
  if(status.state==='error')toast(status.message,true);
},(detections,ms)=>{
  ctx.clearRect(0,0,240,180);if(detections.length){ctx.strokeStyle='#c8ebbd66';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(.12*240,.20*180,.76*240,.60*180);ctx.setLineDash([]);}detections.forEach((h,i)=>drawLandmarks(h.landmarks,i));
  if(demo)return;
  if(!document.hasFocus()||modalBusy||$<HTMLDialogElement>('help-dialog').open||drag?.source==='mouse'){hands?.reset();return;}
  if(detections.length)lastHand=performance.now();
  hands?.update(detections,performance.now(),video.videoWidth/Math.max(1,video.videoHeight)||4/3);
  if(camera.state==='running'){
    $('camera-message').textContent=`${detections.length}/2 hands · ${hands?.status??'Show an open hand'} · ${Math.round(ms)} ms`;
  }
});
hands=new HandsController(world,{
  begin(id){endDrag();selected=id;history.begin();render();return copy(item()!);},
  update(next){const index=history.state.objects.findIndex(o=>o.id===next.id);if(index<0)return;history.state.objects[index]=next;world.sync(history.state,selected);for(const group of ['position','rotation','scale'] as const)for(let i=0;i<3;i++)$<HTMLInputElement>(`${group}-${i}`).value=String(Number((next[group][i]*(group==='rotation'?180/Math.PI:1)).toFixed(3)));},
  finish(cancel){cancel?history.cancel():history.commit();render();persist();},
  command:handCommand,snapping:()=>snapping
});
function handCommand(command:string){
  if(command==='cube')add('cube');else if(command==='sphere')add('sphere');else if(command==='duplicate')duplicate();else if(command==='delete')remove();else if(command==='undo')undo();else if(command==='redo')undo(true);else if(command==='home')world.home();else if(command==='top')world.top();else if(command==='focus')world.focus(selected);else if(command==='snap')$('snap').click();else if(command==='stop'){camera.stop();resetGesture();}
  else if(command==='colour'){const colors=['#71e4ce','#b5a1ff','#f4be78','#ee8e92','#8cb9e8','#e4e9df'];edit(o=>o.color=colors[(colors.indexOf(o.color)+1)%colors.length]);}
  else if(command==='keep'){try{const entries=addToShelf(readShelf(localStorage.getItem('g3d-shelf-v1')),history.state);localStorage.setItem('g3d-shelf-v1',JSON.stringify({version:1,entries}));toast('Scene kept on your local shelf. No filename needed.');showShelf();}catch(e){toast((e as Error).message,true);}}
  else if(command==='shelf')showShelf();
  else if(command.startsWith('load:')){try{const entry=readShelf(localStorage.getItem('g3d-shelf-v1')).find(e=>e.id===command.slice(5));if(!entry)throw new Error('Saved scene not found.');history.change(s=>{s.objects=copy(entry.scene.objects);});selected=history.state.objects[0]?.id??null;render();persist();toast('Shelf scene opened. Undo restores your previous assembly.');}catch(e){toast((e as Error).message,true);}}
  else if(command.startsWith('forget:')){try{const entries=readShelf(localStorage.getItem('g3d-shelf-v1')).filter(e=>e.id!==command.slice(7));localStorage.setItem('g3d-shelf-v1',JSON.stringify({version:1,entries}));showShelf();}catch(e){toast((e as Error).message,true);}}
}
function showShelf(){
  const container=$('hand-shelf');$('hand-menu').classList.add('shelf-open');container.hidden=false;container.replaceChildren();
  try{const entries=readShelf(localStorage.getItem('g3d-shelf-v1'));const label=document.createElement('p');label.textContent=entries.length?'LOCAL SHELF · pinch a scene to open it':'Your shelf is empty. Choose Keep scene to save here.';container.append(label);
    for(const entry of entries){const row=document.createElement('div');row.className='shelf-row';const load=document.createElement('button');load.textContent=entry.name;hands!.bindCommandButton(load,`load:${entry.id}`);const forget=document.createElement('button');forget.textContent='Remove copy';hands!.bindCommandButton(forget,`forget:${entry.id}`);row.append(load,forget);container.append(row);}
  }catch(e){toast((e as Error).message,true);}
}
function item(){return history.state.objects.find(o=>o.id===selected);}
function toast(message:string,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;$('toast').classList.toggle('error',error);toastTimer=window.setTimeout(()=>$('toast').hidden=true,error?8000:3800);}
function persist(){try{localStorage.setItem('g3d-recovery-v1',JSON.stringify(history.state));$('save-state').textContent='Workspace recovered locally';}catch{$('save-state').textContent='Use Save scene to keep changes';}}
function render(updateFields=true){
  world.sync(history.state,selected);
  $('object-count').textContent=String(history.state.objects.length);
  const list=$('objects');list.replaceChildren();
  history.state.objects.forEach(o=>{
    const row=document.createElement('button');row.className=`object-row ${selected===o.id?'selected':''}`;row.setAttribute('role','listitem');row.setAttribute('aria-label',`Select ${o.name}`);row.setAttribute('aria-pressed',String(selected===o.id));
    row.innerHTML=`<span class="object-dot"></span>${icon(o.shape)}<span class="object-name"></span><span class="row-arrow">↗</span>`;
    row.querySelector<HTMLElement>('.object-dot')!.style.background=o.color;row.querySelector('.object-name')!.textContent=o.name;
    row.onclick=()=>{endDrag();resetGesture();selected=o.id;render();};list.append(row);
  });
  const o=item();$('inspector-empty').hidden=!!o;$('inspector-fields').hidden=!o;
  if(o&&updateFields){
    $('selected-title').textContent=o.name;$('selected-type').textContent=o.shape==='cube'?'Cube':'Sphere';$('selected-icon').innerHTML=icon(o.shape);
    $<HTMLInputElement>('object-name').value=o.name;$<HTMLInputElement>('object-color').value=o.color;$('color-hex').textContent=o.color.toUpperCase();
    for(const group of ['position','rotation','scale'] as const)for(let i=0;i<3;i++)$<HTMLInputElement>(`${group}-${i}`).value=String(Number((o[group][i]*(group==='rotation'?180/Math.PI:1)).toFixed(3)));
  }
  $<HTMLButtonElement>('undo').disabled=!history.canUndo;$<HTMLButtonElement>('redo').disabled=!history.canRedo;
  $('selection-status').textContent=`${history.state.objects.length} objects · ${o?o.name:'Nothing selected'}`;
  $('view-subtitle').textContent=o?`${o.name} selected · ${mode==='move'?'Drag to move':mode==='rotate'?'Drag to rotate':'Drag upward to enlarge'}`:'Select a shape. Make it yours.';
}
function edit(fn:(o:Item)=>void){endDrag();hands?.reset();if(!item())return;history.change(()=>fn(item()!));render();persist();}
function endDrag(cancel=false){if(!drag)return;drag=null;mousePointerId=null;world.controls.enabled=true;if(cancel)history.cancel();else history.commit();$('grab-hint').hidden=true;render();persist();}
function resetGesture(){processGestures(machine.reset());hands?.reset();$('hand-cursor').hidden=true;space=false;}
function beginDrag(p:Point,source:'mouse'|'hand'){
  if(modalBusy||$<HTMLDialogElement>('help-dialog').open||drag)return;
  const id=world.pick(p);if(!id){if(source==='mouse'){selected=null;render();}return;}
  selected=id;const o=item()!;const plane=world.makePlane(o,constraint),hit=world.intersect(p,plane);if(!hit)return;
  history.begin();drag={id,start:copy(o),point:{...p},plane,hit,source};world.controls.enabled=false;render();
  $('grab-hint').textContent=`${mode==='move'?'Moving':mode==='rotate'?'Rotating':'Scaling'} ${o.name} · ${source==='hand'?'Open hand to place':'Release to place'} · Esc to cancel`;$('grab-hint').hidden=false;
}
function moveDrag(p:Point){
  if(!drag)return;const hit=world.intersect(p,drag.plane);if(!hit)return;
  const delta=hit.map((v,i)=>v-drag!.hit[i]) as Vec3;
  const updated=transformDrag(drag.start,mode,constraint,p.x-drag.point.x,p.y-drag.point.y,delta,snapping);
  const index=history.state.objects.findIndex(o=>o.id===drag!.id);if(index<0){endDrag();return;}history.state.objects[index]=updated;world.sync(history.state,selected);
  for(const group of ['position','rotation','scale'] as const)for(let i=0;i<3;i++)$<HTMLInputElement>(`${group}-${i}`).value=String(Number((updated[group][i]*(group==='rotation'?180/Math.PI:1)).toFixed(3)));
}
function processGestures(events:GestureEvent[]){
  for(const event of events){if(event.type==='start')beginDrag(event.point,'hand');if(event.type==='move'&&drag?.source==='hand')moveDrag(event.point);if((event.type==='end'||event.type==='lost')&&drag?.source==='hand'){endDrag();if(event.type==='lost')toast('Tracking paused. Object placed safely. Open your hand to grab again.');}}
}
function phaseLabel(){return machine.phase==='waiting'?'Open hand to get ready':machine.phase==='ready'?'Aim at a shape, then pinch':machine.phase==='pinching'?'Hold pinch briefly…':machine.phase==='holding'?(drag?'Holding · open to release':'Pinch missed · open to try again'):'Releasing…';}
function showCursor(show:boolean){const cursor=$('hand-cursor');cursor.hidden=!show;if(!show)return;cursor.style.left=`${machine.point.x*100}%`;cursor.style.top=`${machine.point.y*100}%`;cursor.classList.toggle('holding',machine.phase==='holding'||machine.phase==='releasing');$('cursor-label').textContent=machine.phase==='holding'?(drag?'Grabbed':'No object'):machine.phase==='waiting'?'Open hand':machine.phase==='pinching'?'Pinching…':'Ready';}
const connections=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
function drawLandmarks(points:Landmark[]|null,index=0){if(!points)return;ctx.strokeStyle=index?'#e4b8ff':'#91ffe0';ctx.lineWidth=2;for(const chain of connections){ctx.beginPath();chain.forEach((i,j)=>{const x=(1-points[i].x)*240,y=points[i].y*180;j?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}ctx.fillStyle=index?'#e4b8ff':'#fff';for(const p of points){ctx.beginPath();ctx.arc((1-p.x)*240,p.y*180,2,0,Math.PI*2);ctx.fill();}}
function setMode(next:Mode){endDrag();resetGesture();mode=next;for(const m of ['move','rotate','scale'])$(`mode-${m}`).classList.toggle('active',m===mode);modeHelp();render();}
function modeHelp(){
  const labels={screen:'screen',floor:'the floor',x:'X',y:'Y (height)',z:'Z (depth)'};
  $('mode-title').textContent=`${mode[0].toUpperCase()+mode.slice(1)} ${mode==='move'?'on':'along'} ${labels[constraint]}`;
  $('mode-description').textContent=mode==='scale'?'Drag upward to enlarge; downward to shrink. Screen and Floor scale all axes together.':mode==='rotate'?'Drag sideways or up/down to turn the object. Choose X, Y or Z for one rotation axis.':constraint==='screen'?'Grab and move across the screen. The object stays on a plane through its starting position.':constraint==='floor'?'Move across a horizontal plane. The object keeps its starting height.':constraint==='y'?'Move your hand or pointer upward to lift, downward to lower.':constraint==='z'?'Move your hand or pointer downward to increase Z, upward to decrease it.':'Move your hand or pointer sideways to change X.';
}
function add(shape:'cube'|'sphere'){endDrag();resetGesture();if(history.state.objects.length>=MAX_OBJECTS){toast('This scene has reached its 200-object limit.',true);return;}const o=newItem(shape,history.state.objects.filter(i=>i.shape===shape).length+1);history.change(s=>s.objects.push(o));selected=o.id;render();persist();toast(`${o.name} added.`);}
function remove(){endDrag();resetGesture();if(!selected)return;history.change(s=>{s.objects=s.objects.filter(o=>o.id!==selected);});selected=null;render();persist();}
function duplicate(){endDrag();resetGesture();if(!item())return;if(history.state.objects.length>=MAX_OBJECTS){toast('This scene has reached its 200-object limit.',true);return;}const o=copy(item()!);o.id=crypto.randomUUID();o.name=`${o.name.slice(0,53)} copy`;o.position[0]=clamp(o.position[0]+.5,-100,100);history.change(s=>s.objects.push(o));selected=o.id;render();persist();}
function undo(redo=false){endDrag();resetGesture();redo?history.redo():history.undo();if(!item())selected=null;render();persist();}
async function refreshCameras(){try{const select=$<HTMLSelectElement>('camera-select'),prev=select.value,devices=await camera.devices();select.replaceChildren(new Option('Default camera',''));devices.forEach((d,i)=>select.add(new Option(d.label||`Camera ${i+1}`,d.deviceId)));if([...select.options].some(o=>o.value===prev))select.value=prev;}catch{toast('Could not list cameras. Try the default camera.',true);}}
function setDemo(enabled:boolean){endDrag();resetGesture();if(enabled)camera.stop();demo=enabled;$('demo-banner').hidden=!enabled;$('demo').textContent=enabled?'Exit demo input':'Try demo input';$('tracking-chip').textContent=enabled?'Demo · synthetic input':'Camera off';$('camera-message').textContent=enabled?'Move the pointer into the scene. Hold Space to simulate a pinch.':'Start your webcam, then show your hands. No keyboard needed after Start.';if(enabled){world.home();toast('Demo input enabled. Point at a shape and hold Space.');}}
async function save(){endDrag();resetGesture();modalBusy=true;try{const text=JSON.stringify(parseScene(JSON.stringify(history.state)),null,2);if(window.workbench){const r=await window.workbench.saveScene(text);if(r.error)throw new Error(r.error);if(r.name){$('scene-title').textContent=r.name;$('save-state').textContent='Scene saved';toast('Scene saved to your computer.');}}else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='My assembly.g3d.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(e){toast((e as Error).message,true);}finally{modalBusy=false;}}
async function open(){endDrag();resetGesture();modalBusy=true;try{if(!window.workbench){toast('Use the desktop app to open scene files.',true);return;}const r=await window.workbench.openScene();if(r.error)throw new Error(r.error);if(r.text!==undefined){const scene=parseScene(r.text);history.change(s=>{s.objects=scene.objects;});selected=scene.objects[0]?.id??null;$('scene-title').textContent=r.name??'Opened scene';render();persist();toast('Scene opened. Undo returns to your previous scene.');}}catch(e){toast((e as Error).message,true);}finally{modalBusy=false;}}
function showHelp(){endDrag();resetGesture();$<HTMLDialogElement>('help-dialog').showModal();}
function closeHelp(){$<HTMLDialogElement>('help-dialog').close();try{localStorage.setItem('g3d-welcomed','yes');}catch{}}

for(const m of ['move','rotate','scale'] as const)$(`mode-${m}`).onclick=()=>setMode(m);
$<HTMLSelectElement>('constraint').onchange=()=>{endDrag();resetGesture();constraint=$<HTMLSelectElement>('constraint').value as Constraint;modeHelp();};
$('snap').onclick=()=>{endDrag();resetGesture();snapping=!snapping;$('snap').classList.toggle('active',snapping);$('snap').setAttribute('aria-pressed',String(snapping));};
$('add-cube').onclick=()=>add('cube');$('add-sphere').onclick=()=>add('sphere');$('delete').onclick=remove;$('duplicate').onclick=duplicate;$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);
$('reset').onclick=()=>{endDrag();resetGesture();history.change(s=>{s.objects=sampleScene().objects;});selected='sample-cube';world.home();render();persist();$('scene-title').textContent='Untitled assembly';toast('Sample scene restored. Undo brings back your work.');};
$('home').onclick=()=>{endDrag();resetGesture();world.home();};$('focus').onclick=()=>{endDrag();resetGesture();world.focus(selected);};$('top').onclick=()=>{endDrag();resetGesture();world.top();};
$('save').onclick=()=>void save();$('open').onclick=()=>void open();$('help').onclick=showHelp;$('close-help').onclick=closeHelp;$('begin').onclick=closeHelp;
$('demo').onclick=()=>setDemo(!demo);$('refresh-cameras').onclick=()=>void refreshCameras();
$('start-camera').onclick=()=>{if(demo)setDemo(false);endDrag();resetGesture();void camera.start($<HTMLSelectElement>('camera-select').value);};$('stop-camera').onclick=()=>{camera.stop();resetGesture();};
$<HTMLInputElement>('object-name').onchange=()=>{const value=$<HTMLInputElement>('object-name').value.trim();if(!value||/[\u0000-\u001f]/.test(value)){toast('Use a name with 1–60 printable characters.',true);render();return;}edit(o=>o.name=value);};
$<HTMLInputElement>('object-color').onchange=()=>edit(o=>o.color=$<HTMLInputElement>('object-color').value);
document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(b=>b.onclick=()=>edit(o=>o.color=b.dataset.color!));
for(const group of ['position','rotation','scale'] as const)for(let i=0;i<3;i++){
  const input=$<HTMLInputElement>(`${group}-${i}`);input.onchange=()=>{const v=input.valueAsNumber;if(!Number.isFinite(v)||!input.checkValidity()){toast('Enter a value within the field’s allowed range.',true);render();return;}edit(o=>o[group][i]=v*(group==='rotation'?Math.PI/180:1));};
}
const canvas=world.renderer.domElement;
function normalized(e:PointerEvent):Point{const r=canvas.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};}
canvas.addEventListener('pointerdown',e=>{pointer=normalized(e);if(e.button!==0){endDrag();resetGesture();return;}if(demo)return;endDrag();resetGesture();beginDrag(pointer,'mouse');if(drag){mousePointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{pointer=normalized(e);if(drag?.source==='mouse'&&mousePointerId===e.pointerId)moveDrag(pointer);});
canvas.addEventListener('pointerup',e=>{if(mousePointerId===e.pointerId)endDrag();});canvas.addEventListener('pointercancel',()=>endDrag(true));canvas.addEventListener('lostpointercapture',()=>{if(drag?.source==='mouse')endDrag();});
canvas.addEventListener('pointerleave',()=>{if(demo){space=false;resetGesture();}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',()=>{endDrag();resetGesture();},{passive:true});
window.addEventListener('keydown',e=>{
  const input=e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement;
  if(e.key==='Escape'){if(hands?.active){hands.cancel();e.preventDefault();}if(drag){endDrag(true);resetGesture();e.preventDefault();}return;}
  if(input||$<HTMLDialogElement>('help-dialog').open||modalBusy)return;
  if(demo&&e.code==='Space'){e.preventDefault();space=true;return;}
  const key=e.key.toLowerCase();
  if(e.ctrlKey||e.metaKey){if(['s','o','z','y','d'].includes(key))e.preventDefault();if(key==='s')void save();if(key==='o')void open();if(key==='z')undo(e.shiftKey);if(key==='y')undo(true);if(key==='d')duplicate();return;}
  if(key==='g')setMode('move');if(key==='r')setMode('rotate');if(key==='s')setMode('scale');if(key==='c')add('cube');if(key==='b')add('sphere');if(key==='delete'||key==='backspace'){e.preventDefault();remove();}if(key==='f')$('focus').click();if(key==='h')$('home').click();if(key==='n')$('snap').click();if(key==='?')showHelp();
  if(['x','y','z'].includes(key)){endDrag();resetGesture();constraint=constraint===key?'screen':key as Constraint;$<HTMLSelectElement>('constraint').value=constraint;modeHelp();}
  const nudges:Record<string,Vec3>={ArrowLeft:[-1,0,0],ArrowRight:[1,0,0],ArrowUp:[0,0,-1],ArrowDown:[0,0,1],PageUp:[0,1,0],PageDown:[0,-1,0]};
  if(nudges[e.key]){e.preventDefault();const d=nudges[e.key];edit(o=>o.position=o.position.map((v,i)=>clamp(v+d[i]*(e.shiftKey?1:snapping?.25:.1),-100,100)) as Vec3);}
});
window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;e.preventDefault();}});
window.addEventListener('blur',()=>{endDrag();resetGesture();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){camera.stop();endDrag();resetGesture();}});
window.addEventListener('beforeunload',()=>{endDrag();camera.stop();world.dispose();});
navigator.mediaDevices?.addEventListener('devicechange',()=>void refreshCameras());
let demoTime=0;
function demoTick(time:number){if(demo&&time-demoTime>33&&!$<HTMLDialogElement>('help-dialog').open&&!modalBusy){demoTime=time;processGestures(machine.update({...pointer,pinch:space?.1:.8,identity:'synthetic'},time));showCursor(true);}requestAnimationFrame(demoTick);}requestAnimationFrame(demoTick);
setInterval(()=>{$('performance').textContent=`${world.fps} fps · ${demo?'Demo input':camera.state==='running'?(performance.now()-lastHand<500?'Hand detected':'Camera active'):'Mouse ready'}`;},1000);
render();modeHelp();void refreshCameras();
try{if(!localStorage.getItem('g3d-welcomed'))showHelp();}catch{showHelp();}
if(restoreNotice)toast(restoreNotice);



