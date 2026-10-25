const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('../webui/node_modules/typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../webui/src/screens/viewer/WatchChannel.tsx'),'utf8')+'\nexport { HlsPlayer };';
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(native){
 let now=0,effect,cleanup,refIndex=0,stateIndex=0,frameCallback,mutations=0;
 const states=[],refs=[],events=new Map(),timers=new Map();let timerId=0;
 const media={videoWidth:0,videoHeight:0,currentTime:0,paused:false,readyState:2,buffered:{length:0},
  canPlayType:()=>native?'probably':'',play:()=>Promise.resolve(),pause(){this.paused=true;},load(){},removeAttribute(){},
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name),
  requestVideoFrameCallback:(fn)=>{frameCallback=fn;return 1;},cancelVideoFrameCallback:()=>{frameCallback=null;}};
 let hls;
 class Hls {constructor(){hls=this;this.events={};}static isSupported(){return true;}static Events={ERROR:'error',MANIFEST_PARSED:'manifest'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};loadSource(src){this.src=src;}attachMedia(){}on(name,fn){this.events[name]=fn;}destroy(){this.destroyed=true;}startLoad(){}recoverMediaError(){}}
 const react={useRef:(value)=>{const ref={current:refIndex++===0?media:value};refs.push(ref);return ref;},useState:(value)=>{const index=stateIndex++;states[index]=value;return [value,(next)=>{mutations++;states[index]=typeof next==='function'?next(states[index]):next;}];},useEffect:(fn)=>{effect=fn;}};
 const exports={};
 vm.runInNewContext(compiled,{exports,require:(id)=>id==='react'?react:id==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:new Proxy({},{get:()=>()=>null}),
  window:{location:{href:'http://localhost:8787/watch/channel/test',origin:'http://localhost:8787'},Hls},
  document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},URL,DOMException,
  Date:{now:()=>now},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:(id)=>timers.delete(id),setInterval:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearInterval:(id)=>timers.delete(id),console});
 exports.HlsPlayer({src:'/iptv/test/index.m3u8'});cleanup=effect();media.paused=false;
 await Promise.resolve();await Promise.resolve();
 assert.match(native?media.src:hls.src,/\/iptv\/test\/playback\.m3u8$/, 'all IPTV sources use compatibility negotiation');
 events.get('playing')();
 assert.equal(states[2],false,'audio-only playing events cannot mark video ready');
 media.videoWidth=1280;media.videoHeight=720;events.get('canplay')();
 assert.equal(states[2],false,'dimensions alone do not prove a decoded frame');
 frameCallback();assert.equal(states[2],true,'a rendered video frame enables playback UI');
 const stale=hls?.events.error;cleanup();const before=mutations;
 stale?.('error',{fatal:true,type:'media'});
 assert.equal(mutations,before,'late events from the previous source cannot restart it');
 assert.equal(timers.size,0,'channel cleanup cancels retry, startup and watchdog timers');
 if(!native)assert.equal(hls.destroyed,true);
}
(async()=>{await scenario(true);await scenario(false);console.log('WIVA IPTV player readiness and stale-event tests passed');})().catch(e=>{console.error(e);process.exitCode=1;});
