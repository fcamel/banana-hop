'use strict';
const assert=require('node:assert/strict'),{createEnvironment}=require('../sim/environment.cjs');
const {Network,Random,Adam,lossAndGradient,advantages,optimize}=require('../sim/ppo.cjs');
const {contract,featureCount,groups,decisionFrames,inViewport,encode,actionFor,trainingEnvironment}=require('../sim/training.cjs');
const {createStartBank,validateBank,rolloutJobs}=require('../sim/curriculum.cjs');
const {execute}=require('../sim/training-worker.cjs');
const {checkpoint,restore,trainingSetup}=require('../scripts/train-nn.cjs');
function test(name,fn){fn();console.log('PASS',name);}
test('Training and held-out evaluation use desktop only with four unique evaluation seeds',()=>{const setup=trainingSetup();assert.ok(setup.rollout*decisionFrames/60>=60,'A fresh rollout must have enough steps to reach the full survival horizon');assert.equal(setup.evaluationSeeds.length,4);assert.equal(new Set(setup.evaluationSeeds).size,4);assert.deepEqual(setup.profiles,[{width:1000,height:650,mobile:false}]);assert.ok(setup.evaluationSeeds.every(s=>s>=0xe0000000));});
function scene(){return {time:0,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:0,milkFuel:0,surfStock:0},enemies:[],milkBottles:[],milkDrops:[],spawnWarnings:[],pickups:[]};}
test('NN observation packs independent object types, states, velocities and past input without leaking future random choices',()=>{
  const o=scene(),base=encode(o);assert.equal(base.length,2784);assert.equal(base.length,featureCount);
  o.enemies=Array.from({length:50},(_,id)=>({id,type:'slice',x:10+id,y:0,stackCount:3,stackAnchor:true,stackTime:.5,sliceFlight:{ax:0,ay:0,bx:200,by:30,duration:.5}}));
  const crowded=encode(o);o.milkBottles.push({x:300,y:20,claimantId:1});assert.notDeepEqual(encode(o),crowded);
  const bottle=encode(o);o.enemies.push({type:'milk',x:40,y:30,milkPhase:'aim',milkTime:.5,milkAim:1});assert.notDeepEqual(encode(o),bottle);
  o.milkDrops.push({x:100,y:30,vx:240,vy:20,z:32,hostile:true,life:1});o.spawnWarnings.push({x:30,y:200,time:.25});assert.ok([...encode(o,[8,1,1,0])].every(Number.isFinite));
  o.player.futureRandomPosition=1000;assert.deepEqual(encode(o,[8,1,1,0]),encode({...o,player:{...o.player,futureRandomPosition:undefined}},[8,1,1,0]));
  assert.notDeepEqual(encode(o),encode(o,[1,1,0,0]));
});
test('Every object class retains its nearest k with deterministic ordering, overflow exclusion and zero padding',()=>{
  for(const [name,count,width] of groups){
    const o=scene(),items=Array.from({length:count+8},(_,i)=>({id:i+1,x:i+1,y:0,type:name==='milk'?'milk':'slice',hostile:true})).reverse();
    if(name==='slices'||name==='milk')o.enemies=items;else o[{bottles:'milkBottles',drops:'milkDrops',warnings:'spawnWarnings',pickups:'pickups'}[name]]=items;
    const offset=32+groups.slice(0,groups.findIndex(g=>g[0]===name)).reduce((sum,[,n,w])=>sum+n*w,0),features=encode(o);
    for(let i=0;i<count;i++){assert.equal(features[offset+i*width],1);assert.equal(features[offset+i*width+1],(i+1)/1250);}
    items.reverse();assert.deepEqual(encode(o),features,'input array order must not choose which objects are visible');
    items.splice(1);const padded=encode(o);assert.equal(padded[offset],1);assert.ok(Array.from(padded.slice(offset+width,offset+count*width)).every(n=>n===0));
  }
  const o=scene();o.enemies=[{id:2,x:3,y:4,type:'slice'},{id:1,x:-3,y:-4,type:'slice'}];assert.equal(encode(o)[33],-3/1250);
  assert.equal(contract,'milk-survival-v2');assert.ok(groups.find(g=>g[0]==='slices')[1]>=50);assert.ok(groups.find(g=>g[0]==='milk')[1]>=50);
});
test('Viewport filtering includes altitude and camera movement, and occurs before nearest-k selection for every object class',()=>{
  const o=scene(),p=o.player,w=o.viewport.width,h=o.viewport.height;
  assert.equal(inViewport(o,{x:-w/2,y:0}),true);assert.equal(inViewport(o,{x:-w/2-.01,y:0}),false);
  assert.equal(inViewport(o,{x:w/2+.01,y:0}),false);assert.equal(inViewport(o,{x:0,y:-h*.52/.72-.01}),false);
  assert.equal(inViewport(o,{x:0,y:(h-h*.52)/.72+.01}),false);
  assert.equal(inViewport(o,{x:0,y:0,z:h}),false);assert.equal(inViewport(o,{x:0,y:1000,z:600}),true);
  for(const [name,count,width] of groups){
    const s=scene(),field={bottles:'milkBottles',drops:'milkDrops',warnings:'spawnWarnings',pickups:'pickups'}[name],type=name==='milk'?'milk':'slice';
    const visible={id:999,x:300,y:0,type,hostile:true},hidden=Array.from({length:count+3},(_,id)=>({id,x:1,y:0,z:10000,type,hostile:true}));
    if(name==='slices'||name==='milk')s.enemies=[visible];else s[field]=[visible];
    const expected=encode(s);if(name==='slices'||name==='milk')s.enemies.push(...hidden);else s[field].push(...hidden);
    assert.deepEqual(encode(s),expected,name+' must not leak offscreen objects or let them consume slots');
    visible.x=501;const empty=encode(scene());assert.deepEqual(encode(s),empty,name+' must disappear immediately after exiting the viewport');
    s.player.x=1000;visible.x=1100;visible.z=0;assert.equal(inViewport(s,visible),true);assert.notDeepEqual(encode(s),empty);
  }
});
test('Space uses press edges for jumps and held state for jets, allowing simultaneous movement and skills',()=>{
  assert.deepEqual(actionFor([2,1,1,1],false),{x:1,y:1,jump:true,jet:true,dash:true,surf:true});assert.equal(actionFor([2,1,0,0],true).jump,false);assert.equal(actionFor([0,0,0,0],true).jet,false);assert.throws(()=>actionFor([9,0,0,0]),/Invalid/);
  const env=trainingEnvironment({seed:3});for(let i=0;i<15;i++)env.step([0,1,0,0]);assert.equal(env.observe().player.z,0);assert.equal(env.observe().player.vz,0);
  env.step([0,0,0,0]);env.step([0,1,0,0]);assert.ok(env.observe().player.z>0);
});
test('Survival task ends at 60 seconds without a boss; reward equals effective survival time and replays exactly',()=>{
  const env=createEnvironment({mode:'milk',seed:7,record:true,entrance:false,survivalOnly:true});let result;
  while(env.summary().outcome==='running')result=env.step(env.policy(env.observe()),6);
  assert.equal(env.summary().outcome,'win');assert.equal(env.summary().gameSeconds,60);assert.equal(env.summary().reward,60);assert.equal(env.summary().steps,3600);assert.equal(env.observe().giants.length,0);assert.equal(env.observe().boss,null);assert.equal(result.terminated,true);assert.equal(result.truncated,false);
  const tape=env.replay(),playback=createEnvironment().replayTape(tape);while(!playback.step().done){}assert.equal(playback.environment.summary().reward,60);
  assert.throws(()=>createEnvironment({mode:'boss',survivalOnly:true}),/requires milk/);
  const short=trainingEnvironment({seed:5});const r=short.step([0,0,0,0]);assert.equal(r.terminated,false);assert.ok(Math.abs(r.reward-.1)<1e-8);
});
let curriculumFixture;
function startFixture(){return curriculumFixture??=createStartBank({seed:7,size:1,maxAttempts:1});}
test('Authentic 30s/50s starts restore the full world, controls and future RNG without healing or reward for warmup',()=>{
  const bank=startFixture();validateBank(bank,bank.profile);
  for(const startAt of [30,50]){
    const entry=bank.starts[startAt][0],host=createEnvironment(),playback=host.replayTape(entry.tape);while(!playback.step().done){}
    const env=trainingEnvironment({...bank.profile,startSnapshots:[entry]});
    assert.equal(JSON.stringify(env.observe()),JSON.stringify(host.observe()));assert.deepEqual(env.features(),encode(env.observe(),entry.previous));assert.equal(env.summary().reward,0);assert.equal(env.summary().trainingSeconds,0);
    assert.equal(env.observe().player.hp,entry.tape.result.hp);assert.equal(env.observe().player.milkFuel,host.observe().player.milkFuel);
    const choice=[2,0,0,0],action=actionFor(choice,!!entry.previous[1]);const expected=host.step(action);let expectedReward=expected.reward;
    for(let i=1;i<6&&host.summary().outcome==='running';i++)expectedReward+=host.step({...action,jump:false,dash:false,surf:false}).reward;
    const actual=env.step(choice);assert.equal(JSON.stringify(env.observe()),JSON.stringify(host.observe()));assert.ok(Math.abs(actual.reward-expectedReward)<1e-8);assert.ok(actual.reward<=.1+1e-8);
    let reward=actual.reward;while(env.summary().outcome==='running')reward+=env.step([0,0,0,0]).reward;
    assert.ok(env.summary().gameSeconds<=60);assert.ok(reward<=60-startAt+1e-6);assert.ok(Math.abs(reward-(env.summary().gameSeconds-startAt))<1e-6);
    env.reset();const again=createEnvironment().replayTape(entry.tape);while(!again.step().done){}assert.equal(JSON.stringify(env.observe()),JSON.stringify(again.environment.observe()));
  }
  const invalid=JSON.parse(JSON.stringify(bank));invalid.starts[50][0].tape.config.seed=0xe0000000;assert.throws(()=>validateBank(invalid,bank.profile),/training seeds/);
  assert.throws(()=>validateBank({...bank,starts:{30:bank.starts[30],50:[]}},bank.profile),/Missing/);
});
test('Curriculum jobs use equal decision budgets; death restarts stay in the assigned stage and evaluation rejects late starts',()=>{
  const bank=startFixture(),config={...trainingSetup(),hidden:4},net=new Network(featureCount,4,new Random(1));
  const jobs=rolloutJobs({config,random:new Random(1),parameters:net.parameters,banks:[bank]});assert.deepEqual(jobs.map(j=>j.startAt),[0,30,50]);assert.ok(jobs.every(j=>j.decisions===1024));
  assert.equal(jobs.reduce((n,j)=>n+j.decisions,0),3072);
  for(const job of jobs){const result=execute({...job,decisions:4});assert.equal(result.buffer.length,4);assert.equal(result.startAt,job.startAt);assert.ok(Math.abs((60-result.buffer[0].features[15]*60)-job.startAt)<1e-6);assert.equal(Object.values(result.timeBuckets).reduce((a,b)=>a+b),4);}
  const entry=bank.starts[50][0],env=trainingEnvironment({...bank.profile,startSnapshots:[entry]});let deaths=0;
  for(let i=0;i<220;i++){const r=env.step([0,0,0,0]);if(r.terminated){deaths++;env.reset(i+1);assert.ok(Math.abs(env.observe().time-50)<1e-6);assert.equal(env.summary().reward,0);}}
  assert.ok(deaths>=2);assert.throws(()=>execute({...jobs[2],kind:'evaluate'}),/must start at 0s/);assert.throws(()=>execute({...jobs[1],kind:'baseline'}),/must start at 0s/);assert.throws(()=>execute({...jobs[1],startSnapshots:bank.starts[50]}),/match their assigned stage/);
  const late=execute({...jobs[2],decisions:128});assert.equal(late.buffer.length,128);assert.ok(late.episodes>=1);assert.equal(late.timeBuckets[50],128);assert.ok(late.buffer.every(t=>t.features[15]<=10/60+1e-6));for(const t of late.buffer.filter(t=>t.terminated))assert.ok(Math.abs(t.target-t.reward)<1e-6,'No bootstrap or previous episode reward at a true terminal');
  const opening=trainingEnvironment({seed:7});assert.equal(opening.observe().time,0);
});
test('PPO analytic gradients agree with finite differences across layers, entropy and both clipping branches',()=>{
  const rng=new Random(7),net=new Network(3,4,rng),inputs=[new Float64Array([.2,-.3,.8]),new Float64Array([-.7,.1,.3])];
  const batch=inputs.map((features,i)=>({...net.sample(features,rng),features,advantage:i?-.8:1.2,target:23}));
  for(const scenario of ['active','positive-clipped','negative-clipped']){
    for(const t of batch){t.advantage=scenario==='negative-clipped'?-.8:1.2;t.logp=net.sample(t.features,rng).logp;const f=net.forward(t.features);t.logp=f.probs.reduce((s,p,h)=>s+Math.log(p[t.action[h]]),0)+(scenario==='positive-clipped'?-.5:scenario==='negative-clipped'?.5:0);}
    const analytic=lossAndGradient(net,batch),indices=[0,8,net.layers[0].b,net.layers[1].w+3,net.layers[1].b+1,net.layers[2].w+4,net.layers[2].b+5,net.parameters.length-1];
    for(const at of indices){const old=net.parameters[at],eps=1e-5;net.parameters[at]=old+eps;const plus=lossAndGradient(net,batch).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,batch).loss;net.parameters[at]=old;assert.ok(Math.abs((plus-minus)/(2*eps)-analytic.gradient[at])<1e-6,scenario+' gradient '+at);}
  }
});
test('GAE bootstraps rollout cuts, never true terminals, and Adam/PPO change finite model weights',()=>{
  const terminal=advantages([{reward:1,value:2,terminated:true}],100);assert.equal(terminal[0].target,1);
  const cut=advantages([{reward:1,value:2,terminated:false}],10);assert.equal(cut[0].target,11);
  const rng=new Random(11),net=new Network(3,4,rng),adam=new Adam(net.parameters.length),before=Array.from(net.parameters),batch=[];
  for(let i=0;i<12;i++){const features=Float64Array.from([.2,i/12,-.3]),sample=net.sample(features,rng);batch.push({...sample,features,advantage:i%2?1:-1,target:10});}
  const stats=optimize(net,adam,batch,rng,{epochs:2,batchSize:4});assert.ok(stats.updates>0);assert.ok(Number.isFinite(stats.loss));assert.notDeepEqual(Array.from(net.parameters),before);
  const saved=checkpoint(new Network(featureCount,4,rng),new Adam(new Network(featureCount,4).parameters.length),{hidden:4},1,'test',rng,stats),loaded=restore(JSON.parse(JSON.stringify(saved)));assert.deepEqual(Array.from(loaded.net.parameters),saved.parameters);
  assert.throws(()=>restore({...saved,contract:'milk-survival-v1'}),/same game source/);assert.throws(()=>restore({...saved,sourceDigest:'old'}),/same game source/);assert.throws(()=>restore({...saved,parameters:[0]}),/Invalid/);
});
test('Checkpoint preserves optimizer and random stream for reproducible continuation',()=>{
  const rng=new Random(42),net=new Network(featureCount,4,rng),adam=new Adam(net.parameters.length),grad=Float64Array.from(net.parameters,()=>.01);adam.step(net.parameters,grad);
  const saved=checkpoint(net,adam,{hidden:4},2,'test',rng,null),restored=restore(saved),rng2=new Random(saved.randomState);assert.equal(rng.next(),rng2.next());adam.step(net.parameters,grad);restored.adam.step(restored.net.parameters,grad);assert.deepEqual(Array.from(net.parameters),Array.from(restored.net.parameters));
});
