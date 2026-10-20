'use strict';
const assert=require('node:assert/strict'),{createEnvironment}=require('../sim/environment.cjs');
const {Network,Random,Adam,policySize,lossAndGradient,monteCarloReturns,optimize}=require('../sim/ppo.cjs');
const {contract,featureCount,groups,decisionFrames,inViewport,encode,actionFor,trainingEnvironment,skillEnvironment}=require('../sim/training.cjs');
const {createStartBank,validateBank,rolloutJobs,decisionBudgets,weightRollouts,materialize,breakthroughStarts}=require('../sim/curriculum.cjs');
const {MotionHistory}=require('../sim/motion.cjs');
const {skills,heads,targetSlots,skillContext,validateChoice,createOption,optionControl}=require('../sim/skills.cjs');
const {execute}=require('../sim/training-worker.cjs');
const {checkpoint,restore,trainingSetup}=require('../scripts/train-nn.cjs');
function test(name,fn){fn();console.log('PASS',name);}
test('Training and held-out evaluation use desktop only with four unique evaluation seeds',()=>{const setup=trainingSetup();assert.ok(setup.rollout*decisionFrames/60>=60,'A fresh rollout must have enough steps to reach the full survival horizon');assert.equal(setup.evaluationSeeds.length,4);assert.equal(new Set(setup.evaluationSeeds).size,4);assert.deepEqual(setup.profiles,[{width:1000,height:650,mobile:false}]);assert.ok(setup.evaluationSeeds.every(s=>s>=0xe0000000));});
function scene(){return {time:0,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:0,milkFuel:0,surfStock:0},enemies:[],milkBottles:[],milkDrops:[],spawnWarnings:[],pickups:[],surfPickups:[]};}
test('NN observation packs independent object types, states, velocities and past input without leaking future random choices',()=>{
  const o=scene(),base=encode(o);assert.equal(base.length,3296);assert.equal(base.length,featureCount);
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
    if(name==='slices'||name==='milk')o.enemies=items;else o[{bottles:'milkBottles',drops:'milkDrops',warnings:'spawnWarnings',pickups:'pickups',surfPickups:'surfPickups'}[name]]=items;
    const offset=32+groups.slice(0,groups.findIndex(g=>g[0]===name)).reduce((sum,[,n,w])=>sum+n*w,0),features=encode(o);
    for(let i=0;i<count;i++){assert.equal(features[offset+i*width],1);assert.equal(features[offset+i*width+1],(i+1)/1250);}
    items.reverse();assert.deepEqual(encode(o),features,'input array order must not choose which objects are visible');
    items.splice(1);const padded=encode(o);assert.equal(padded[offset],1);assert.ok(Array.from(padded.slice(offset+width,offset+count*width)).every(n=>n===0));
  }
  const o=scene();o.enemies=[{id:2,x:3,y:4,type:'slice'},{id:1,x:-3,y:-4,type:'slice'}];assert.equal(encode(o)[33],-3/1250);
  assert.equal(contract,'milk-skills-v4');assert.ok(groups.find(g=>g[0]==='slices')[1]>=50);assert.ok(groups.find(g=>g[0]==='milk')[1]>=50);
});
test('Viewport filtering includes altitude and camera movement, and occurs before nearest-k selection for every object class',()=>{
  const o=scene(),p=o.player,w=o.viewport.width,h=o.viewport.height;
  assert.equal(inViewport(o,{x:-w/2,y:0}),true);assert.equal(inViewport(o,{x:-w/2-.01,y:0}),false);
  assert.equal(inViewport(o,{x:w/2+.01,y:0}),false);assert.equal(inViewport(o,{x:0,y:-h*.52/.72-.01}),false);
  assert.equal(inViewport(o,{x:0,y:(h-h*.52)/.72+.01}),false);
  assert.equal(inViewport(o,{x:0,y:0,z:h}),false);assert.equal(inViewport(o,{x:0,y:1000,z:600}),true);
  for(const [name,count,width] of groups){
    const s=scene(),field={bottles:'milkBottles',drops:'milkDrops',warnings:'spawnWarnings',pickups:'pickups',surfPickups:'surfPickups'}[name],type=name==='milk'?'milk':'slice';
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
    assert.equal(JSON.stringify(env.observe()),JSON.stringify(host.observe()));assert.deepEqual(env.features(),encode(env.observe(),entry.previous,env.motion()));assert.equal(env.summary().reward,0);assert.equal(env.summary().trainingSeconds,0);
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
test('Curriculum uses weighted minimum budgets, finishes every episode and keeps resets in the assigned stage',()=>{
  const bank=startFixture(),config={...trainingSetup(),hidden:4},net=new Network(featureCount,4,new Random(1));
  const jobs=rolloutJobs({config,random:new Random(1),parameters:net.parameters,banks:[bank]});assert.deepEqual(jobs.map(j=>j.startAt),[0,30,50]);assert.deepEqual(jobs.map(j=>j.decisions),[1075,1075,922]);
  for(const n of [8,32,1024,16384])assert.equal(decisionBudgets(n).reduce((a,b)=>a+b),3*n);
  assert.equal(jobs.reduce((n,j)=>n+j.decisions,0),3072);
  for(const job of jobs){const result=execute({...job,decisions:4});assert.ok(result.buffer.length>=4);assert.equal(result.buffer.at(-1).terminated,true);let rewards=0;for(let i=result.buffer.length-1;i>=0;i--){const t=result.buffer[i];if(t.terminated)rewards=0;rewards+=t.reward;assert.ok(Math.abs(t.target-rewards)<1e-8);assert.ok(Math.abs(t.advantage-(t.target-t.value))<1e-8);}assert.equal(result.startAt,job.startAt);assert.ok(Math.abs((60-result.buffer[0].features[15]*60)-job.startAt)<1e-6);assert.equal(Object.values(result.timeBuckets).reduce((a,b)=>a+b),result.buffer.length);}
  const entry=bank.starts[50][0],env=trainingEnvironment({...bank.profile,startSnapshots:[entry]});let deaths=0;
  for(let i=0;i<220;i++){const r=env.step([0,0,0,0]);if(r.terminated){deaths++;env.reset(i+1);assert.ok(Math.abs(env.observe().time-50)<1e-6);assert.equal(env.summary().reward,0);}}
  assert.ok(deaths>=2);assert.throws(()=>execute({...jobs[2],kind:'evaluate'}),/must start at 0s/);assert.throws(()=>execute({...jobs[1],kind:'baseline'}),/must start at 0s/);assert.throws(()=>execute({...jobs[1],startSnapshots:bank.starts[50]}),/match their assigned stage/);
  const late=execute({...jobs[2],decisions:128});assert.ok(late.buffer.length>=128&&late.buffer.length<228);assert.equal(late.buffer.at(-1).terminated,true);assert.ok(late.episodes>=1);assert.equal(late.timeBuckets[50],late.buffer.length);assert.ok(late.buffer.every(t=>t.features[15]<=10/60+1e-6));for(const t of late.buffer.filter(t=>t.terminated))assert.ok(Math.abs(t.target-t.reward)<1e-6,'No bootstrap or previous episode reward at a true terminal');
  const opening=trainingEnvironment({seed:7});assert.equal(opening.observe().time,0);
});
test('PPO analytic gradients agree with finite differences across layers, entropy and both clipping branches',()=>{
  const rng=new Random(7),net=new Network(3,4,rng),inputs=[new Float64Array([.2,-.3,.8]),new Float64Array([-.7,.1,.3])];
  const batch=inputs.map((features,i)=>({...net.sample(features,rng),features,advantage:i?-.8:1.2,target:23}));
  batch[0].weight=.4;batch[1].weight=1.6;
  for(const scenario of ['active','positive-clipped','negative-clipped']){
    for(const t of batch){t.advantage=scenario==='negative-clipped'?-.8:1.2;t.logp=net.sample(t.features,rng).logp;const f=net.forward(t.features);t.logp=f.probs.reduce((s,p,h)=>s+Math.log(p[t.action[h]]),0)+(scenario==='positive-clipped'?-.5:scenario==='negative-clipped'?.5:0);}
    const analytic=lossAndGradient(net,batch),indices=[0,8,net.layers[0].b,net.layers[1].w+3,net.layers[1].b+1,net.layers[2].w+4,net.layers[2].b+5,net.parameters.length-1];
    for(const at of indices){const old=net.parameters[at],eps=1e-5;net.parameters[at]=old+eps;const plus=lossAndGradient(net,batch).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,batch).loss;net.parameters[at]=old;assert.ok(Math.abs((plus-minus)/(2*eps)-analytic.gradient[at])<1e-6,scenario+' gradient '+at);}
  }
});
test('Monte Carlo targets use only observed rewards, reject incomplete episodes, and Adam/PPO update finite weights',()=>{
  const episode=[{reward:.1,value:500,terminated:false},{reward:.05,value:-99,terminated:true}];
  monteCarloReturns(episode);assert.ok(Math.abs(episode[0].target-.15)<1e-8);assert.equal(episode[1].target,.05);assert.equal(episode[0].advantage,episode[0].target-500);
  assert.throws(()=>monteCarloReturns([{reward:1,value:10,terminated:false}]),/complete episode/);
  assert.throws(()=>monteCarloReturns([{reward:1,value:10,terminated:true},{reward:1,value:10,terminated:true}]),/complete episode/);
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

test('Completed tails keep exact stage loss mass and weighted advantage normalization',()=>{
  const results=[{startAt:0,buffer:Array.from({length:7},()=>({advantage:2}))},{startAt:30,buffer:Array.from({length:5},()=>({advantage:4}))},{startAt:50,buffer:Array.from({length:4},()=>({advantage:8}))}];
  const buffer=weightRollouts(results);for(const [i,share] of [.35,.35,.30].entries())assert.ok(Math.abs(results[i].buffer.reduce((s,t)=>s+t.weight,0)/buffer.length-share)<1e-12);
  const net=new Network(3,4,new Random(1)),adam=new Adam(net.parameters.length),rng=new Random(2);
  for(const t of buffer){t.features=Float64Array.from([0,.1,.2]);Object.assign(t,net.sample(t.features,rng));t.target=1;}
  optimize(net,adam,buffer,rng,{epochs:1,batchSize:3});
  assert.ok(Math.abs(buffer.reduce((s,t)=>s+t.weight*t.advantage,0))<1e-8);
  assert.ok(Math.abs(buffer.reduce((s,t)=>s+t.weight*t.advantage**2,0)/buffer.length-1)<1e-6);
});
test('Changing only critic predictions cannot change rollout returns or action trajectories',()=>{
  const bank=startFixture(),net=new Network(featureCount,4,new Random(1)),job={kind:'rollout',startAt:50,startSnapshots:bank.starts[50],seed:7,policySeed:9,profile:bank.profile,decisions:1,hidden:4,parameters:net.parameters};
  const a=execute(job);net.parameters[net.layers.at(-1).b+policySize]+=100;
  const b=execute(job);assert.deepEqual(a.buffer.map(t=>[t.action,t.reward,t.target,t.terminated]),b.buffer.map(t=>[t.action,t.reward,t.target,t.terminated]));
  assert.notEqual(a.buffer[0].value,b.buffer[0].value);assert.notEqual(a.buffer[0].advantage,b.buffer[0].advantage);
});

test('Skill masks expose only visible encoded targets and available resources, with canonical unused parameters',()=>{
  const o=scene();o.enemies=[{id:3,type:'slice',x:501,y:0},{id:2,type:'slice',x:80,y:0},{id:1,type:'slice',x:40,y:0},{id:4,type:'milk',x:90,y:0}];o.milkBottles=[{x:150,y:0}];o.pickups=[{id:5,x:120,y:0}];
  const slots=targetSlots(o),features=encode(o),context=skillContext(o);
  assert.equal(slots.length,173);assert.equal(slots[1].object.id,1);assert.equal(slots[2].object.id,2);assert.equal(slots[3],null);assert.equal(slots[65].object.id,4);assert.equal(slots[129].kind,'bottle');assert.equal(slots[141].kind,'pickup');
  assert.equal(slots[1].object.x/1250,features[33]);assert.equal(slots[65].object.x/1250,features[32+64*18+1]);
  assert.deepEqual(context.skills,[true,true,true,true,false,false,false,true,true,false]);assert.equal(context.parameters[2].target[129],false);assert.equal(context.parameters[1].target[129],false);
  assert.throws(()=>validateChoice([2,0,129],context),/Unavailable/);assert.throws(()=>validateChoice([0,0,1],context),/Unavailable/);
  o.player.charge=100;o.player.surfStock=1;o.player.milkFuel=1;assert.deepEqual(skillContext(o).skills,[true,true,false,false,true,true,true,true,true,false]);
  o.player.down=.5;assert.deepEqual(skillContext(o).skills,[true,false,false,false,true,true,false,false,false,false]);
});
test('Options keep target identity, stop at visibility loss, leave jump timing and risk to the policy and trigger aimed skills once',()=>{
  const o=scene();o.enemies=[{id:1,type:'slice',x:50,y:0},{id:2,type:'slice',x:100,y:0}];
  const option=createOption([2,0,1],o);let c=optionControl(option,o);assert.equal(c.action.jump,true);assert.ok(c.action.x>0);
  o.enemies.reverse();o.enemies.find(e=>e.id===2).x=10;o.player.z=40;o.player.vz=100;
  c=optionControl(option,o);assert.ok(c.action.x>0);assert.equal(c.action.jump,false);
  o.enemies.find(e=>e.id===1).x=600;assert.equal(optionControl(option,o).reason,'target-lost');
  o.player.z=0;o.player.charge=100;const ultimate=createOption([4,5,0],o);c=optionControl(ultimate,o);assert.equal(c.action.x,-1);assert.equal(c.action.dash,true);assert.equal(optionControl(ultimate,o).action.dash,false);
  o.special={};optionControl(ultimate,o);o.special=null;assert.equal(optionControl(ultimate,o).reason,'finished');
  const jetScene=scene();jetScene.player.milkFuel=1;const jet=createOption([6,0,0],jetScene);assert.equal(optionControl(jet,jetScene).action.jet,true);jetScene.player.milkFuel=0;assert.equal(optionControl(jet,jetScene).reason,'empty');
});
test('Masked policy sampling and PPO likelihood agree; excluded parameters receive no gradient',()=>{
  const o=scene(),context=skillContext(o),net=new Network(3,4,new Random(5)),rng=new Random(9),features=Float64Array.from([.1,.2,.3]);
  for(let i=0;i<30;i++){const t=net.sample(features,rng,false,context);validateChoice(t.action,context);assert.equal(t.action[2],0);const f=net.forward(features,t.masks);assert.ok(Math.abs(t.logp-f.probs.reduce((s,p,h)=>s+Math.log(p[t.action[h]]),0))<1e-12);}
  const sample=net.sample(features,rng,false,context),item={...sample,features,advantage:1,target:3};const result=lossAndGradient(net,[item]),layer=net.layers.at(-1);
  for(let j=heads[0]+heads[1];j<policySize;j++)assert.equal(result.gradient[layer.b+j],0);
  for(const at of [layer.b,layer.b+heads[0]+1,layer.w+heads[0]*4,net.layers[0].w,net.parameters.length-1]){
    const old=net.parameters[at],eps=1e-5;net.parameters[at]=old+eps;const plus=lossAndGradient(net,[item]).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,[item]).loss;net.parameters[at]=old;
    assert.ok(Math.abs((plus-minus)/(2*eps)-result.gradient[at])<1e-6);
  }
  net.parameters[layer.b+4]=10000;assert.doesNotThrow(()=>validateChoice(net.sample(features,rng,false,context).action,context));
});
test('Parameterized options accumulate real elapsed rewards and preserve exact primitive-input replay',()=>{
  const env=skillEnvironment({seed:17,record:true}),net=new Network(featureCount,4,new Random(4)),rng=new Random(8);let reward=0,decisions=0;
  while(env.summary().outcome==='running'){
    const sampled=net.sample(env.features(),rng,false,env.context()),before=env.summary().steps,result=env.step(sampled.action);decisions++;reward+=result.reward;
    assert.ok(result.info.steps>before);assert.equal(result.option.frames,result.info.steps-before);assert.ok(result.option.frames<=skills[sampled.action[0]].seconds*60);assert.ok(Math.abs(result.reward-result.option.frames/60)<1e-6);
  }
  assert.ok(decisions<=601);assert.ok(Math.abs(reward-env.summary().gameSeconds)<1e-6);const playback=createEnvironment().replayTape(env.replay());while(!playback.step().done){}assert.equal(playback.environment.summary().gameSeconds,env.summary().gameSeconds);
});

test('Jump-stomp option can kill a real enemy without granting damage or changing collision rules',()=>{
  const env=skillEnvironment({seed:7}),before=env.observe().player.hp,result=env.step([2,0,1]);
  assert.equal(env.observe().kills,1);assert.equal(env.observe().player.hp,before);assert.ok(result.option.frames>6);assert.ok(Math.abs(result.reward-env.observe().time)<1e-8);
});
test('Masked target-parameter gradients match numerical loss derivatives',()=>{
  const o=scene();o.enemies=[{id:1,type:'slice',x:100,y:0},{id:2,type:'slice',x:-80,y:0}];const context=skillContext(o),net=new Network(3,4,new Random(13)),rng=new Random(6),features=Float64Array.from([.2,-.1,.4]),layer=net.layers.at(-1);
  net.parameters[layer.b+2]=5;const sample=net.sample(features,rng,true,context);assert.equal(sample.action[0],2);assert.ok(sample.action[2]>0);const item={...sample,features,advantage:.7,target:10},result=lossAndGradient(net,[item]);
  for(const at of [layer.b+heads[0]+heads[1]+1,layer.b+heads[0]+heads[1]+2,layer.w+(heads[0]+heads[1]+1)*4,layer.b+2]){
    const old=net.parameters[at],eps=1e-5;net.parameters[at]=old+eps;const plus=lossAndGradient(net,[item]).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,[item]).loss;net.parameters[at]=old;assert.ok(Math.abs((plus-minus)/(2*eps)-result.gradient[at])<1e-6);
  }
});

test('Visible height history distinguishes ascent/descent at equal height without reading flight endpoints',()=>{
  const o=scene();o.player.z=60;o.enemies=[{id:1,type:'slice',x:40,y:0,z:20,sliceFlight:{t:0,duration:1,ax:0,ay:0,bx:300,by:0}}];
  const history=new MotionHistory();history.update(o);assert.equal(encode(o,[0,0,0,0],history)[32+16],0);
  o.time=.1;o.enemies[0].x=50;o.enemies[0].z=30;history.update(o);const up=encode(o,[0,0,0,0],history);
  assert.ok(Math.abs(up[32+11]-.2)<1e-8);assert.ok(Math.abs(up[32+14]-.25)<1e-8);assert.equal(up[32+15],-.15);assert.equal(up[32+16],1);
  const falling=new MotionHistory();o.time=0;o.enemies[0].z=40;falling.update(o);o.time=.1;o.enemies[0].z=30;falling.update(o);
  const down=encode(o,[0,0,0,0],falling);assert.equal(up[32+3],down[32+3]);assert.ok(down[32+14]<0);
  const before=encode(o,[0,0,0,0],history);Object.assign(o.enemies[0].sliceFlight,{t:999,duration:999,bx:-10000,by:20000});assert.deepEqual(encode(o,[0,0,0,0],history),before);
  history.update(o);assert.deepEqual(encode(o,[0,0,0,0],history),before,'Repeated observation must not erase a valid velocity');
});
test('Lost visibility, new identities and environment resets invalidate measured motion',()=>{
  const o=scene(),e={id:1,type:'milk',x:0,y:0,z:0};o.enemies=[e];const history=new MotionHistory();history.update(o);
  o.time=.1;e.x=10;history.update(o);assert.equal(history.get(e).valid,true);
  o.time=.2;e.x=501;history.update(o);assert.equal(history.get(e).valid,false);
  o.time=.3;e.x=20;history.update(o);assert.equal(history.get(e).valid,false);
  o.time=.4;e.x=25;history.update(o);assert.equal(history.get(e).valid,true);
  e.type='slice';o.time=.5;history.update(o);assert.equal(history.get(e).valid,false);
  const env=trainingEnvironment({seed:7});env.step([0,0,0,0]);assert.ok(env.observe().enemies.some(e=>env.motion().get(e).valid));env.reset();assert.ok(env.observe().enemies.every(e=>!env.motion().get(e).valid));
});
test('Stomp immediately requests jump and steering even for distant or higher targets, without a safety oracle',()=>{
  for(const [distance,height] of [[50,0],[250,0],[50,100]]){
    const o=scene();o.enemies=[{id:1,type:'slice',x:distance,y:0,z:height}];const context=skillContext(o);
    assert.equal(context.parameters[2].target[1],true);const option=createOption([2,0,1],o),control=optionControl(option,o);
    assert.equal(control.action.jump,true);assert.ok(control.action.x>0);assert.equal(optionControl(option,o).action.jump,false);
  }
});

test('Visible charging stacks expose active windup and time to next shot, not elapsed charge',()=>{
  const o=scene();o.player.x=100;o.player.y=50;const e={id:1,type:'slice',x:150,y:25,z:0,stackCount:3,stackAnchor:true,stackTime:.75,nextSliceShot:2};o.enemies=[e];
  const a=encode(o);assert.equal(a[33],50/1250);assert.equal(a[34],-25/1250);assert.equal(a[36],1);assert.equal(a[41],1);assert.equal(a[42],1.25/3);assert.equal(a[49],1);
  e.stackTime=.9;const b=encode(o);assert.equal(b[42],1.1/3);assert.equal(b[33],a[33]);assert.equal(b[34],a[34]);
  e.hit=.1;const interrupted=encode(o);assert.equal(interrupted[42],0);assert.equal(interrupted[49],0);
});

test('Shared visible attack countdown has consistent semantics for stacks, green chargers and red throwers',()=>{
  const {attackTelegraph}=require('../sim/telegraph.cjs'),o=scene();
  const enemies=[{id:1,type:'slice',x:40,y:0,hp:3,stackCount:3,stackAnchor:true,stackTime:1.75,nextSliceShot:2},{id:2,type:'charger',x:50,y:0,hp:1,phase:'aim',phaseTime:.25},{id:3,type:'thrower',x:60,y:0,hp:2,phase:'windup',phaseTime:.25}];
  for(const e of enemies){
    assert.deepEqual(attackTelegraph(o,e),{active:true,seconds:.25});
    for(const key of ['hit','down','knock']){e[key]=.1;assert.deepEqual(attackTelegraph(o,e),{active:false,seconds:0});e[key]=0;}
    e.x=501;assert.equal(attackTelegraph(o,e).active,false);e.x=50;
  }
  const stack=enemies[0];stack.stackCount=2;stack.stackTime=2.75;stack.nextSliceShot=3;assert.equal(attackTelegraph(o,stack).seconds,.25);stack.stackAnchor=false;assert.equal(attackTelegraph(o,stack).active,false);
  enemies[1].phase='turn';assert.equal(attackTelegraph(o,enemies[1]).active,false);enemies[2].phase='seek';enemies[2].throwCooldown=.1;assert.equal(attackTelegraph(o,enemies[2]).active,false);
});
test('Batched prefix restoration preserves the full world, RNG and final visible velocity samples',()=>{
  const entry=startFixture().starts[50][0],slow=createEnvironment(),playback=slow.replayTape(entry.tape),history=new MotionHistory();history.update(slow.observe());let tick;
  do{tick=playback.step();history.update(tick.observation);}while(!tick.done);
  const fast=createEnvironment(),tail=new MotionHistory();let samples=0;fast.restoreTape(entry.tape,o=>{samples++;tail.update(o);});assert.equal(samples,2);
  assert.equal(JSON.stringify(fast.observe()),JSON.stringify(slow.observe()));assert.deepEqual(encode(fast.observe(),entry.previous,tail),encode(slow.observe(),entry.previous,history));
  assert.ok(Math.abs(fast.summary().reward-slow.summary().reward)<1e-8);
  for(let i=0;i<30;i++){const action={x:i%2?1:-1,y:0,jump:i%10===0};fast.step(action,6);slow.step(action,6);assert.equal(JSON.stringify(fast.observe()),JSON.stringify(slow.observe()));}
  assert.throws(()=>createEnvironment().restoreTape({...entry.tape,sourceDigest:'wrong'}),/exact recorded/);
  assert.throws(()=>createEnvironment().restoreTape({...entry.tape,finalDigest:'wrong'}),/Replay diverged/);
});
test('Reused VM resets different seeded episodes identically to fresh isolated VMs',()=>{
  const reused=createEnvironment({seed:1,mode:'milk',entrance:false,survivalOnly:true,record:true});
  for(const seed of [7,2,7]){
    reused.reset({seed});const fresh=createEnvironment({seed,mode:'milk',entrance:false,survivalOnly:true,record:true});
    for(let i=0;i<80;i++){const action={x:i%2?1:-1,y:0,jump:i%10===0};reused.step(action,6);fresh.step(action,6);}
    assert.equal(reused.replay().finalDigest,fresh.replay().finalDigest);assert.equal(JSON.stringify(reused.observe()),JSON.stringify(fresh.observe()));
  }
  assert.throws(()=>reused.reset({mobile:true}),/Profile changes/);
});


test('Instant training snapshots preserve all future world updates and RNG, and heal only HP',()=>{
  const entry=materialize(startFixture().starts[50][0]),a=createEnvironment(),b=createEnvironment();
  a.restoreTape(startFixture().starts[50][0].tape);b.restoreSnapshot(entry.snapshot);
  const normalize=o=>JSON.parse(JSON.stringify({...o,steps:0}));
  assert.deepEqual(normalize(a.observe()),normalize(b.observe()));
  const healed=createEnvironment();healed.restoreSnapshot(entry.snapshot,{heal:true});
  assert.deepEqual(normalize(healed.observe()),normalize({...a.observe(),player:{...a.observe().player,hp:5}}));
  for(let i=0;i<100;i++){const action={x:i%3-1,y:.5,jump:i%20===0,jet:true,dash:i===8};a.step(action);b.step(action);assert.deepEqual(normalize(a.observe()),normalize(b.observe()));}
  b.restoreSnapshot(entry.snapshot);assert.ok(Math.abs(b.observe().time-entry.startAt)<1e-8);assert.equal(b.observe().player.hp,entry.snapshot.config?startFixture().starts[50][0].tape.result.hp:0);
  assert.throws(()=>createEnvironment({record:true}).restoreSnapshot(entry.snapshot),/Invalid/);
});
test('Breakthrough curriculum uses real pre-terminal times, heals without changing time, and never enters evaluation',()=>{
  const source=createEnvironment({mode:'milk',seed:7,entrance:false,survivalOnly:true,record:true});while(source.summary().outcome==='running')source.step(source.policy(source.observe()),6);
  const entries=breakthroughStarts(source.replay());assert.equal(entries.length,3);
  for(const [i,entry] of entries.entries()){assert.ok(Math.abs(entry.startAt-(source.summary().gameSeconds-[3,2.5,2][i]))<1/60+1e-8);const env=trainingEnvironment({startSnapshots:[entry]});assert.equal(env.observe().player.hp,5);assert.equal(env.observe().time,entry.startAt);assert.equal(env.summary().reward,0);}
  const bank=startFixture(),copy={...bank,starts:{30:bank.starts[30].map(materialize),50:entries}},net=new Network(featureCount,4,new Random(1));validateBank(copy,copy.profile);
  const jobs=rolloutJobs({config:{...trainingSetup(),hidden:4},random:new Random(1),parameters:net.parameters,banks:[copy]});const r=execute({...jobs[2],decisions:1});assert.equal(r.buffer.at(-1).terminated,true);assert.ok(r.buffer[0].features[15]<.06);assert.throws(()=>execute({...jobs[2],kind:'evaluate'}),/must start at 0s/);
});

test('Snapshot graph codec retains shared native Sets, Maps and nonfinite values across JSON',()=>{
  const vm=require('node:vm'),sandbox=vm.createContext({});new vm.Script(require('../sim/snapshot.cjs').script).runInContext(sandbox);
  const saved=new vm.Script('(()=>{const hits=new Set([7]),a={hits,other:hits,limit:Infinity,missing:undefined};a.self=a;a.map=new Map([[a,hits]]);return trainingSnapshotCodec.encode(a)})()').runInContext(sandbox);
  sandbox.input=JSON.stringify(saved);assert.equal(new vm.Script('(()=>{const a=trainingSnapshotCodec.decode(JSON.parse(input));return a===a.self&&a.hits===a.other&&a.map.get(a)===a.hits&&a.hits instanceof Set&&a.map instanceof Map&&a.hits.has(7)&&a.limit===Infinity&&a.missing===undefined})()').runInContext(sandbox),true);
});

// Controlled training-only fixtures isolate the executor; all movement,
// collection, airborne restrictions and resource changes use real game physics.
function itemFixture(change=()=>{}){
  const host=createEnvironment({mode:'milk',seed:7,entrance:false,survivalOnly:true}),snapshot=host.snapshot(),vm=require('node:vm'),codec=vm.createContext({});
  new vm.Script(require('../sim/snapshot.cjs').script).runInContext(codec);codec.json=JSON.stringify(snapshot.world);
  const world=vm.runInContext('trainingSnapshotCodec.decode(JSON.parse(json))',codec);
  Object.assign(world,{elapsed:30,enemies:[],spawnWarnings:[],spawnClock:999,spawnDueWaves:0,nextMilkAt:999,nextPickupAt:999,nextSurfAt:999,milkBottles:[{id:900,x:120,y:0,age:0}],pickups:[{id:901,x:0,y:130,age:0}],surfPickups:[{id:902,x:-140,y:0,age:0}],serial:1000});
  change(world);codec.world=world;snapshot.world=JSON.parse(JSON.stringify(vm.runInContext('trainingSnapshotCodec.encode(world)',codec)));snapshot.time=world.elapsed;
  return {startAt:world.elapsed,sourceDigest:snapshot.sourceDigest,previous:[0,0,0,0],snapshot,tail:[]};
}
test('Every collectible has an independent skill, target mask and NN-controlled walking/jumping parameter',()=>{
  const o=scene();o.milkBottles=[{id:1,x:80,y:0}];o.pickups=[{id:2,x:0,y:90}];o.surfPickups=[{id:3,x:-100,y:0}];
  const c=skillContext(o);assert.deepEqual(heads,[10,9,173,2]);assert.equal(c.skills[1],false);assert.equal(c.skills[2],false);
  for(const [skill,target]of [[7,129],[8,141],[9,157]]){
    assert.equal(c.skills[skill],true);assert.deepEqual(c.parameters[skill].travel,[true,true]);
    assert.equal(c.parameters[skill].target.filter(Boolean).length,1);validateChoice([skill,0,target,0],c);validateChoice([skill,0,target,1],c);
    assert.throws(()=>validateChoice([skill,0,target===129?141:129,0],c),/Unavailable/);assert.throws(()=>validateChoice([skill,1,target,0],c),/Unavailable/);
  }
  o.player.surfStock=3;assert.equal(skillContext(o).skills[9],false);
  o.player.milkFuel=5;assert.deepEqual(skillContext(o).parameters[7].travel,[true,false]);assert.throws(()=>createOption([7,0,129,1],o),/Unavailable/);
  o.player.down=.2;assert.deepEqual(skillContext(o).skills.slice(7),[false,false,false]);
  o.player.down=0;o.milkBottles[0].x=501;o.pickups[0].collected=true;o.surfPickups[0].x=-501;assert.deepEqual(skillContext(o).skills.slice(7),[false,false,false]);
});
test('Item options retain identity, jump at most once, wait naturally above a target and stop on disappearance or damage',()=>{
  const o=scene();o.milkBottles=[{id:10,x:100,y:0},{id:11,x:-150,y:0}];const option=createOption([7,0,129,1],o);
  assert.equal(optionControl(option,o).action.jump,true);o.player.z=90;o.player.vz=-40;o.player.x=95;o.milkBottles[1].x=96;
  const c=optionControl(option,o);assert.equal(c.action.jump,false);assert.equal(c.action.x,0);assert.equal(c.action.y,0);assert.equal(o.player.z,90);assert.equal(o.player.vz,-40);
  o.milkBottles=o.milkBottles.filter(b=>b.id!==10);assert.equal(optionControl(option,o).reason,'target-lost');
  const other=createOption([7,0,129,0],o);o.player.hp--;assert.equal(optionControl(other,o).reason,'interrupted');
});
test('Each collection skill acquires the correct real item; jumping lands before collection and rewards remain survival only',()=>{
  for(const [skill,target,key,check]of [[7,129,'milkBottles',o=>o.player.milkFuel>0],[8,141,'bunches',o=>o.player.inv>0],[9,157,'surfBoards',o=>o.player.surfStock===1]]){
    for(const travel of [0,1]){
      // Sliding boards are collected by the original peel-stage update path.
      const env=skillEnvironment({startSnapshots:[itemFixture(w=>{if(skill===9)w.milkStage=false;})]}),r=env.step([skill,0,target,travel]);
      assert.equal(env.metrics()[key],1);assert.ok(check(env.observe()));assert.equal(env.observe().player.z,0);assert.equal(r.option.travel,travel?'jump':'walk');
      assert.ok(Math.abs(r.reward-r.option.frames/60)<1e-8);if(travel)assert.ok(r.option.frames>40,'A normal jump must finish before a ground pickup');
      assert.equal(Object.entries(env.metrics()).filter(([k,v])=>k!=='milkJetSeconds'&&v>0).length,1);
    }
  }
});
test('Collecting from the air does not force landing; timeout allows another action before an item is acquired',()=>{
  const env=skillEnvironment({startSnapshots:[itemFixture(w=>{w.player.z=90;w.player.vz=-20;w.milkBottles[0].x=0;})]});
  const r=env.step([7,0,129,0]);assert.ok(r.option.frames>20);assert.equal(env.observe().player.z,0);assert.equal(env.metrics().milkBottles,1);
  const far=skillEnvironment({startSnapshots:[itemFixture(w=>{w.milkBottles[0].x=490;w.pickups=[];w.surfPickups=[];})]}),first=far.step([7,0,129,0]);
  assert.equal(first.option.reason,'timeout');assert.equal(first.option.frames,90);assert.equal(far.metrics().milkBottles,0);const x=far.observe().player.x;far.step([0,5,0,0]);assert.ok(far.observe().player.x<x);
});
test('Actual pickup metrics count full refills, fuel consumption and reset boundaries without rewarding them',()=>{
  const entry=itemFixture(w=>{w.milkPack={ammo:5,emit:0,spraying:false};w.milkBottles[0].x=0;});const env=skillEnvironment({startSnapshots:[entry]});
  assert.deepEqual(env.metrics(),{milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0});env.step([7,0,129,0]);assert.equal(env.observe().player.milkFuel,5);assert.equal(env.metrics().milkBottles,1);
  const r=env.step([6,0,0,0]);assert.ok(Math.abs(env.metrics().milkJetSeconds-.3)<1e-8);assert.ok(Math.abs(r.reward-.3)<1e-8);
  env.reset();assert.deepEqual(env.metrics(),{milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0});
});
test('PPO learns the walking/jumping parameter with the same conditional masks and finite gradients',()=>{
  const o=scene();o.milkBottles=[{id:1,x:100,y:0}];const context=skillContext(o),net=new Network(3,4,new Random(2)),rng=new Random(3),f=Float64Array.of(.2,.4,-.1),layer=net.layers.at(-1);
  net.parameters[layer.b+7]=20;const s=net.sample(f,rng,false,context);assert.equal(s.action[0],7);assert.equal(s.action.length,4);validateChoice(s.action,context);
  const item={...s,features:f,advantage:1,target:3},result=lossAndGradient(net,[item]);
  const at=layer.b+heads.slice(0,3).reduce((a,b)=>a+b,0),old=net.parameters[at],eps=1e-5;net.parameters[at]=old+eps;const plus=lossAndGradient(net,[item]).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,[item]).loss;net.parameters[at]=old;
  assert.ok(Math.abs((plus-minus)/(2*eps)-result.gradient[at])<1e-6);
});
