'use strict';
const assert=require('node:assert/strict');
const {scenarios,fixture}=require('../sim/ability-scenarios.cjs');
const {createEnvironment}=require('../sim/environment.cjs');
const {skillEnvironment,encode}=require('../sim/training.cjs');
const {skillContext,validateChoice}=require('../sim/skills.cjs');
const {MotionHistory}=require('../sim/motion.cjs');
const {decode,choose}=require('../sim/visible-baseline.cjs');
const {runCase}=require('../sim/ability-runner.cjs');
const {verify}=require('../sim/ability-replay.cjs');
const {createCodec}=require('../sim/snapshot.cjs');
const {AbilityMetrics}=require('../sim/ability-metrics.cjs');
function test(name,f){f();console.log('PASS',name);}
test('Visible baseline cannot observe hidden objects, future endpoints or RNG',()=>{
 const e=createEnvironment({mode:'milk',survivalOnly:true,entrance:false}),o=e.observe();o.enemies=[];o.milkBottles=[];
 const a=encode(o),c=skillContext(o),choice=choose(a,c);
 o.enemies.push({id:999,type:'slice',x:o.player.x+5000,y:o.player.y,z:0,sliceFlight:{bx:123,by:456}});o.randomState=999;
 assert.deepEqual(encode(o),a);assert.deepEqual(skillContext(o),c);assert.deepEqual(choose(encode(o),skillContext(o)),choice);validateChoice(choice.choice,c);
 const s=scenarios().find(s=>s.pose==='flight'),env=createEnvironment({width:1000,height:650,mode:'milk',survivalOnly:true});env.restoreSnapshot(fixture(s));const flying=env.observe(),before=encode(flying);flying.enemies[0].sliceFlight.bx+=999;assert.deepEqual(encode(flying),before);
});
test('Decoder preserves airborne height and observed vertical velocity fields',()=>{
 const s=scenarios().find(s=>s.pose==='rising'),env=createEnvironment({width:1000,height:650,mode:'milk',survivalOnly:true});env.restoreSnapshot(fixture(s));const h=new MotionHistory();h.update(env.observe());env.step({x:0,y:0});h.update(env.observe());const o=env.observe(),d=decode(encode(o,undefined,h)).objects.find(x=>x.kind==='slices');assert.ok(d.valid);assert.ok(d.vz>0);assert.ok(Math.abs(d.z-o.enemies[0].z)<1e-9);assert.ok(Math.abs(d.vz-h.get(o.enemies[0]).vz)<1e-9);
});
test('All four fixture families preserve real collisions and deterministic replay',()=>{
 const list=scenarios();assert.equal(list.length,20);assert.notEqual(scenarios('development')[0].gap,list[0].gap);
 for(const s of list){const r=runCase({name:'idle'},s,{record:true});assert.ok(Math.abs(r.summary.gameSeconds-s.seconds)<1e-8);assert.equal(r.replayVerified,true);if(['bullets','slices','corner'].includes(s.family))assert.ok(r.diagnostics.damage.length>0,s.id);if(s.family==='bottle')assert.equal(r.items.milkBottles,0);}
});
test('Fixture spawn clocks suppress unrelated waves and replay rejects corruption',()=>{
 const s=scenarios()[0],saved=fixture(s),codec=createCodec(),world=codec.decode(saved.world);assert.equal(world.enemies.length,0);assert.equal(world.milkDrops.length,1);assert.ok(world.spawnClock>1000);
 const r=runCase({name:'visible-skills'},s,{record:true});assert.equal(r.summary.hp,5);assert.equal(r.replayVerified,true);r.replay.finalDigest='bad';assert.throws(()=>verify(r.replay),/diverged/);
});
test('Diagnostics hooks preserve gameplay, full-game replay and action boundaries',()=>{
 let frames=0;const a=skillEnvironment({seed:19,record:true}),b=skillEnvironment({seed:19,record:true,onPhysicsStep:()=>frames++});
 for(let i=0;i<20;i++){a.step([0,1,0,0]);b.step([0,1,0,0]);}assert.deepEqual(a.summary(),b.summary());assert.equal(JSON.stringify(a.replay()),JSON.stringify(b.replay()));assert.equal(frames,b.summary().steps);createEnvironment().restoreTape(b.replay());
 assert.throws(()=>skillEnvironment({record:true,diagnosticStart:fixture(scenarios()[0])}),/Diagnostic/);
});
test('Exposure-normalized diagnostics retain hit timing and previous decisions',()=>{
 const env=skillEnvironment(),m=new AbilityMetrics(),o=env.observe();
 for(let i=0;i<3;i++){m.begin(env.features(),[0,i,0,0],i);for(let j=0;j<30;j++)m.frame({before:{...o,time:i+j/60},action:{x:1,y:0},result:{observation:{...o,time:i+(j+1)/60,player:{...o.player,hp:o.player.hp-(i===2&&j===29?1:0)}}}});}
 const result=m.finish([{reason:'test',source:'enemy'}]);assert.equal(result.bySkill.move.seconds,1.5);assert.equal(result.bySkill.move.hits,1);assert.equal(result.bySkill.move.hitsPerSecond,2/3);assert.equal(result.damage[0].actions.length,3);assert.equal(result.damage[0].reason,'test');assert.ok(Math.abs(result.damage[0].decisionAge-.5)<1e-9);
});
test('PPO can learn a known two-direction contextual reward with the real optimizer',()=>{
 const {Network,Random,Adam,optimize,heads}=require('../sim/ppo.cjs');
 const net=new Network(2,8,new Random(9)),rng=new Random(10),adam=new Adam(net.parameters.length);
 const masks=heads.map((n,h)=>Array.from({length:n},(_,i)=>h===1?i===1||i===5:i===0)),context={skills:masks[0],parameters:Array.from({length:10},()=>({direction:masks[1],target:masks[2],travel:masks[3]}))};
 const accuracy=()=>[-1,1].reduce((sum,x)=>sum+net.forward([x,1],masks).probs[1][x>0?1:5],0)/2;
 assert.ok(accuracy()<.6);
 for(let k=0;k<12;k++){const batch=Array.from({length:128},(_,i)=>{const x=i%2?1:-1,features=[x,1],s=net.sample(features,rng,false,context),reward=s.action[1]===(x>0?1:5)?1:0;return {...s,features,target:reward,advantage:reward-.5};});optimize(net,adam,batch,rng,{epochs:4,batchSize:32,learningRate:.01,valueCoefficient:0,targetKl:.1});}
 assert.ok(accuracy()>.95);
});
test('Paired evaluation separates game and policy seeds and forwards greedy selection',()=>{
 const flags=[],net={sample(_f,rng,greedy,context){flags.push(greedy);const allowed=context.parameters[0].direction.map((v,i)=>v?i:null).filter(v=>v!==null);return {action:[0,allowed[greedy?0:Math.floor(rng.next()*allowed.length)],0,0]};}};
 const s=scenarios()[0],a=runCase({name:'probe',net},s,{seed:7,policySeed:101,greedy:true,record:true}),b=runCase({name:'probe',net},s,{seed:7,policySeed:202,greedy:true,record:true});assert.ok(flags.every(Boolean));assert.equal(a.replay.finalDigest,b.replay.finalDigest);flags.length=0;
 const c=runCase({name:'probe',net},s,{seed:7,policySeed:101,record:true}),d=runCase({name:'probe',net},s,{seed:7,policySeed:101,record:true});assert.ok(flags.every(x=>!x));assert.equal(c.replay.finalDigest,d.replay.finalDigest);assert.equal(c.policySeed,101);
});
test('Paired confidence intervals use game seeds as the independent unit',()=>{
 const {bootstrap,summarize,paired}=require('../sim/paired-evaluation.cjs');const rows=[];
 for(let seed=0;seed<4;seed++)for(const [greedy,policySeed,seconds]of [[true,1,20],[false,1,10],[false,2,14]])rows.push({policy:'nn',seed,greedy,policySeed,summary:{gameSeconds:seconds},success:false,hits:1,items:{milkBottles:0}});
 assert.deepEqual(paired(rows,'nn'),{mean:8,ci95:[8,8],nSeeds:4});const summary=summarize(rows);assert.equal(summary.find(r=>r.policy.endsWith('sample')).episodes,8);assert.equal(summary.find(r=>r.policy.endsWith('sample')).nSeeds,4);assert.deepEqual(bootstrap([2,2]),{mean:2,ci95:[2,2],nSeeds:2});assert.throws(()=>paired(rows.slice(1),'nn'),/Missing/);
});
