'use strict';
const assert=require('node:assert/strict');
const {Network,Random,Adam,heads,policySize,rolloutDiagnostics,lossAndGradient,optimize}=require('../sim/ppo.cjs');
const {skillContext,validateChoice}=require('../sim/skills.cjs');
const {breakthroughTimes,validateStart}=require('../sim/curriculum.cjs');
const {evaluationSetup,improves,needsValidation,summarizeEvaluation,evaluatePolicy}=require('../sim/evaluation.cjs');
const {execute}=require('../sim/training-worker.cjs');
const {featureCount}=require('../sim/training.cjs');
function test(name,fn){fn();console.log('PASS',name);}
function scene(){return {viewport:{width:1000,height:650},player:{x:0,y:0,z:0,down:0,recoil:0,jumpLock:0,milkFuel:0,charge:100,surfStock:1},enemies:[],milkBottles:[],pickups:[],surfPickups:[]};}
test('Down and recoil canonicalize only ineffective movement; emergency directions remain selectable',()=>{
 for(const field of ['down','recoil']){const o=scene();o.player[field]=.5;const c=skillContext(o);assert.deepEqual(c.parameters[0].direction,[true,...Array(8).fill(false)]);assert.throws(()=>validateChoice([0,1,0,0],c),/Unavailable/);validateChoice([0,0,0,0],c);for(const skill of [4,5]){assert.equal(c.skills[skill],true);assert.equal(c.parameters[skill].direction.filter(Boolean).length,8);validateChoice([skill,1,0,0],c);}}
 const o=scene();assert.equal(skillContext(o).parameters[0].direction.filter(Boolean).length,9);o.special={};assert.equal(skillContext(o).parameters[0].direction.filter(Boolean).length,9);
});
test('Breakthrough extraction samples four to eight seconds before the end, safely handling short records',()=>{
 for(const end of [4,8,12,20,40,50,60]){const frames=breakthroughTimes(end);assert.equal(new Set(frames).size,frames.length);assert.ok(frames.length>=1&&frames.length<=5);assert.ok(frames.every(f=>f>0&&f<end*60));if(end>8)assert.ok(frames.every(f=>end-f/60>=4-1e-6&&end-f/60<=8+1/60+1e-6));}
 assert.deepEqual(breakthroughTimes(60),[3120,3180,3240,3300,3360]);assert.deepEqual(breakthroughTimes(50),[2520,2580,2640,2700,2760]);assert.throws(()=>breakthroughTimes(3),/Invalid/);
});
test('Final rollout diagnostics use one fixed policy, weighted factual targets and explicit forced heads',()=>{
 const net=new Network(2,4,new Random(1));net.parameters.fill(0);const masks=heads.map(n=>Array.from({length:n},(_,i)=>i===0));
 const samples=[{features:[0,0],target:10,value:8,weight:1},{features:[1,0],target:20,value:16,weight:3}].map(s=>({...s,masks,action:[0,0,0,0],probs:net.forward(s.features,masks).probs,logp:0,advantage:s.target-s.value}));
 const before=Array.from(net.parameters),d=rolloutDiagnostics(net,samples);assert.equal(d.kl,0);assert.deepEqual(d.headEntropy,[0,0,0,0]);assert.deepEqual(d.normalizedHeadEntropy,[null,null,null,null]);assert.equal(d.policyChoiceFraction,0);assert.equal(d.targetMean,17.5);assert.equal(d.targetVariance,18.75);assert.equal(d.valueBefore.mae,3.5);assert.equal(d.valueBefore.bias,-3.5);assert.ok(Math.abs(d.valueBefore.explainedVariance-.96)<1e-12);assert.equal(d.valueAfter.mae,17.5);assert.equal(d.valueAfter.explainedVariance,0);assert.deepEqual(Array.from(net.parameters),before);
 const loss=lossAndGradient(net,samples);const output=net.layers.at(-1);assert.ok(Array.from(loss.gradient.slice(output.b,output.b+policySize)).every(x=>x===0));assert.notEqual(loss.gradient[output.b+policySize],0,'Forced waits still train factual state values');
 const free=[{features:[0,0],target:5,value:0,action:[0,0,0,0],probs:net.forward([0,0]).probs,advantage:5,logp:-heads.reduce((s,n)=>s+Math.log(n),0)}];net.parameters[output.b]=1;assert.ok(rolloutDiagnostics(net,free).kl>0);assert.equal(rolloutDiagnostics(net,free).valueAfter.explainedVariance,null);
 const stats=optimize(net,new Adam(net.parameters.length),samples,new Random(4),{epochs:2,batchSize:2});assert.equal(stats.epochStats.length,2);assert.equal(stats.diagnostics.klBasis,'full-rollout-after-update');assert.ok(stats.diagnostics.valueAfter.mae<d.valueAfter.mae);assert.equal(stats.diagnostics.samples,2);
});
test('Validation and final tests are disjoint, scheduled independently and never select by quick scores',()=>{
 const s=evaluationSetup(),all=[...s.evaluationSeeds,...s.validationSeeds,...s.testSeeds];assert.equal(new Set(all).size,all.length);assert.ok(all.every(x=>x>=0x40000000));assert.equal(s.validationSeeds.length,16);assert.equal(s.testSeeds.length,16);
 assert.equal(needsValidation(1,20,-Infinity),true);assert.equal(needsValidation(10,10,30),true);assert.equal(needsValidation(11,30,29),true);assert.equal(needsValidation(11,29,29),false);assert.equal(improves(29+1e-10,29),false);
 const a=summarizeEvaluation([{score:60},{score:20}],[1,2]),b=summarizeEvaluation([{score:41},{score:41}],[1,2]);assert.equal(a.mean,40);assert.equal(a.successRate,.5);assert.ok(improves(b.mean,a.mean));assert.throws(()=>summarizeEvaluation([{score:61}],[1]),/Invalid/);
});
(async()=>{
 const jobs=[],net=new Network(featureCount,4,new Random(2)),config={profiles:[{width:1000,height:650,mobile:false}],hidden:4,architecture:'mlp-v1'};
 await evaluatePolicy({run:async job=>{jobs.push(job);return {score:12};}},net,config,[0xe2000000,0xe2000001],0xb0000000);
 assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.recordReplay===false&&!j.startSnapshots&&!j.startAt));assert.equal(jobs[1].policySeed,0xb0000001);
 const result=execute(jobs[0]);assert.ok(result.score>0&&result.score<=60);assert.ok(!('replay' in result));assert.ok(Number.isInteger(result.forcedDecisions));assert.ok(result.damage.summary);const recorded=execute({...jobs[0],recordReplay:true});assert.ok(recorded.replay);assert.equal(recorded.score,result.score);assert.deepEqual(recorded.itemMetrics,result.itemMetrics);assert.deepEqual(recorded.damage,result.damage);console.log('PASS Held-out evaluation executes real complete episodes without recording replay or curriculum snapshots');
})().catch(e=>{console.error(e);process.exitCode=1;});
