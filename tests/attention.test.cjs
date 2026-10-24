'use strict';
const assert=require('node:assert/strict');
const {AttentionNetwork,architecture}=require('../sim/attention.cjs');
const {Network,Random,Adam,createNetwork,logProbability,lossAndGradient,optimize,policySize}=require('../sim/ppo.cjs');
const {featureCount,groups,encode,skillEnvironment}=require('../sim/training.cjs');
const {skillContext}=require('../sim/skills.cjs');
const {checkpoint,restore}=require('../scripts/train-nn.cjs');
function test(name,fn){fn();console.log('PASS',name);}
function scene(){return {time:10,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:100,milkFuel:0,surfStock:1},enemies:[{id:1,type:'slice',x:60,y:30,z:12,stackCount:3},{id:2,type:'slice',x:-100,y:20},{id:3,type:'milk',x:40,y:60}],milkBottles:[{id:4,x:200,y:40}],milkDrops:[{id:5,x:40,y:30,z:20,vx:-200,vy:30,hostile:true,life:1}],spawnWarnings:[{x:30,y:40,time:.3}],pickups:[{id:6,x:-100,y:0}],surfPickups:[{id:7,x:80,y:10}]};}
function item(net,f,context,skill=2){const masks=[context.skills,context.parameters[skill].direction,context.parameters[skill].target,context.parameters[skill].travel],raw=net.forward(f,masks,skill),action=[skill,0,1,0];return {features:f,masks,action,probs:raw.probs,logp:logProbability(raw.probs,action),value:raw.value,advantage:1.2,target:17};}
function close(a,b,eps=1e-9){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}
test('Entity attention shares type encoders, excludes padded slots and handles a player-only scene',()=>{
 const net=new AttentionNetwork(featureCount,4,new Random(1)),o=scene(),f=encode(o),raw=net.forward(f);
 assert.equal(raw.tokens.length,9);assert.equal(net.encoders.length,8);assert.ok(raw.tokens.every(t=>t.z.length===4));assert.equal(raw.tokens[1].group,raw.tokens[2].group);
 const absent=f.slice();absent.fill(999,32+2*18+1,32+3*18);const padded=net.forward(absent);assert.deepEqual(raw.activations.at(-1),padded.activations.at(-1));
 const empty=encode({...o,enemies:[],milkBottles:[],milkDrops:[],spawnWarnings:[],pickups:[],surfPickups:[]});const single=net.forward(empty);assert.equal(single.tokens.length,1);assert.ok(single.activations.at(-1).every(Number.isFinite));assert.equal(single.probs[2][0],1);
 assert.throws(()=>new AttentionNetwork(featureCount,5),/even/);
});
test('Self-attention is permutation invariant for scene outputs and equivariant for target scores',()=>{
 const net=new AttentionNetwork(featureCount,8,new Random(4)),f=encode(scene()),swapped=f.slice(),width=groups[0][2];swapped.set(f.slice(32+width,32+2*width),32);swapped.set(f.slice(32,32+width),32+width);
 const a=net.forward(f,null,2),b=net.forward(swapped,null,2),x=a.activations.at(-1),y=b.activations.at(-1);
 for(let i=0;i<x.length;i++)if(i!==20&&i!==21)close(x[i],y[i]);close(x[20],y[21]);close(x[21],y[20]);
 const changed=f.slice();const dropOffset=32+64*18+64*13+12*4;changed[dropOffset+1]+=.2;assert.notDeepEqual(net.forward(changed).tokens[1].z,a.tokens[1].z,'An enemy representation must respond to a visible bullet through attention');
});
test('Attention analytic gradients agree with finite differences through every encoder, Q/K/V, residual block and conditional target head',()=>{
 const net=new AttentionNetwork(featureCount,4,new Random(7)),o=scene(),f=encode(o),sample=item(net,f,skillContext(o));
 const result=lossAndGradient(net,[sample]);const eps=1e-5;
 for(let at=0;at<net.parameters.length;at++){
  const old=net.parameters[at];net.parameters[at]=old+eps;const plus=lossAndGradient(net,[sample]).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,[sample]).loss;net.parameters[at]=old;
  const numeric=(plus-minus)/(2*eps);assert.ok(Math.abs(numeric-result.gradient[at])<2e-6,`attention parameter ${at}: ${numeric} vs ${result.gradient[at]}`);
 }
 for(const layer of [net.encoders[0][0],net.encoders[1][0],net.encoders[4][0],net.q,net.k,net.v,net.o,net.ff1,net.poolQ,net.poolK,net.poolV,net.poolO,net.targetQuery,net.targetKey])assert.ok(result.gradient.slice(layer.w,layer.b).some(v=>Math.abs(v)>1e-12),'Gradient must reach each required path');
 assert.ok(result.gradient.slice(net.skillEmbedding+2*4,net.skillEmbedding+3*4).some(v=>v!==0));
});
test('Conditional sampling stores the same joint probabilities used by PPO and respects all canonical masks',()=>{
 const o=scene(),context=skillContext(o),f=encode(o),net=new AttentionNetwork(featureCount,8,new Random(8)),rng=new Random(9);
 for(let i=0;i<30;i++){const s=net.sample(f,rng,false,context),raw=net.forward(f,s.masks,s.action[0]);close(logProbability(raw.probs,s.action),s.logp);assert.deepEqual(raw.probs,s.probs);assert.ok(s.masks.every((mask,h)=>mask[s.action[h]]));}
 const a=net.forward(f,null,2),b=net.forward(f,null,7);assert.notDeepEqual(a.probs[2],b.probs[2]);assert.equal(a.value,b.value);
 const one=item(net,f,context);const adam=new Adam(net.parameters.length),before=net.parameters.slice();const stats=optimize(net,adam,[one,{...one,advantage:-.5,target:4}],rng,{epochs:1,batchSize:2});assert.equal(stats.updates,1);assert.notDeepEqual(net.parameters,before);
});
test('Attention checkpoints preserve architecture, Adam and random state and reject incompatible models',()=>{
 const rng=new Random(11),net=createNetwork(featureCount,4,rng,architecture),adam=new Adam(net.parameters.length),g=Float64Array.from(net.parameters,()=>.01);adam.step(net.parameters,g);
 const saved=checkpoint(net,adam,{hidden:4,architecture},2,'attention-test',rng,null),copy=restore(JSON.parse(JSON.stringify(saved)));
 assert.ok(copy.net instanceof AttentionNetwork);assert.deepEqual(copy.net.parameters,net.parameters);assert.equal(copy.adam.t,adam.t);adam.step(net.parameters,g);copy.adam.step(copy.net.parameters,g);assert.deepEqual(copy.net.parameters,net.parameters);
 assert.throws(()=>restore({...saved,architecture:'mlp-v1'}),/architecture mismatch/);assert.ok(createNetwork(featureCount,4,rng,'mlp-v1') instanceof Network);assert.throws(()=>createNetwork(featureCount,4,rng,'typo'),/Unknown/);
});
test('An attention policy runs real physics with half-second decisions and exact primitive replay',()=>{
 const env=skillEnvironment({seed:7,record:true}),net=new AttentionNetwork(featureCount,4,new Random(12)),rng=new Random(13);let reward=0;
 while(env.summary().outcome==='running'){const s=net.sample(env.features(),rng,false,env.context()),r=env.step(s.action);assert.ok(r.option.frames<=30);reward+=r.reward;}
 close(reward,env.summary().gameSeconds,1e-7);require('../sim/environment.cjs').createEnvironment().restoreTape(env.replay());
});
test('Training workers use the requested architecture and collect complete episodes with real damage statistics',()=>{
 const {execute}=require('../sim/training-worker.cjs'),net=new AttentionNetwork(featureCount,4,new Random(15));
 const job={kind:'rollout',startAt:0,seed:7,policySeed:8,profile:{width:1000,height:650,mobile:false},decisions:2,hidden:4,architecture,parameters:net.parameters};
 const r=execute(job);assert.ok(r.buffer.length>=2);assert.equal(r.buffer.at(-1).terminated,true);assert.ok(r.damage.hits>0);assert.equal(r.startAt,0);assert.ok(r.buffer.every(x=>x.features.length===featureCount));
 assert.throws(()=>execute({...job,architecture:'mlp-v1'}),/parameter size mismatch/);
});
