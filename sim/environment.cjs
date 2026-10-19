'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../dist');
const files=['control.js','boss.js','surf.js','milk.js','entrance.js','giant.js','game.js'];
const source=files.map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]);
const sourceDigest=crypto.createHash('sha256').update(source.map(([name,text])=>name+'\n'+text).join('\n')).digest('hex');
// Compatibility shell only. Physics, AI and collision all run from dist/*.js.
// No browser, image decoding, rendering, music generation or wall-clock timers.
function createEnvironment(options={}){
  const nodes=new Map(),context2d={setTransform(){}};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},hidden:false,checked:false,classList:{add(){},remove(){}},getContext:()=>context2d,getBoundingClientRect:()=>({width:options.width||1000,height:options.height||650}),addEventListener(){},setAttribute(){},focus(){}});return nodes.get(id);};
  const context={console,BANANA_HEADLESS:true,Image:class{},document:{getElementById:node,addEventListener(){}},window:{addEventListener(){},scrollTo(){},matchMedia:()=>({matches:!!options.mobile})},ResizeObserver:class{observe(){}},devicePixelRatio:1};
  vm.createContext(context);for(const [name,text] of source)vm.runInContext(text,context,{filename:name});
  let env=context.BananaAI.createEnvironment({...options,sourceDigest});
  return {reset:()=>env.reset(),observe:()=>env.observe(),step:(action,frames)=>env.step(action,frames),summary:()=>env.summary(),replay:()=>env.replay(),policy:observation=>env.policy(observation),features:context.BananaAI.features,sourceDigest,
    replayTape(tape){if(tape.sourceDigest!==sourceDigest)throw Error('Replay requires the exact recorded game sources');const playback=context.BananaAI.createReplay(tape);env=playback.environment;return playback;}};
}
module.exports={createEnvironment,sourceDigest};
