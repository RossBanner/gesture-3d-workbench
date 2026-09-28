import { _electron as electron } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';
const root=process.cwd();
const output=path.join(root,'outputs');await mkdir(output,{recursive:true});
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const exe=path.join(output,'releases',pkg.version,'Gesture 3D Workbench-win32-x64','Gesture 3D Workbench.exe');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:[`--user-data-dir=${path.join(root,'work','desktop-test-profile')}`],env,timeout:60000});
const page=await app.firstWindow();page.setDefaultTimeout(15000);
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
const check=(name,detail='passed')=>{checks.push({name,result:detail});console.log(`${name}: ${detail}`);};
try {
  await page.waitForSelector('#viewport canvas');
  if(await page.locator('#help-dialog').isVisible())await page.locator('#begin').click();
  await page.locator('#reset').click();
  check('Packaged executable starts and renders the workbench');
  const security=await page.evaluate(()=>({node:typeof window.require,bridge:typeof window.workbench?.saveScene,secure:isSecureContext}));
  assert.equal(security.node,'undefined');assert.equal(security.bridge,'function');assert.equal(security.secure,true);
  const prefs=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return{nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation,sandbox:p.sandbox,webSecurity:p.webSecurity};});
  assert.deepEqual(prefs,{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true});check('Renderer isolation and secure origin');
  await page.locator('#add-cube').click();assert.equal(await page.locator('.object-row').count(),5);
  await page.locator('#object-name').fill('Test assembly cube');await page.locator('#object-name').press('Tab');
  await page.locator('#position-0').fill('2.75');await page.locator('#position-0').press('Tab');
  await page.locator('#rotation-1').fill('45');await page.locator('#rotation-1').press('Tab');
  await page.locator('#scale-0').fill('1.8');await page.locator('#scale-0').press('Tab');
  await page.locator('[data-color="#ee8e92"]').click();
  assert.equal(await page.locator('#object-color').inputValue(),'#ee8e92');check('Add, rename, transform and colour inspector');
  await page.locator('#duplicate').click();assert.equal(await page.locator('.object-row').count(),6);
  await page.locator('#delete').click();assert.equal(await page.locator('.object-row').count(),5);
  await page.locator('#undo').click();assert.equal(await page.locator('.object-row').count(),6);
  await page.locator('#redo').click();assert.equal(await page.locator('.object-row').count(),5);check('Duplicate/delete and undo/redo');
  const savePath=path.join(root,'work','desktop-test-scene.g3d.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},savePath);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Scene saved');
  const saved=JSON.parse(await readFile(savePath,'utf8'));assert.equal(saved.objects.length,5);assert.equal(saved.objects.at(-1).name,'Test assembly cube');assert.equal(saved.objects.at(-1).position[0],2.75);assert.equal(saved.objects.at(-1).color,'#ee8e92');
  await page.locator('#reset').click();assert.equal(await page.locator('.object-row').count(),4);
  await page.locator('#open').click();await page.waitForFunction(()=>document.querySelectorAll('.object-row').length===5);check('Native save/open IPC writes and restores validated JSON');
  const invalidPath=path.join(root,'work','invalid-scene.json');await writeFile(invalidPath,'{"format":"gesture-3d-workbench","version":999,"objects":[]}');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},invalidPath);
  await page.locator('#open').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Unsupported scene'));
  assert.equal(await page.locator('.object-row').count(),5);check('Invalid scene rejection preserves current work');
  await page.locator('#reset').click();
  const viewport=await page.locator('#viewport').boundingBox();
  // Locate a rendered object by clicking a grid of pixels and using the visible inspector.
  let hit=null;
  for(const ry of [.53,.6,.46,.67]){for(const rx of [.36,.43,.5,.57,.64]){const x=viewport.x+viewport.width*rx,y=viewport.y+viewport.height*ry;await page.mouse.click(x,y);if(await page.locator('#inspector-fields').isVisible()){hit={x,y};break;}}if(hit)break;}
  assert.ok(hit,'An object can be selected with a real mouse click');
  const before=await page.locator('#position-0').inputValue();
  await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.mouse.move(hit.x+40,hit.y-15,{steps:8});await page.mouse.up();
  const after=await page.locator('#position-0').inputValue();assert.notEqual(after,before);await page.locator('#undo').click();assert.equal(await page.locator('#position-0').inputValue(),before);check('Mouse raycast/drag on plane, one-step undo');
  await page.locator('#demo').click();await page.mouse.move(hit.x,hit.y);await page.waitForTimeout(350);await page.keyboard.down('Space');await page.waitForTimeout(250);
  assert.ok((await page.locator('#cursor-label').textContent()).includes('Grabbed'));
  await page.mouse.move(hit.x+45,hit.y-10,{steps:15});await page.waitForTimeout(200);await page.keyboard.up('Space');await page.waitForTimeout(250);
  assert.notEqual(await page.locator('#position-0').inputValue(),before);await page.locator('#demo').click();check('Labelled synthetic demo uses debounced pinch/drag/release');
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.querySelector('#toast').hidden);
  await page.screenshot({path:path.join(output,'workbench-preview.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
  await page.waitForTimeout(200);
  const layout=await page.evaluate(()=>({body:document.body.scrollWidth,width:innerWidth,toolbar:document.querySelector('.toolbar').scrollWidth,toolbarWidth:document.querySelector('.toolbar').clientWidth}));
  assert.ok(layout.body<=layout.width);assert.ok(layout.toolbar<=layout.toolbarWidth);await page.screenshot({path:path.join(output,'workbench-minimum-size.png')});check('Minimum window layout avoids horizontal overflow');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,940));
  const engine=await page.evaluate(()=>new Promise(resolve=>{
    const worker=new Worker(new URL('hand-worker.js',document.baseURI));let delegate='';const timer=setTimeout(()=>{worker.terminate();resolve({error:'timeout'});},30000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({error:e.message});};
    worker.onmessage=async({data})=>{if(data.type==='ready'){delegate=data.delegate;const c=new OffscreenCanvas(640,480);c.getContext('2d').fillRect(0,0,640,480);const frame=c.transferToImageBitmap();worker.postMessage({type:'frame',frame,time:1},[frame]);}if(data.type==='result'||data.type==='error'){clearTimeout(timer);worker.terminate();resolve({...data,delegate});}};
    worker.postMessage({type:'init'});
  }));
  assert.equal(engine.type,'result',JSON.stringify(engine));assert.equal(engine.landmarks.length,0);check('Real bundled MediaPipe model/WASM worker inference',`${engine.delegate}; blank image, ${engine.ms.toFixed(1)} ms; no hand expected`);
  const fixture='data:image/jpeg;base64,'+(await readFile(path.join(root,'tests/fixtures/right_hands.jpg'))).toString('base64');
  const recorded=await page.evaluate(dataUrl=>new Promise(resolve=>{
    const worker=new Worker(new URL('hand-worker.js',document.baseURI));let delegate='';const timer=setTimeout(()=>{worker.terminate();resolve({error:'timeout'});},30000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({error:e.message});};
    worker.onmessage=async({data})=>{if(data.type==='ready'){delegate=data.delegate;const img=new Image();img.src=dataUrl;await img.decode();const frame=await createImageBitmap(img);worker.postMessage({type:'frame',frame,time:1},[frame]);}if(data.type==='result'||data.type==='error'){clearTimeout(timer);worker.terminate();resolve({...data,delegate});}};
    worker.postMessage({type:'init'});
  }),fixture);
  assert.equal(recorded.type,'result',JSON.stringify(recorded));assert.equal(recorded.landmarks.length,2);assert.ok(recorded.landmarks.every(h=>h.length===21));assert.ok(recorded.worldLandmarks.every(h=>h.length===21));check('Recorded official TWO hand image detection',`${recorded.delegate}; ${recorded.landmarks.length} hands, 21 landmarks each; recorded fixture, not live gestures`);
  const fistImage='data:image/jpeg;base64,'+(await readFile(path.join(root,'tests/fixtures/fist.jpg'))).toString('base64');
  const fistResult=await page.evaluate(dataUrl=>new Promise(resolve=>{
    const worker=new Worker(new URL('hand-worker.js',document.baseURI));const timer=setTimeout(()=>{worker.terminate();resolve({error:'timeout'});},30000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({error:e.message});};
    worker.onmessage=async({data})=>{if(data.type==='ready'){const img=new Image();img.src=dataUrl;await img.decode();const frame=await createImageBitmap(img);worker.postMessage({type:'frame',frame,time:1},[frame]);}if(data.type==='result'||data.type==='error'){clearTimeout(timer);worker.terminate();resolve(data);}};worker.postMessage({type:'init'});
  }),fistImage);
  assert.equal(fistResult.type,'result');assert.equal(fistResult.landmarks.length,1);
  const recordedFist={landmarks:fistResult.landmarks[0],worldLandmarks:fistResult.worldLandmarks[0],handedness:'Right'};
  const source=await createServer({server:{middlewareMode:true},appType:'custom'});
  try{const {measureHand,HandTracker}=await source.ssrLoadModule('/src/hand-tracking.ts');const measured=measureHand(recordedFist,358/354);assert.ok(measured.fist,JSON.stringify(measured));const tracker=new HandTracker();for(let t=0;t<600;t+=40){const h=tracker.update([recordedFist],t,358/354).hands[0];assert.equal(h.started,false);if(t>250)assert.equal(h.fist,true);}}finally{await source.close();}
  await writeFile(path.join(root,'work/fist-inference.json'),JSON.stringify(recordedFist));check('Actual model on recorded fist: curl classifier latches fist and never starts a pinch');
  if(process.argv.includes('--camera')){
    await page.locator('#start-camera').click();await page.waitForFunction(()=>document.querySelector('#tracking-chip').textContent.startsWith('Live')||document.querySelector('#tracking-chip').textContent==='Needs attention',{},{timeout:45000});
    const live=await page.evaluate(()=>{const v=document.querySelector('video');return{status:document.querySelector('#tracking-chip').textContent,message:document.querySelector('#camera-message').textContent,width:v.videoWidth,height:v.videoHeight,tracks:v.srcObject?.getTracks().map(t=>({kind:t.kind,state:t.readyState}))??[]};});
    if(live.status.startsWith('Live')){await page.waitForTimeout(2500);live.trackingMessage=await page.locator('#camera-message').textContent();await page.evaluate(()=>{window.__testTracks=document.querySelector('video').srcObject.getTracks();});}
    await page.locator('#stop-camera').click({force:true}).catch(()=>{});
    assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
    if(live.status.startsWith('Live'))assert.ok(await page.evaluate(()=>window.__testTracks.every(t=>t.readyState==='ended')));
    check('Physical webcam acquisition (not a human gesture test)',JSON.stringify(live));check('Stop releases video stream and ends every track');
  } else check('Physical webcam acquisition','not requested in this test run');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Test denial','NotAllowedError');};});
  await page.locator('#start-camera').click();
  await page.waitForFunction(()=>document.querySelector('#tracking-chip').textContent==='Needs attention',{}, {timeout:45000});
  assert.ok((await page.locator('#camera-message').textContent()).includes('denied'));
  assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
  await page.locator('#add-cube').click();assert.equal(await page.locator('.object-row').count(),5);check('Simulated camera permission denial leaves mouse editing usable');
  await page.locator('#start-camera').click();await page.locator('#stop-camera').click();await page.waitForTimeout(500);
  assert.equal(await page.locator('#tracking-chip').textContent(),'Camera off');assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);check('Stop safely cancels an in-progress camera start');
  const blocked=await page.evaluate(async()=>{try{await fetch('https://example.com');return false;}catch{return true;}});assert.equal(blocked,true);check('External requests blocked by application policy');
  assert.deepEqual(errors,[]);check('No uncaught renderer errors');
  await writeFile(path.join(output,'desktop-test-results.json'),JSON.stringify({timestamp:new Date().toISOString(),executable:exe,checks,errors,limitations:['Synthetic demo is not proof of physical hand gestures.','Save/Open dialogs are substituted in the test main process; real file IPC and disk serialization are exercised.']},null,2));
} catch(error){await page.screenshot({path:path.join(output,'test-failure.png')}).catch(()=>{});console.error('Renderer errors:',errors);throw error;}
finally{await app.close();}

