import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type Item, type SceneData, type Vec3, type Constraint } from './model';
import type { Point } from './gesture';
export interface ViewState { position: Vec3; target: Vec3 }

export class Workspace {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  readonly controls: OrbitControls;
  private meshes = new Map<string, THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xb6ffee);
  private target: THREE.Vector3 | null = null;
  private box = new THREE.BoxGeometry(1, 1, 1);
  private sphere = new THREE.SphereGeometry(0.5, 40, 28);
  private handGuide = new THREE.Group();
  private guideGhost = new THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>(this.box,new THREE.MeshBasicMaterial({color:0xa7cfff,wireframe:true,transparent:true,opacity:.3,depthWrite:false}));
  private guideAxis = new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x9cbfff,transparent:true,opacity:.8,depthTest:false}));
  private guideRotation = new THREE.AxesHelper(1);
  private resizeObserver: ResizeObserver;
  private raf = 0;
  fps = 60;
  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x182425);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '3D workspace');
    this.renderer.domElement.tabIndex = 0;
    this.container.prepend(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0x182425, 22, 60);
    this.scene.add(new THREE.HemisphereLight(0xdefff4, 0x485463, 1.8));
    const light = new THREE.DirectionalLight(0xffefd8, 3);
    light.position.set(4, 9, 6); light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 35 });
    light.shadow.bias = -0.0003;
    this.scene.add(light);
    const rim = new THREE.DirectionalLight(0xa1bbff, 1.2); rim.position.set(-5, 3, -5); this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x1c2a2b, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.018; ground.receiveShadow = true; this.scene.add(ground);
    const grid = new THREE.GridHelper(100, 100, 0x56716f, 0x304545); grid.position.y = -0.008; this.scene.add(grid);
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-50,0,0),new THREE.Vector3(50,0,0)]);
    const xAxis = new THREE.Line(axisGeometry, new THREE.LineBasicMaterial({ color: 0x765752, transparent: true, opacity: .55 })); this.scene.add(xAxis);
    const zAxis = new THREE.Line(axisGeometry.clone(), new THREE.LineBasicMaterial({ color: 0x4b6280, transparent: true, opacity: .6 })); zAxis.rotation.y = Math.PI/2; this.scene.add(zAxis);
    this.highlight.visible = false; this.scene.add(this.highlight);
    this.handGuide.add(this.guideGhost,this.guideAxis,this.guideRotation);this.handGuide.visible=false;this.scene.add(this.handGuide);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .12;
    this.controls.minDistance = 2; this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI * .48;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.home();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    let last = performance.now(), frames = 0, since = last, renderedAt=0;
    const tick = (now: number) => {
      const dt = Math.min(.1, (now-last)/1000); last = now;
      if (this.target) { const offset = this.target.clone().sub(this.controls.target).multiplyScalar(1-Math.exp(-dt*12)); this.controls.target.add(offset); this.camera.position.add(offset); if(offset.length()<.001) this.target=null; }
      this.controls.update();
      if(now-renderedAt>=1000/60){renderedAt=now-(now-renderedAt)%(1000/60);this.renderer.render(this.scene,this.camera);frames++;}
      if (now - since > 1000) { this.fps = Math.round(frames * 1000 / (now-since)); since=now; frames=0; }
      this.raf = requestAnimationFrame(tick);
    }; this.raf = requestAnimationFrame(tick);
  }
  resize() { const { clientWidth: w, clientHeight: h } = this.container; this.camera.aspect=w/Math.max(1,h); this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h); }
  home() { this.camera.position.set(9, 7.5, 11); this.controls.target.set(0, .8, 0); this.target=null; this.controls.update(); }
  readView():ViewState {return {position:this.camera.position.toArray() as Vec3,target:this.controls.target.toArray() as Vec3};}
  handView(start:ViewState,dx:number,dy:number,zoom:number){
    this.target=null;const target=new THREE.Vector3(...start.target);
    const spherical=new THREE.Spherical().setFromVector3(new THREE.Vector3(...start.position).sub(target));
    spherical.theta-=dx*Math.PI*2;spherical.phi=THREE.MathUtils.clamp(spherical.phi+dy*Math.PI, .08,Math.PI*.48);spherical.radius=THREE.MathUtils.clamp(spherical.radius/THREE.MathUtils.clamp(zoom,.25,4),2,70);
    this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));this.camera.lookAt(target);
  }
  top() { this.camera.position.set(.01, 14, .01); this.controls.target.set(0,0,0); this.target=null; this.controls.update(); }
  focus(id: string | null) { const mesh=id ? this.meshes.get(id) : null; if(mesh) this.target=mesh.position.clone(); }
  sync(data: SceneData, selected: string | null) {
    this.renderer.shadowMap.needsUpdate = true;
    const ids = new Set(data.objects.map(o=>o.id));
    for(const [id,mesh] of this.meshes) if(!ids.has(id)) { this.scene.remove(mesh); (mesh.material as THREE.Material).dispose(); this.meshes.delete(id); }
    for(const item of data.objects) {
      let mesh=this.meshes.get(item.id);
      if(!mesh) { mesh=new THREE.Mesh(item.shape==='cube'?this.box:this.sphere,new THREE.MeshStandardMaterial({ roughness:.32,metalness:.1 })); mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData.id=item.id; this.meshes.set(item.id,mesh); this.scene.add(mesh); }
      mesh.geometry=item.shape==='cube'?this.box:this.sphere;
      mesh.position.fromArray(item.position); mesh.rotation.set(...item.rotation); mesh.scale.fromArray(item.scale);
      const mat=mesh.material as THREE.MeshStandardMaterial; mat.color.set(item.color); mat.emissive.set(item.id===selected?0x13332c:0x000000);
      mesh.updateMatrixWorld();
    }
    const selectedMesh=selected?this.meshes.get(selected):null;
    this.highlight.visible=!!selectedMesh;
    if(selectedMesh) this.highlight.setFromObject(selectedMesh);
  }
  ray(point: Point) { this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(new THREE.Vector2(point.x*2-1,1-point.y*2),this.camera); return this.raycaster; }
  pick(point: Point): string | null { return this.ray(point).intersectObjects([...this.meshes.values()],false)[0]?.object.userData.id ?? null; }
  makePlane(item: Item,constraint: Constraint): THREE.Plane {
    const normal=constraint==='floor'?new THREE.Vector3(0,1,0):this.camera.getWorldDirection(new THREE.Vector3());
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...item.position));
  }
  intersect(point: Point,plane: THREE.Plane): Vec3 | null { const p=this.ray(point).ray.intersectPlane(plane,new THREE.Vector3()); return p ? p.toArray() as Vec3 : null; }
  project(id: string): Point | null { const mesh=this.meshes.get(id); if(!mesh)return null; const v=mesh.position.clone().project(this.camera); return {x:(v.x+1)/2,y:(1-v.y)/2}; }
  showHandGuide(start:Item|null,current?:Item,kind:'depth'|'rotate'='depth'){
    this.handGuide.visible=!!start;if(!start||!current)return;
    this.guideGhost.visible=kind==='depth';this.guideAxis.visible=kind==='depth';this.guideRotation.visible=kind==='rotate';
    if(kind==='depth'){
      this.guideGhost.geometry=start.shape==='cube'?this.box:this.sphere;
      this.guideGhost.position.fromArray(start.position);this.guideGhost.rotation.set(...start.rotation);this.guideGhost.scale.fromArray(start.scale);
      this.guideAxis.geometry.setFromPoints([new THREE.Vector3(...start.position).add(new THREE.Vector3(0,0,-8)),new THREE.Vector3(...start.position).add(new THREE.Vector3(0,0,8))]);
    }else{
      this.guideRotation.position.fromArray(current.position);this.guideRotation.rotation.set(...current.rotation);this.guideRotation.scale.setScalar(Math.min(2,Math.max(.6,...current.scale.map(v=>v*.6))));
    }
  }
  dispose() { cancelAnimationFrame(this.raf); this.resizeObserver.disconnect(); this.controls.dispose(); this.renderer.dispose(); }
}

