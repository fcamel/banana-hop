'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../dist');
const files=['control.js','boss.js','surf.js','milk.js','entrance.js','giant.js','game.js'];
const source=files.map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]);
const snapshot=require('./snapshot.cjs'),itemMetrics=require('./item-metrics.cjs');
const compiled=source.map(([name,text])=>new vm.Script(text,{filename:name}));
const sourceDigest=crypto.createHash('sha256').update(source.map(([name,text])=>name+'\n'+text).join('\n')).digest('hex');
// Compatibility shell only. Physics, AI and collision all run from dist/*.js.
// No browser, image decoding, rendering, music generation or wall-clock timers.
function createEnvironment(options={}){
  const nodes=new Map(),context2d={setTransform(){}};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},hidden:false,checked:false,classList:{add(){},remove(){}},getContext:()=>context2d,getBoundingClientRect:()=>({width:options.width||1000,height:options.height||650}),addEventListener(){},setAttribute(){},focus(){}});return nodes.get(id);};
  const context={console,BANANA_HEADLESS:true,Image:class{},document:{getElementById:node,addEventListener(){}},window:{addEventListener(){},scrollTo(){},matchMedia:()=>({matches:!!options.mobile})},ResizeObserver:class{observe(){}},devicePixelRatio:1};
  vm.createContext(context);for(const script of compiled)script.runInContext(context);
  new vm.Script(snapshot.script).runInContext(context);
  new vm.Script(itemMetrics.script).runInContext(context);
  const resetMetrics=()=>{context.trainingItemMetrics=itemMetrics.empty();context.trainingDamageEvents=[];context.trainingActionHistory=[];};
  const captureScript=new vm.Script('trainingSnapshotCodec.encode({'+snapshot.names.join(',')+'})');
  const restoreScript=new vm.Script('({'+snapshot.names.join(',')+'}=trainingSnapshotCodec.decode(JSON.parse(globalThis.trainingSnapshotInput)))');
  let env=context.BananaAI.createEnvironment({...options,sourceDigest});
  function startReplay(tape){if(tape.sourceDigest!==sourceDigest)throw Error('Replay requires the exact recorded game sources');resetMetrics();const playback=context.BananaAI.createReplay(tape);env=playback.environment;return playback;}
  return {setActionHistory(actions){context.trainingActionHistory=JSON.parse(JSON.stringify(actions));},damageEvents:()=>JSON.parse(JSON.stringify(context.trainingDamageEvents)),metrics:()=>({...context.trainingItemMetrics}),reset(nextOptions){
      if(nextOptions===undefined){resetMetrics();return env.reset();}
      for(const key of ['width','height','mobile'])if(nextOptions[key]!==undefined&&nextOptions[key]!== (options[key]??({width:1000,height:650,mobile:false}[key])))throw Error('Profile changes require a new environment');
      resetMetrics();env=context.BananaAI.createEnvironment({...options,...nextOptions,sourceDigest});return env.observe();
    },observe:()=>env.observe(),step:(action,frames)=>env.step(action,frames),summary:()=>env.summary(),replay:()=>env.replay(),policy:observation=>env.policy(observation),features:context.BananaAI.features,sourceDigest,
    replayTape:startReplay,
    snapshot(){if(env.config.mode!=='milk'||!env.config.survivalOnly||env.summary().outcome!=='running')throw Error('Snapshots require live milk survival training');return {schema:1,sourceDigest,config:{...env.config},time:env.observe().time,world:JSON.parse(JSON.stringify(captureScript.runInContext(context)))};},
    restoreSnapshot(saved,{heal=false}={}){
      if(options.record||saved.schema!==1||saved.sourceDigest!==sourceDigest||saved.config.mode!=='milk'||!saved.config.survivalOnly)throw Error('Invalid training snapshot');
      for(const key of ['width','height','mobile'])if(saved.config[key]!==env.config[key])throw Error('Snapshot profile changed');
      resetMetrics();env=context.BananaAI.createEnvironment({...saved.config,record:false,sourceDigest});
      context.trainingSnapshotInput=JSON.stringify(saved.world);try{restoreScript.runInContext(context);}finally{delete context.trainingSnapshotInput;}
      if(heal)new vm.Script('player.hp=5').runInContext(context);
      if(env.summary().outcome!=='running'||Math.abs(env.observe().time-saved.time)>1e-7)throw Error('Snapshot must restore a live matching time');
      return env.observe();
    },
    restoreTape(tape,onTailObservation=()=>{}){
      const playback=startReplay(tape),tailStart=Math.max(0,tape.steps-2);
      // Preserve every fixed physics step and recorded input. Avoid two full
      // JSON observations per warmup frame; only the final two feed velocity.
      for(const segment of tape.actions){
        const [x,y,jump,jet,dash,surf]=segment.action,action={x,y,jump:!!jump,jet:!!jet,dash:!!dash,surf:!!surf};let left=segment.frames;
        while(left>0){
          const before=env.steps,warmup=before<tailStart,frames=warmup?Math.min(left,600,tailStart-before):1;
          const result=env.step(action,frames);if(env.steps-before!==frames)throw Error('Replay ended before the recorded final step');
          if(!warmup)onTailObservation(result.observation);left-=frames;
        }
      }
      return playback.step(); // Original validator checks the complete world/RNG digest.
    }};
}
module.exports={createEnvironment,sourceDigest};
