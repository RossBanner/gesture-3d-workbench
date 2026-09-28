import { Quaternion, type Plane, Vector3 } from 'three';
import { HandTracker, RelativeDepth, type DetectedHand, type TrackedHand } from './hand-tracking';
import { dualTransform, moveWithDepth, pairMetrics, depthTransform, rotateTransform, scaleTransform, angleDelta, type PairMetrics } from './hand-transform';
import { clamp, copy, type Item, type Vec3 } from './model';
import type { Point } from './gesture';
import type { Workspace, ViewState } from './workspace';

export interface HandsHost {
  begin(id:string):Item;
  update(item:Item):void;
  finish(cancel:boolean):void;
  command(name:string):void;
  snapping():boolean;
}
type HandTool='move'|'depth'|'rotate'|'scale';
type Session={kind:'object'|'view';primary:string;secondary:string|null;clutch:string|null;suspended:boolean;signature:string;anchor:Anchor|null};
type Anchor={item:Item|null;point:Point;control:Point;plane:Plane|null;hit:Vec3;pair:PairMetrics|null;view:ViewState;camera:Quaternion;toward:Vector3};
export class HandsController {
  private tracker=new HandTracker();
  private depth=new RelativeDepth();
  private session:Session|null=null;
  private object:Item|null=null;
  private tool:HandTool='move';
  private cursors=new Map<string,HTMLElement>();
  readonly panel:HTMLElement;
  private layer:HTMLElement;
  private connector:SVGLineElement;
  private feedback:HTMLElement;
  private badge:HTMLElement;
  private open=false;
  private pushPull=false;
  private confirmCommand='';
  status='Show an open hand, then pinch a shape';
  active=false;
  constructor(private world:Workspace,private host:HandsHost){
    const viewport=world.container;
    const controls=document.createElement('div');controls.className='hands-controls';
    controls.innerHTML=`<div class="hand-tools" aria-label="Hand tools"><span class="hand-tools-label">HAND<br>TOOLS</span>${[['move','Move'],['depth','Depth Z'],['rotate','Rotate'],['scale','Size']].map(([id,label])=>`<button class="hand-button ${id==='move'?'active':''}" data-hand-command="tool:${id}" aria-pressed="${id==='move'}">${label}</button>`).join('')}</div><div class="hand-utility"><button class="hand-button hand-menu-trigger" data-hand-command="menu">Hand menu</button><button id="hand-cancel" class="hand-button hand-menu-trigger" data-hand-command="cancel" hidden>Cancel grab</button></div>`;viewport.append(controls);
    this.panel=document.createElement('section');this.panel.id='hand-menu';this.panel.className='hand-menu';this.panel.hidden=true;this.panel.setAttribute('aria-label','Hands-only controls');
    this.panel.innerHTML=`<div class="hand-menu-heading"><div><span class="eyebrow">NO KEYBOARD NEEDED</span><h2>Point. Pinch. Create.</h2></div><button class="hand-button" data-hand-command="close">Back to scene</button></div><p class="hand-menu-note">Open your fingers between commands. Either hand can choose a button.</p><div class="hand-menu-grid">${[
      ['cube','Add cube'],['sphere','Add sphere'],['duplicate','Duplicate'],['undo','Undo'],['redo','Redo'],['colour','Next colour'],['home','Home view'],['focus','Focus shape'],['snap','Toggle snap'],['depth','Estimated push/pull: off'],['keep','Keep scene'],['shelf','Saved scenes'],['delete','Delete shape'],['top','Top view'],['stop','Stop camera']
    ].map(([c,l])=>`<button class="hand-button" data-hand-command="${c}">${l}</button>`).join('')}</div><div id="hand-shelf" hidden></div><div class="hand-menu-tips"><span><b>Depth Z tool</b>Pinch + slide up/down</span><span><b>Rotate tool</b>Pinch + move sideways/up/down</span><span><b>Optional fist shortcut</b>Locks Z depth until open palm</span></div><p class="hand-menu-footnote">Pinch a tool, open, then pinch a shape. Move tool: two pinches resize / turn. Empty space orbits. Keep scene saves locally.</p>`;viewport.append(this.panel);
    this.layer=document.createElement('div');this.layer.className='hands-layer';this.layer.innerHTML='<svg class="hands-link"><line x1="0" y1="0" x2="0" y2="0" /></svg>';this.connector=this.layer.querySelector('line')!;viewport.append(this.layer);
    this.feedback=document.createElement('div');this.feedback.className='hands-feedback';this.feedback.hidden=true;viewport.append(this.feedback);
    this.badge=document.createElement('div');this.badge.className='hands-depth';this.badge.hidden=true;viewport.append(this.badge);
    viewport.querySelectorAll<HTMLButtonElement>('[data-hand-command]').forEach(b=>b.addEventListener('click',()=>this.command(b.dataset.handCommand!)));
  }
  get isOpen(){return this.open;}
  private command(name:string){
    if(name.startsWith('tool:')){
      const tool=name.slice(5);if(!['move','depth','rotate','scale'].includes(tool))return;
      this.finish();this.tracker.disarm();this.tool=tool as HandTool;
      this.world.container.querySelectorAll<HTMLButtonElement>('[data-hand-command^="tool:"]').forEach(b=>{const on=b.dataset.handCommand===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
      this.status=`${tool==='depth'?'Depth Z':tool==='rotate'?'Rotate':tool==='scale'?'Size':'Move'} selected · open, then pinch a shape`;return;
    }
    if(name==='menu'||name==='close'){this.finish();this.open=name==='menu'&&!this.open;this.panel.hidden=!this.open;this.panel.classList.remove('shelf-open');this.panel.querySelector<HTMLElement>('#hand-shelf')!.hidden=true;this.confirmCommand='';this.refreshConfirmation();return;}
    if(name==='depth'){this.finish();this.pushPull=!this.pushPull;this.panel.querySelector('[data-hand-command="depth"]')!.textContent=`Estimated push/pull: ${this.pushPull?'on':'off'}`;return;}
    if(name==='delete'&&this.confirmCommand!=='delete'){this.confirmCommand='delete';this.refreshConfirmation();return;}
    if(name.startsWith('forget:')&&this.confirmCommand!==name){this.confirmCommand=name;this.panel.querySelectorAll<HTMLButtonElement>('[data-hand-command]').forEach(b=>{if(b.dataset.handCommand===name)b.textContent='Confirm remove';});return;}
    if(name==='cancel')this.finish(true);else this.finish();
    this.confirmCommand='';this.refreshConfirmation();this.host.command(name);
    if(['cube','sphere','duplicate','home','focus','cancel','stop'].includes(name)){this.open=false;this.panel.hidden=true;}
  }
  private refreshConfirmation(){this.panel.querySelector('[data-hand-command="delete"]')!.textContent=this.confirmCommand==='delete'?'Confirm delete':'Delete shape';}
  private hitButton(point:Point):HTMLElement|null{
    const rect=this.world.container.getBoundingClientRect();const element=document.elementFromPoint(rect.left+point.x*rect.width,rect.top+point.y*rect.height);
    return element?.closest<HTMLElement>('[data-hand-command]')??null;
  }
  reset(){this.finish();this.tracker.reset();this.clearVisuals();}
  cancel(){this.finish(true);this.tracker.disarm();}
  private clearVisuals(){for(const c of this.cursors.values())c.remove();this.cursors.clear();this.connector.style.opacity='0';this.badge.hidden=true;this.feedback.hidden=true;}
  private finish(cancel=false){
    if(this.session?.kind==='object')this.host.finish(cancel);
    this.session=null;this.object=null;this.active=false;this.world.controls.enabled=true;this.badge.hidden=true;this.world.container.querySelector<HTMLElement>('#hand-cancel')!.hidden=true;
    this.world.showHandGuide(null);
  }
  private begin(hand:TrackedHand){
    const id=this.world.pick(hand);this.object=id?copy(this.host.begin(id)):null;
    this.session={kind:id?'object':'view',primary:hand.id,secondary:null,clutch:null,suspended:false,signature:'',anchor:null};
    this.active=true;this.world.controls.enabled=false;
    this.world.container.querySelector<HTMLElement>('#hand-cancel')!.hidden=false;
  }
  private rebase(primary:TrackedHand,secondary:TrackedHand|undefined,mode:string,now:number,aspect:number){
    const session=this.session!;
    const pair=secondary&&mode!=='depth'?pairMetrics(primary,secondary,aspect):null;
    const point=pair?.point??{x:primary.x,y:primary.y};
    const plane=this.object?this.world.makePlane(this.object,'screen'):null;
    session.anchor={item:this.object?copy(this.object):null,point,control:secondary&&mode!=='depth'?{x:secondary.x-primary.x,y:secondary.y-primary.y}:{x:primary.x,y:primary.y},plane,hit:plane?(this.world.intersect(point,plane)??[0,0,0]):[0,0,0],pair,view:this.world.readView(),camera:this.world.camera.quaternion.clone(),toward:this.world.camera.getWorldDirection(new Vector3()).negate()};
    session.signature=`${mode}:${primary.id}:${secondary?.id??''}`;this.depth.reset(primary,now);
  }
  update(detections:DetectedHand[],now:number,aspect=4/3){
    const frame=this.tracker.update(detections,now,aspect),hands=frame.hands;
    const session=this.session;
    if(session&&(frame.ambiguous||[session.primary,session.secondary,session.clutch].some(id=>id&&(frame.lostIds.includes(id)||hands.find(h=>h.id===id)?.lost)))){
      this.finish();this.tracker.disarm();this.status='Tracking paused · open both hands to continue';this.draw(hands);return;
    }
    for(const h of hands){
      if(!h.visible)continue;
      const button=this.hitButton(h);
      if(h.started&&!h.fist&&button){this.command(button.dataset.handCommand!);this.draw(hands);return;}
    }
    if(this.open){this.status='Point at a button and pinch · open between commands';this.draw(hands);return;}
    if(!this.session){const starter=hands.find(h=>h.visible&&h.started&&!h.fist);if(starter)this.begin(starter);}
    if(this.session){
      const held=(h:TrackedHand)=>h.machine.phase==='holding'||h.machine.phase==='releasing';
      let primary=hands.find(h=>h.id===this.session!.primary&&held(h));
      let secondary=hands.find(h=>h.id===this.session!.secondary&&held(h)&&!h.fist);
      if(!primary&&secondary){primary=secondary;secondary=undefined;this.session.primary=primary.id;this.session.secondary=null;this.session.clutch=null;}
      if(!primary){this.finish();this.status='Placed · open, then pinch again';this.draw(hands);return;}
      const helper=hands.find(h=>h.id!==primary!.id);
      const clutch=this.session.kind==='object'&&this.tool==='move'&&helper?.fist;
      this.session.clutch=clutch?helper.id:null;
      if(clutch||this.tool==='depth'){secondary=undefined;this.session.secondary=null;}
      else if(!secondary){secondary=hands.find(h=>h.visible&&h.id!==primary!.id&&h.started&&!h.fist);this.session.secondary=secondary?.id??null;}
      const mode=this.session.kind==='view'?(secondary?'dual':'single'):
        clutch||this.tool==='depth'?'depth':this.tool==='rotate'?'rotate':this.tool==='scale'?'scale':secondary?'dual':'single';
      const modifier=secondary??(clutch?helper:undefined);
      if(!primary.visible||modifier&&!modifier.visible){
        this.session.suspended=true;this.status='Tracking briefly hidden · holding still';this.draw(hands);return;
      }
      const viewAspect=this.world.camera.aspect;
      const signature=`${mode}:${primary.id}:${modifier?.id??''}`;
      if(signature!==this.session.signature||this.session.suspended||primary.reacquired||modifier?.reacquired){
        this.rebase(primary,modifier,mode,now,viewAspect);this.session.suspended=false;
      }
      const anchor=this.session.anchor!;
      if(primary.machine.phase==='releasing'||secondary?.machine.phase==='releasing'){
        this.status='Opening to place…';this.draw(hands);return;
      }
      const pair=secondary?pairMetrics(primary,secondary,viewAspect):null,point=pair?.point??primary;
      if(this.session.kind==='view'){
        this.world.handView(anchor.view,point.x-anchor.point.x,point.y-anchor.point.y,pair&&anchor.pair?pair.span/Math.max(.08,anchor.pair.span):1);
        this.status=pair?'View · spread / squeeze to zoom':'View · move your pinched hand to orbit';
      }else{
        const hit=anchor.plane?this.world.intersect(point,anchor.plane):null;
        const delta=(hit?hit.map((v,i)=>v-anchor.hit[i]):[0,0,0]) as Vec3;
        this.world.showHandGuide(null);
        if(mode==='depth'){
          this.object=depthTransform(anchor.item!,primary.y-anchor.point.y,this.host.snapping());
          this.world.showHandGuide(anchor.item!,this.object,'depth');
          this.status=clutch?'Fist locked · slide grab hand up/down for Z · open helper to unlock':'Depth Z · pinch + slide up/down · size stays fixed';
          this.badge.hidden=false;this.badge.textContent=`Z ${this.object.position[2].toFixed(2)} · Δ ${(this.object.position[2]-anchor.item!.position[2]).toFixed(2)} · SIZE LOCKED`;
        }else if(mode==='rotate'){
          const control=secondary?{x:secondary.x-primary.x,y:secondary.y-primary.y}:primary;
          this.object=rotateTransform(anchor.item!,control.x-anchor.control.x,control.y-anchor.control.y,anchor.camera,this.host.snapping(),
            pair&&anchor.pair?angleDelta(pair.angle,anchor.pair.angle)*.35:0);
          this.world.showHandGuide(anchor.item!,this.object,'rotate');
          this.status=secondary?'Rotate · move second pinch sideways / up / down':'Rotate · move pinch sideways to turn, up/down to tilt';
          this.badge.hidden=false;this.badge.textContent=`ROTATION ${this.object.rotation.map(v=>Math.round(v*180/Math.PI)+'°').join(' / ')} · SIZE LOCKED`;
        }else if(mode==='scale'){
          const factor=pair&&anchor.pair?pair.span/Math.max(.08,anchor.pair.span):Math.exp((anchor.point.y-primary.y)*3);
          this.object=scaleTransform(anchor.item!,factor,this.host.snapping());
          this.status=secondary?'Size · spread / squeeze · position locked':'Size · pinch + move up to enlarge, down to shrink';
          this.badge.hidden=false;this.badge.textContent=`SIZE ${this.object.scale.map(v=>v.toFixed(2)).join(' / ')} · POSITION LOCKED`;
        }else if(mode==='dual'&&pair&&anchor.pair){
          // Steering-wheel roll stays available; explicit Rotate handles yaw and tilt predictably.
          this.object=dualTransform(anchor.item!,anchor.pair,{...pair,yaw:anchor.pair.yaw,pitch:anchor.pair.pitch},delta,anchor.camera,this.host.snapping());
          this.status='Two pinches · spread / squeeze to size, turn to roll · Rotate tool for tilt';this.badge.hidden=true;
        }else{
          const depth=this.pushPull?this.depth.update(primary,now):0;
          this.object=moveWithDepth(anchor.item!,delta,anchor.toward,depth,this.host.snapping());
          this.status=this.depth.paused&&this.pushPull?'Estimated depth paused · face palm to lens':'Move · second pinch to resize / roll · Depth Z and Rotate above';
          this.badge.hidden=!this.pushPull;this.badge.textContent=`ESTIMATED DEPTH ${depth.toFixed(2)}`;
        }
        this.host.update(this.object!);
      }
    }else this.status=frame.ambiguous?'Separate hands, then open to re-arm':hands.some(h=>h.visible)?
      `${this.tool==='depth'?'Depth Z':this.tool==='rotate'?'Rotate':this.tool==='scale'?'Size':'Move'} · open, then pinch a shape`:'No hands visible · show an open hand';
    this.draw(hands);
  }

  private draw(hands:TrackedHand[]){
    const ids=new Set(hands.map(h=>h.id));for(const [id,c] of this.cursors)if(!ids.has(id)){c.remove();this.cursors.delete(id);}
    this.world.container.querySelectorAll('.hand-hover').forEach(e=>e.classList.remove('hand-hover'));
    hands.forEach((h,i)=>{
      let cursor=this.cursors.get(h.id);if(!cursor){cursor=document.createElement('div');cursor.className='tracked-hand';cursor.innerHTML='<span></span><small></small>';this.layer.append(cursor);this.cursors.set(h.id,cursor);}
      cursor.style.left=`${h.x*100}%`;cursor.style.top=`${h.y*100}%`;
      const held=h.machine.phase==='holding'||h.machine.phase==='releasing';cursor.classList.toggle('held',held);cursor.classList.toggle('helper',i===1);
      cursor.classList.toggle('occluded',!h.visible);
      cursor.querySelector('small')!.textContent=!h.visible?'Hidden · holding':h.fist?'Fist locked · open to release':held?'Pinched':h.machine.phase==='waiting'?'Open fingers':`Hand ${i+1}`;
      if(h.visible)this.hitButton(h)?.classList.add('hand-hover');
    });
    const first=hands.find(h=>h.id===this.session?.primary),second=hands.find(h=>h.id===this.session?.secondary);
    this.connector.style.opacity=first&&second?'1':'0';
    if(first&&second){this.connector.setAttribute('x1',`${first.x*100}%`);this.connector.setAttribute('y1',`${first.y*100}%`);this.connector.setAttribute('x2',`${second.x*100}%`);this.connector.setAttribute('y2',`${second.y*100}%`);}
    this.feedback.hidden=!hands.length||this.open;this.feedback.textContent=this.status;
  }
  /** Used by the local saved-scene shelf, whose buttons remain gesture targets. */
  bindCommandButton(button:HTMLButtonElement,name:string){button.classList.add('hand-button');button.dataset.handCommand=name;button.onclick=()=>this.command(name);}
}
