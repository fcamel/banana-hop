'use strict';
const assert=require('node:assert/strict');
const {DirectionalRegionNetwork,architecture,directionRegions}=require('../sim/directional.cjs');
const {createNetwork,Random,Adam,heads,logProbability,lossAndGradient,optimize}=require('../sim/ppo.cjs');
const {featureCount,encode,skillEnvironment}=require('../sim/training.cjs');
const {skillContext}=require('../sim/skills.cjs');
const {checkpoint,restore}=require('../scripts/train-nn.cjs');
function test(name,fn){fn();console.log('PASS',name);}
function scene(){return {time:12,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:100,milkFuel:0,surfStock:1},enemies:[{id:1,type:'slice',x:170,y:80,z:30,stackCount:3},{id:2,type:'slice',x:-70,y:90,z:5},{id:3,type:'milk',x:110,y:-80,z:0}],milkBottles:[{id:4,x:290,y:40}],milkDrops:[{id:5,x:40,y:30,z:20,vx:200,vy:-30,hostile:true,life:1}],spawnWarnings:[{x:30,y:40,time:.3}],pickups:[{id:6,x:-100,y:0}],surfPickups:[{id:7,x:80,y:10}]};}
function close(a,b,eps=1e-9){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}
function item(net,o,skill=0,direction=1){const c=skillContext(o),masks=[c.skills,c.parameters[skill].direction,c.parameters[skill].target,c.parameters[skill].travel],features=encode(o),action=[skill,direction,skill===2?1:0,0],f=net.forward(features,masks,skill);return {features,masks,action,probs:f.probs,logp:logProbability(f.probs,action),value:f.value,advantage:1.2,target:17};}
test('Direction head has explicit screen-grid mapping and only its corresponding local vector changes a logit at fixed global context',()=>{
 assert.deepEqual(directionRegions,[4,5,8,7,6,3,0,1,2]);const net=new DirectionalRegionNetwork(featureCount,4,new Random(1)),c=net.forward(encode(scene()),null,0),before=c.activations[1].slice();const right=c.extension.regions[5];right.vector[0]+=.7;net.condition(c,0);const after=c.activations[1].slice();assert.notEqual(after[11],before[11]);for(let i=0;i<9;i++)if(i!==1)close(after[10+i],before[10+i]);
 net.condition(c,3);assert.notDeepEqual(c.activations[1].slice(10,19),after.slice(10,19),'Different skills use a one-hot context');
});
test('Reconditioning restores original directions for other skills and never changes skill logits or critic values',()=>{
 const net=new DirectionalRegionNetwork(featureCount,4,new Random(2)),f=encode(scene()),c=net.forward(f,null,0),skills=c.activations[1].slice(0,10),value=c.value;
 net.condition(c,2);assert.deepEqual(c.activations[1].slice(10,19),c.baseDirectionLogits);assert.equal(c.directional,null);assert.deepEqual(c.activations[1].slice(0,10),skills);const once=c.activations[1].slice();net.condition(c,0);net.condition(c,2);assert.deepEqual(c.activations[1],once);assert.equal(c.value,value);
});
test('All analytic gradients match finite differences across directional, ordinary, regional, global and target paths',()=>{
 const net=new DirectionalRegionNetwork(featureCount,4,new Random(3)),o=scene(),batch=[item(net,o,0,1),item(net,o,3,5),item(net,o,2,0)],r=lossAndGradient(net,batch),eps=1e-5;
 for(let at=0;at<net.parameters.length;at++){const old=net.parameters[at];net.parameters[at]=old+eps;const plus=lossAndGradient(net,batch).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,batch).loss;net.parameters[at]=old;assert.ok(Math.abs((plus-minus)/(2*eps)-r.gradient[at])<2e-6,`direction parameter ${at}`);}
 for(const l of [net.directionRelation,net.directionScore,net.regionRelation,net.regionFuse,net.q,net.targetQuery])assert.ok(r.gradient.slice(l.w,l.b).some(v=>Math.abs(v)>1e-12));
 const move=lossAndGradient(net,[batch[0]]).gradient;for(let j=10;j<19;j++){assert.equal(move[net.output.b+j],0);assert.ok(move.slice(net.output.w+j*4,net.output.w+(j+1)*4).every(v=>v===0),'Overwritten baseline direction neurons must not receive gradients');}
 const targeted=lossAndGradient(net,[batch[2]]).gradient;assert.ok(targeted.slice(net.directionRelation.w).every(v=>v===0),'Other skills do not train the spatial direction head');
});
test('Sampling records conditional PPO probabilities, handles forced waits, and preserves individual targets and permutation invariance',()=>{
 const net=new DirectionalRegionNetwork(featureCount,4,new Random(4)),o=scene(),f=encode(o),rng=new Random(5);for(let i=0;i<30;i++){const s=net.sample(f,rng,false,skillContext(o)),c=net.forward(f,s.masks,s.action[0]);close(s.logp,logProbability(c.probs,s.action));assert.deepEqual(s.probs,c.probs);assert.ok(s.masks.every((m,h)=>m[s.action[h]]));}
 o.player.down=.3;o.player.charge=0;o.player.surfStock=0;const wait=net.sample(encode(o),rng,false,skillContext(o));assert.deepEqual(wait.action,[0,0,0,0]);
 const swapped=f.slice();swapped.set(f.slice(50,68),32);swapped.set(f.slice(32,50),50);const a=net.forward(f,null,0),b=net.forward(swapped,null,0);for(let i=0;i<19;i++)close(a.activations[1][i],b.activations[1][i]);
});
test('New architecture supports real PPO updates, checkpoint roundtrips, worker rollout and exact primitive replay',()=>{
 const rng=new Random(6),net=createNetwork(featureCount,4,rng,architecture),s=item(net,scene()),before=net.parameters.slice();const stats=optimize(net,new Adam(net.parameters.length),[s,{...s,advantage:-.5,target:4}],rng,{epochs:1,batchSize:2});assert.equal(stats.updates,1);assert.notDeepEqual(net.parameters.slice(net.directionRelation.w),before.slice(net.directionRelation.w));
 const saved=checkpoint(net,new Adam(net.parameters.length),{hidden:4,architecture},1,'directional-test',rng,null),copy=restore(JSON.parse(JSON.stringify(saved)));assert.deepEqual(copy.net.parameters,net.parameters);assert.throws(()=>restore({...saved,architecture:'region-attention-v2'}),/architecture mismatch/);
 const env=skillEnvironment({seed:7,record:true});while(env.summary().outcome==='running'){const s=net.sample(env.features(),rng,false,env.context()),r=env.step(s.action);assert.ok(r.option.frames<=30);}require('../sim/environment.cjs').createEnvironment().restoreTape(env.replay());
 const result=require('../sim/training-worker.cjs').execute({kind:'rollout',startAt:0,seed:7,policySeed:8,profile:{width:1000,height:650,mobile:false},decisions:2,hidden:4,architecture,parameters:net.parameters});assert.equal(result.buffer.at(-1).terminated,true);
});
test('Controlled crowd and bullet probes preserve player/resources, change only intended threats, and never update weights',()=>{
 const {cases,diagnose}=require('../sim/direction-probes.cjs'),cs=cases(),net=new DirectionalRegionNetwork(featureCount,4,new Random(9));assert.equal(cs.length,4);for(const c of cs){assert.deepEqual(c.observation.player,cs[0].observation.player);assert.deepEqual(c.observation.milkBottles,cs[0].observation.milkBottles);}
 assert.deepEqual(cs[2].observation.milkDrops.map(e=>[e.x,e.y]),cs[3].observation.milkDrops.map(e=>[e.x,e.y]));assert.ok(cs[2].observation.milkDrops.every((e,i)=>e.vx===-cs[3].observation.milkDrops[i].vx));
 const before=net.parameters.slice(),d=diagnose(net);assert.deepEqual(net.parameters,before);for(const c of d)for(const s of c.skills){close(s.probabilities.reduce((a,b)=>a+b),1);assert.ok(s.probabilities.every(Number.isFinite));}assert.notDeepEqual(d[2].skills[0].probabilities,d[3].skills[0].probabilities,'Visible velocity must affect decisions, without asserting an untrained model chooses safety');
});
