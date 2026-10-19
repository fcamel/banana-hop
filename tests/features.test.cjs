'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'dist/ai-ui.js'),'utf8');
function test(name,fn){return Promise.resolve().then(fn).then(()=>console.log('PASS',name));}
function featureSource(value){const env={...process.env};delete env.BANANA_AI_REPLAY;if(value!==undefined)env.BANANA_AI_REPLAY=value;return execFileSync('python3',['scripts/serve.py','--print-features'],{cwd:root,env,encoding:'utf8'});}
function ui(flag){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,checked:true,value:'17',style:{},textContent:'',listeners:{},addEventListener(event,listener){this.listeners[event]=listener;}});return nodes.get(id);};
  const c={console,$:node,canvas:{style:{}},resets:0,stops:0,resize(){},reset(){c.resets++;},stopSimulation(){c.stops++;},characterScale:()=>1,W:1000,H:650,createSimulation:config=>({config}),createReplay(){throw Error('unexpected replay creation');}};
  if(flag!==undefined)c.BANANA_FEATURES={aiReplay:flag};vm.createContext(c);vm.runInContext(source,c);return {c,node,run:code=>vm.runInContext(code,c)};
}
(async()=>{
 await test('Browser features fail closed and the deployed configuration never inherits the local environment',()=>{
   for(const value of [undefined,'','0','false','yes','invalid','1','true']){const c={};vm.createContext(c);vm.runInContext(featureSource(value),c);assert.equal(c.BANANA_FEATURES.aiReplay,value==='1'||value==='true');assert.ok(Object.isFrozen(c.BANANA_FEATURES));}
   assert.equal(fs.readFileSync(path.join(root,'dist/features.js'),'utf8'),featureSource(undefined));
   execFileSync('python3',['scripts/serve.py','--check-features'],{cwd:root,env:{...process.env,BANANA_AI_REPLAY:'1'}});
   const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');assert.ok(html.indexOf('src="features.js?')<html.indexOf('src="control.js?'));
   assert.match(html,/<details id="aiOptions"[^>]* hidden/);assert.match(html,/<span id="agentStatus"[^>]* hidden/);
 });
 await test('Disabled or absent flags hide every AI/Replay control and prevent browser AI startup despite checkbox changes',async()=>{
   for(const flag of [undefined,false,'true']){
     const {c,node,run}=ui(flag);assert.equal(node('aiOptions').hidden,true);assert.equal(node('agentStatus').hidden,true);
     for(const id of ['autoAgent','agentSeed','recordAgent','downloadReplay','importReplay'])assert.equal(node(id).disabled,true);
     assert.equal(node('downloadReplay').listeners.click,undefined);assert.equal(node('importReplay').listeners.change,undefined);
     await run('startControlledGame()');assert.equal(c.resets,1);assert.equal(run('agentRun'),null);
     run("agentMessage('AI should stay invisible')");assert.equal(node('agentStatus').textContent,'');
     run('agentRun={};advanceAgentFrame(.25)'); // Must exit before inspecting a simulation or input state.
   }
 });
 await test('Explicit flag enables all browser controls and permits seeded AI startup',async()=>{
   const {node,run}=ui(true);assert.equal(node('aiOptions').hidden,false);assert.equal(node('agentStatus').hidden,false);
   for(const id of ['autoAgent','agentSeed','recordAgent','downloadReplay','importReplay'])assert.equal(node(id).disabled,false);
   assert.equal(typeof node('downloadReplay').listeners.click,'function');assert.equal(typeof node('importReplay').listeners.change,'function');
   run("sourceDigestPromise=Promise.resolve('test-digest')");await run('startControlledGame()');assert.equal(run('agentRun.environment.config.seed'),17);assert.equal(run('agentRun.environment.config.record'),true);
 });
})().catch(error=>{console.error(error);process.exitCode=1;});
