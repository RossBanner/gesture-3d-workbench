import { _electron as electron } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { syntheticHand } from '../tests/hand-fixture.ts';
const root=process.cwd(),pkg=JSON.parse(await readFile('package.json','utf8'));
const exe=path.join(root,'outputs/releases',pkg.version,'Gesture 3D Workbench-win32-x64/Gesture 3D Workbench.exe');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:[`--user-data-dir=${path.join(root,'work/hands-test-profile')}`],env,timeout:60000});
const page=await app.firstWindow();page.setDefaultTimeout(15000);
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));
const check=name=>{checks.push(name);console.log(name+': passed');};
const recordedFistText=await readFile(path.join(root,'tests/fixtures/fist_landmarks.pbtxt'),'utf8');
const recordedFistPoints=[...recordedFistText.matchAll(/landmark\s*\{\s*x:\s*([-\d.e+]+)\s*y:\s*([-\d.e+]+)\s*z:\s*([-\d.e+]+)/gi)].map(m=>({x:Number(m[1]),y:Number(m[2]),z:Number(m[3])}));
function recordedFistAt(x,y){
  const p=recordedFistPoints.slice(0,21),cx=(p[4].x+p[8].x)/2,cy=(p[4].y+p[8].y)/2;
  const factor=.124/Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y);
  return {landmarks:p.map(v=>({x:1-(.12+x*.76)+(v.x-cx)*factor,y:.20+y*.60+(v.y-cy)*factor,z:v.z*factor})),worldLandmarks:recordedFistPoints.slice(21,42),handedness:'Left'};
}
try{
  // Test-process-only replacement. Production has no replay API or testing privileges.
  await page.addInitScript(()=>{
    window.__testHands=[];
    const RealWorker=window.Worker;
    window.Worker=class{
      constructor(url){if(!String(url).includes('hand-worker.js'))return new RealWorker(url);this.onmessage=null;this.dead=false;}
      postMessage(data){
        if(data.type==='init')setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'ready',delegate:'SIMULATED TEST'}});},30);
        if(data.type==='frame'){data.frame.close();setTimeout(()=>{if(!this.dead){const hands=window.__testHands;this.onmessage?.({data:{type:'result',landmarks:hands.map(h=>h.landmarks),worldLandmarks:hands.map(h=>h.worldLandmarks),handedness:hands.map(h=>[{categoryName:h.handedness}]),ms:1}});}},4);}
      }
      terminate(){this.dead=true;}
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');let n=0;
      const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#333':'#334';ctx.fillRect(0,0,640,480);},30);
      const stream=c.captureStream(30);const stop=stream.getVideoTracks()[0].stop.bind(stream.getVideoTracks()[0]);stream.getVideoTracks()[0].stop=()=>{clearInterval(timer);stop();};return stream;
    };
    localStorage.removeItem('g3d-shelf-v1');
  });
  await page.reload();await page.waitForSelector('#viewport canvas');if(await page.locator('#help-dialog').isVisible())await page.locator('#begin').click();
  await page.locator('#reset').click();
  const v=await page.locator('#viewport').boundingBox();let point;
  for(const y of [.53,.6,.46]){for(const x of [.36,.43,.5,.57]){await page.mouse.click(v.x+v.width*x,v.y+v.height*y);if(await page.locator('#inspector-fields').isVisible()){point={x,y};break;}}if(point)break;}
  assert.ok(point);
  const values=()=>page.evaluate(()=>Object.fromEntries(['position','rotation','scale'].map(group=>[group,[0,1,2].map(i=>Number(document.querySelector(`#${group}-${i}`).value))])));
  const original=await values();
  await page.locator('#start-camera').click();await page.waitForFunction(()=>document.querySelector('#tracking-chip').textContent.includes('SIMULATED'));
  const feed=async(hands,ms=340)=>{await page.evaluate(h=>window.__testHands=h,hands);await page.waitForTimeout(ms);};
  let px=point.x,py=point.y,sx=Math.min(.88,point.x+.26),sy=point.y;
  const primary=(pinch,size=1)=>syntheticHand(px,py,pinch,size);
  const secondary=(pinch,fist=false)=>syntheticHand(sx,sy,pinch,1,fist,'Left');
  await feed([primary(false),secondary(false)]);
  await feed([primary(true),secondary(false)]);
  assert.equal(await page.locator('.tracked-hand.held').count(),1);check('Synthetic one-hand grab arms and selects through the real controller');
  await feed([primary(true,1.35),secondary(false)],1000);
  const pushed=await values();assert.deepEqual(pushed,original);check('Estimated push/pull is off by default: palm-size change cannot move or resize the object');
  await feed([primary(true,1.35),secondary(true)],450);
  assert.equal(await page.locator('.tracked-hand.held').count(),2);
  const joined=await values();assert.ok(Math.abs(joined.position[2]-pushed.position[2])<.3);check('Second pinch joins without a position jump');
  sx+=.10;await feed([primary(true,1.35),secondary(true)],550);
  const enlarged=await values();assert.ok(enlarged.scale[0]>joined.scale[0]*1.12);check('Two-hand spread enlarges the selected object');
  sx-=.17;await feed([primary(true,1.35),secondary(true)],550);
  const shrunk=await values();assert.ok(shrunk.scale[0]<enlarged.scale[0]*.9);check('Two-hand squeeze shrinks the selected object');
  sy-=.14;await feed([primary(true,1.35),secondary(true)],550);
  const turned=await values();assert.ok(turned.rotation.some((r,i)=>Math.abs(r-shrunk.rotation[i])>5));check('Turning the hand-to-hand line rotates the object');
  await feed([secondary(true),primary(true,1.35)],450);
  const reordered=await values();assert.ok(reordered.scale.every((s,i)=>Math.abs(s-turned.scale[i])<.03));check('Reordered detector arrays retain hand roles');
  await feed([primary(true,1.35),secondary(false)],400);
  const releasedSecond=await values();assert.ok(Math.abs(releasedSecond.scale[0]-reordered.scale[0])<.03);check('Second-hand release rebases without a scale jump');
  await feed([primary(true,1.35),secondary(false,true)],500);
  assert.ok((await page.locator('.hands-feedback').textContent()).includes('Fist locked'));
  const clutchStart=await values();py+=.10;await feed([primary(true,1.35),secondary(false,true)],550);
  const clutchMoved=await values();assert.ok(clutchMoved.position[2]>clutchStart.position[2]+.3);assert.deepEqual(clutchMoved.scale,clutchStart.scale);assert.deepEqual(clutchMoved.position.slice(0,2),clutchStart.position.slice(0,2));assert.deepEqual(clutchMoved.rotation,clutchStart.rotation);check('Tucked-thumb helper fist changes only world Z, with size/rotation/X/Y locked');
  for(let i=0;i<6;i++)await feed([primary(true,1.35),secondary(true,i%2===0)],100);
  assert.ok((await page.locator('.hands-feedback').textContent()).includes('Fist locked'));assert.deepEqual((await values()).scale,clutchMoved.scale);check('Fist/pinch landmark flicker cannot switch a latched depth gesture into scaling');
  const beforeHidden=await values();py+=.035;await feed([primary(true,1.35)],200);assert.deepEqual(await values(),beforeHidden);
  await feed([primary(true,1.35),secondary(true,true)],400);const afterHidden=await values();assert.ok(Math.abs(afterHidden.position[2]-beforeHidden.position[2])<.06);assert.deepEqual(afterHidden.scale,beforeHidden.scale);check('Brief helper occlusion freezes and resumes depth without dropping the grab or jumping');
  await feed([primary(true,1.35),secondary(false)],480);assert.ok(!(await page.locator('.hands-feedback').textContent()).includes('Fist locked'));
  await feed([primary(true,1.35),recordedFistAt(sx,sy)],500);assert.ok((await page.locator('.hands-feedback').textContent()).includes('Fist locked'));const recordedStart=await values();
  py-=.07;await feed([primary(true,1.35),recordedFistAt(sx,sy)],500);const recordedEnd=await values();assert.ok(recordedEnd.position[2]<recordedStart.position[2]-.5);assert.deepEqual(recordedEnd.scale,recordedStart.scale);check('Recorded real fist landmarks engage depth through the production controller, without a pinch');
  await feed([] ,800);const lost=await values();await feed([primary(true,1.35),secondary(true)]);assert.deepEqual(await values(),lost);check('Prolonged tracking loss places safely and closed-hand reacquisition cannot re-grab');
  await feed([],800);await page.locator('#undo').click();const undone=await values();assert.deepEqual(undone,original);check('Complete two-hand session, including brief occlusion, is a single undo transaction');
  const handClick=async(selector)=>{
    const rect=await page.locator(selector).boundingBox(),view=await page.locator('#viewport').boundingBox();assert.ok(rect,selector);
    const x=(rect.x+rect.width/2-view.x)/view.width,y=(rect.y+rect.height/2-view.y)/view.height;
    await feed([syntheticHand(x,y,false)],320);await feed([syntheticHand(x,y,true)],280);await feed([syntheticHand(x,y,false)],200);
  };
  px=point.x;py=point.y;sx=Math.min(.88,point.x+.26);sy=point.y;
  await feed([primary(false),secondary(false)]);await feed([primary(true),secondary(false)]);
  px+=.045;await feed([primary(true),secondary(false)]);
  const cancelRect=await page.locator('#hand-cancel').boundingBox(),cancelView=await page.locator('#viewport').boundingBox();
  const cx=(cancelRect.x+cancelRect.width/2-cancelView.x)/cancelView.width,cy=(cancelRect.y+cancelRect.height/2-cancelView.y)/cancelView.height;
  await feed([primary(true),syntheticHand(cx,cy,false)],350);await feed([primary(true),syntheticHand(cx,cy,true)],300);
  assert.deepEqual(await values(),original);check('Second hand can cancel an active grab without keyboard input');
  await feed([],800);
  await handClick('[data-hand-command="tool:depth"]');assert.equal(await page.locator('[data-hand-command="tool:depth"]').getAttribute('aria-pressed'),'true');
  px=point.x;py=point.y;await feed([primary(false)]);await feed([primary(true)]);const depthStart=await values();
  py+=.10;await feed([primary(true)]);const depthEnd=await values();
  assert.ok(depthEnd.position[2]>depthStart.position[2]+.8);assert.deepEqual(depthEnd.position.slice(0,2),depthStart.position.slice(0,2));assert.deepEqual(depthEnd.scale,depthStart.scale);assert.deepEqual(depthEnd.rotation,depthStart.rotation);
  assert.ok((await page.locator('.hands-depth').textContent()).includes('SIZE LOCKED'));await page.screenshot({path:path.join(root,'outputs/depth-z-control.png')});check('Pinch-operated Depth Z tool moves only Z without needing a fist');
  await feed([primary(false)]);await feed([],800);await page.locator('#undo').click();assert.deepEqual(await values(),original);
  await handClick('[data-hand-command="tool:rotate"]');px=point.x;py=point.y;
  await feed([primary(false)]);await feed([primary(true)]);const rotateStart=await values();px+=.085;await feed([primary(true)],450);const yaw=await values();
  assert.ok(yaw.rotation.some((v,i)=>Math.abs(v-rotateStart.rotation[i])>10));assert.deepEqual(yaw.scale,rotateStart.scale);assert.deepEqual(yaw.position,rotateStart.position);
  py-=.085;await feed([primary(true)],450);const tilt=await values();assert.ok(tilt.rotation.some((v,i)=>Math.abs(v-yaw.rotation[i])>10));assert.deepEqual(tilt.scale,rotateStart.scale);assert.deepEqual(tilt.position,rotateStart.position);check('Rotate tool turns and tilts with planar hand movement and fixed palm normals');
  sx=Math.min(.88,px+.25);sy=py;await feed([primary(true),secondary(false)]);await feed([primary(true),secondary(true)]);const rotateJoined=await values();assert.ok(rotateJoined.rotation.every((v,i)=>Math.abs(v-tilt.rotation[i])<1));
  sy+=.10;await feed([primary(true),secondary(true)]);const secondTurn=await values();assert.ok(secondTurn.rotation.some((v,i)=>Math.abs(v-rotateJoined.rotation[i])>10));assert.deepEqual(secondTurn.scale,rotateStart.scale);assert.deepEqual(secondTurn.position,rotateStart.position);await page.screenshot({path:path.join(root,'outputs/rotation-control.png')});check('Second-hand motion tilts in Rotate tool while position and size remain locked');
  await feed([primary(false),secondary(false)]);await feed([],800);await page.locator('#undo').click();assert.deepEqual(await values(),original);
  await handClick('[data-hand-command="tool:move"]');
  await feed([]);
  await handClick('[data-hand-command="menu"]');assert.ok(await page.locator('#hand-menu').isVisible());
  await handClick('[data-hand-command="cube"]');assert.equal(await page.locator('.object-row').count(),5);check('Pinch-operated hand menu adds objects without mouse/keyboard input');
  await handClick('[data-hand-command="menu"]');await handClick('[data-hand-command="colour"]');assert.equal(await page.locator('#object-color').inputValue(),'#b5a1ff');
  await handClick('[data-hand-command="keep"]');assert.equal(await page.locator('.shelf-row').count(),1);check('Pinch-only colour change and Keep scene');
  await handClick('[data-hand-command="close"]');await handClick('[data-hand-command="menu"]');await handClick('[data-hand-command="sphere"]');assert.equal(await page.locator('.object-row').count(),6);
  await handClick('[data-hand-command="menu"]');await handClick('[data-hand-command="shelf"]');await handClick('[data-hand-command^="load:"]');assert.equal(await page.locator('.object-row').count(),5);check('Pinch-only scene shelf restores a saved assembly');
  await feed([]);await page.locator('[data-hand-command="close"]').click();await page.locator('[data-hand-command="menu"]').click();
  await page.waitForFunction(()=>document.querySelector('#toast').hidden);
  await page.screenshot({path:path.join(root,'outputs/two-hand-menu.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));await page.waitForTimeout(200);
  const fits=await page.evaluate(()=>{const m=document.querySelector('#hand-menu');return{scroll:m.scrollHeight,client:m.clientHeight};});assert.ok(fits.scroll<=fits.client+1,JSON.stringify(fits));await page.screenshot({path:path.join(root,'outputs/two-hand-menu-minimum.png')});check('Hand menu fits the minimum window without needing scroll');
  await page.locator('#stop-camera').click();assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);assert.deepEqual(errors,[]);
  await writeFile(path.join(root,'outputs/two-hand-test-results.json'),JSON.stringify({version:pkg.version,input:'Synthetic articulated hands, official recorded fist landmark replay, and canvas camera; not live physical gestures',checks,errors,timestamp:new Date().toISOString()},null,2));
}catch(e){await page.screenshot({path:path.join(root,'work/two-hand-failure.png')}).catch(()=>{});console.error(errors);throw e;}
finally{await app.close();}
