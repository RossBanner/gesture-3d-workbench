import type { DetectedHand } from './hand-tracking';
export type CameraState = 'off' | 'starting' | 'running' | 'error';
export interface CameraStatus { state: CameraState; message: string; delegate?: string }
export class HandCamera {
  state: CameraState = 'off';
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private generation = 0;
  private raf = 0;
  private busy = false;
  private lastFrame = -1;
  private lastSent = 0;
  private watchdog = 0;
  private rejectInit: ((error: Error) => void) | null = null;
  constructor(readonly video: HTMLVideoElement, readonly onStatus: (s: CameraStatus) => void, readonly onHand: (hands: DetectedHand[], ms: number) => void) {}
  async devices() { return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'); }
  async start(deviceId: string) {
    this.stop();
    const generation=++this.generation;
    this.state='starting'; this.onStatus({state:'starting',message:'Loading local hand tracking…'});
    try {
      const worker=new Worker(new URL('hand-worker.js', document.baseURI)); this.worker=worker;
      const delegate=await new Promise<string>((resolve,reject)=>{
        this.rejectInit=reject;
        const timer=window.setTimeout(()=>reject(new Error('Hand tracking took too long to load. Try starting again.')),25000);
        worker.onerror=e=>{ clearTimeout(timer); reject(new Error(e.message || 'Could not load the hand tracking worker.')); };
        worker.onmessage=({data})=>{
          if(data.type==='ready'){clearTimeout(timer); this.rejectInit=null; resolve(data.delegate);}
          if(data.type==='error'){clearTimeout(timer); reject(new Error(data.message));}
        };
        worker.postMessage({type:'init'});
      });
      if(generation!==this.generation)return;
      this.onStatus({state:'starting',message:'Opening camera…',delegate});
      await window.workbench?.cameraAccess(true);
      if(generation!==this.generation)return;
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:'user'})}});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream; this.video.srcObject=stream; await this.video.play();
      if(generation!==this.generation)return;
      stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(generation===this.generation)this.fail('The camera was disconnected or stopped. Choose a camera and start again.');}));
      worker.onmessage=({data})=>{
        if(generation!==this.generation)return;
        this.busy=false;
        if(data.type==='error'){this.fail(`Hand tracking stopped: ${data.message}`);return;}
        if(data.type==='result')this.onHand(data.landmarks.map((landmarks:DetectedHand['landmarks'],i:number)=>({landmarks,worldLandmarks:data.worldLandmarks?.[i],handedness:data.handedness?.[i]?.[0]?.categoryName??'hand'})),data.ms);
      };
      worker.onerror=()=>this.fail('Hand tracking stopped unexpectedly. Start Camera to try again.');
      this.state='running'; this.onStatus({state:'running',message:'Show your hands · pinch with one or both',delegate});
      this.lastFrame=-1; this.lastSent=0; this.busy=false;
      const frame=async(time:number)=>{
        if(generation!==this.generation)return;
        if(!this.busy && this.video.readyState>=2 && this.video.currentTime!==this.lastFrame && time-this.lastSent>=40){
          this.busy=true; this.lastFrame=this.video.currentTime; this.lastSent=time;
          try {
            const bitmap=await createImageBitmap(this.video);
            if(generation!==this.generation){bitmap.close();return;}
            worker.postMessage({type:'frame',frame:bitmap,time},[bitmap]);
          } catch {if(generation===this.generation)this.fail('Could not read a camera frame. Stop other camera apps and try again.');return;}
        }
        this.raf=requestAnimationFrame(frame);
      }; this.raf=requestAnimationFrame(frame);
      this.watchdog=window.setInterval(()=>{
        if(performance.now()-this.lastSent>350)this.onHand([],0);
        if(this.busy && performance.now()-this.lastSent>10000)this.fail('Hand tracking stopped responding. Start Camera to try again.');
      },150);
    } catch(error) {
      if(generation!==this.generation)return;
      const name=error instanceof Error?error.name:'';
      const message=name==='NotAllowedError'?'Camera access was denied. You can continue with the mouse, or allow camera access in Windows and try again.':name==='NotReadableError'?'This camera may be in use by another app. Close that camera session and try again.':name==='NotFoundError'||name==='OverconstrainedError'?'No matching camera is available. Refresh the camera list and choose another device.':error instanceof Error?error.message:'Camera could not start.';
      this.fail(message);
    }
  }
  private fail(message:string){this.stop();this.state='error';this.onStatus({state:'error',message});}
  stop(){
    ++this.generation; cancelAnimationFrame(this.raf);clearInterval(this.watchdog);
    this.rejectInit?.(new Error('Camera start canceled.'));this.rejectInit=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;
    this.worker?.terminate();this.worker=null;this.busy=false;
    void window.workbench?.cameraAccess(false).catch(()=>{});
    this.onHand([],0);this.state='off';this.onStatus({state:'off',message:'Camera is off'});
  }
}
