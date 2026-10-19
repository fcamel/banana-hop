'use strict';
const assert=require('node:assert/strict'),{createEnvironment,sourceDigest}=require('../sim/environment.cjs');
function test(name,body){body();console.log('PASS',name);}
function run(options,seconds=20){const env=createEnvironment({...options,record:true});while(env.summary().steps<seconds*60&&env.summary().outcome==='running')env.step(env.policy(env.observe()),Math.min(6,seconds*60-env.summary().steps));return {env,tape:env.replay()};}
test('Seeded episodes, reset, and optional recording produce the same gameplay',()=>{
  const a=run({mode:'milk',seed:81}),b=run({mode:'milk',seed:81});assert.equal(a.tape.finalDigest,b.tape.finalDigest);assert.equal(JSON.stringify(a.tape.actions),JSON.stringify(b.tape.actions));
  const plain=createEnvironment({mode:'milk',seed:81});while(plain.summary().steps<a.tape.steps)plain.step(plain.policy(plain.observe()),Math.min(6,a.tape.steps-plain.summary().steps));
  assert.equal(plain.summary().kills,a.env.summary().kills);assert.equal(plain.summary().hp,a.env.summary().hp);assert.throws(()=>plain.replay(),/not enabled/);
  a.env.reset();while(a.env.summary().steps<a.tape.steps)a.env.step(a.env.policy(a.env.observe()),Math.min(6,a.tape.steps-a.env.summary().steps));assert.equal(a.env.replay().finalDigest,a.tape.finalDigest);
  assert.notEqual(run({mode:'milk',seed:82}).tape.finalDigest,a.tape.finalDigest);
});
test('Each independent stage and boss supports deterministic action replay',()=>{
  for(const mode of ['milk','milk-boss','survival','boss']){
    const {tape}=run({mode,seed:31,mobile:true,width:844,height:390},30),host=createEnvironment(),playback=host.replayTape(JSON.parse(JSON.stringify(tape)));
    for(let i=0;i<=tape.steps;i++){if(playback.step().done)break;if(i===tape.steps)assert.fail('Replay did not finish');}
    assert.equal(playback.environment.summary().steps,tape.steps);assert.equal(playback.environment.summary().kills,tape.result.kills);assert.equal(playback.environment.summary().hp,tape.result.hp);
    assert.equal(playback.environment.observe().viewport.width,844);assert.equal(playback.environment.observe().viewport.scale,.7);
  }
});
test('Invalid, corrupted and incompatible replays fail instead of running forever',()=>{
  const {tape}=run({mode:'milk',seed:5},3),env=createEnvironment();
  assert.throws(()=>env.replayTape({...tape,sourceDigest:'old'}),/exact recorded/);
  assert.throws(()=>env.replayTape({...tape,steps:tape.steps+1}),/Incomplete/);
  assert.throws(()=>env.replayTape({...tape,actions:[{frames:tape.steps,action:[NaN,0,0,0,0,0]}]}),/Invalid replay action/);
  const wrong=env.replayTape({...tape,finalDigest:'incorrect'});assert.throws(()=>{for(let i=0;i<=tape.steps;i++)if(wrong.step().done)break;},/diverged/);
  assert.equal(sourceDigest.length,64);
});
test('Actions and fixed-size NN observations have finite values and isolated data',()=>{
  const a=createEnvironment({seed:0,entrance:false}),initial=a.observe(),b=createEnvironment({seed:0,entrance:false});initial.player.hp=-999;initial.enemies.length=0;assert.equal(a.observe().player.hp,5);
  const features=a.features(a.observe());assert.equal(features.length,156);assert.ok([...features].every(Number.isFinite));
  assert.throws(()=>a.step({x:Infinity}),/Non-finite/);assert.throws(()=>a.step({},0),/frame repeat/);
  a.step({x:1},12);assert.ok(a.observe().player.x>b.observe().player.x);assert.equal(a.summary().steps,12);assert.equal(b.summary().steps,0);
});
test('Headless viewport is configured before opening spawns, even across resets',()=>{
  for(const mobile of [false,true]){const env=createEnvironment({width:568,height:320,mobile,seed:9,entrance:false}),before=JSON.stringify(env.observe());env.step({x:1},30);assert.equal(JSON.stringify(env.reset()),before);}
});

test('Replaying after an earlier episode excludes spatial cache bookkeeping from observations',()=>{
  const tape=run({mode:'boss',seed:17},20).tape,host=createEnvironment({mode:'boss',seed:31});
  for(let i=0;i<100;i++)host.step(host.policy(host.observe()),6);
  assert.ok(host.observe().peels.every(p=>!('peelGridQuery' in p)));
  const playback=host.replayTape(tape);while(!playback.step().done){}assert.equal(playback.environment.summary().steps,tape.steps);
});
function policyScene(overrides={}){return {steps:0,phase:'survival',viewport:{scale:1},player:{x:0,y:0,hp:5,z:0,vz:0,down:0,recoil:0,milkFuel:0,charge:0,surfStock:0,boosted:false},enemies:[],peels:[],pickups:[],milkBottles:[],giants:[],boss:null,...overrides};}
test('Policy keeps near-equal targets, allows clear improvements after one second, and replaces missing targets immediately',()=>{
  const env=createEnvironment();
  const at=(steps,left,right)=>env.policy(policyScene({steps,milkBottles:[{id:1,x:-left,y:0},{id:2,x:right,y:0}]}));
  assert.ok(at(0,100,101).x<0);
  for(let step=6;step<=180;step+=6)assert.ok(at(step,101,100).x<0);
  // A new episode clears the old lock; improvements cannot break a fresh lock.
  env.reset();assert.ok(at(0,100,101).x<0);assert.ok(at(30,100,50).x<0);assert.ok(at(60,100,50).x>0);
  assert.ok(env.policy(policyScene({steps:66,milkBottles:[{id:1,x:-100,y:0}]})).x<0);
});
test('Arrival hysteresis prevents center overshoot jitter and keeps attack requests responsive',()=>{
  const env=createEnvironment(),scene=policyScene({enemies:[{id:1,x:18,y:0,hp:1,type:'slice'}]});
  let a=env.policy(scene);assert.equal(a.x,0);assert.equal(a.y,0);assert.equal(a.jump,true);
  a=env.policy({...scene,steps:6,player:{...scene.player,x:22}});assert.equal(a.x,0);
  a=env.policy({...scene,steps:12,player:{...scene.player,x:-17}});assert.equal(a.x,0);
  a=env.policy({...scene,steps:18,player:{...scene.player,x:-23}});assert.ok(a.x>0);
  env.reset();a=env.policy({...scene,enemies:[{id:1,x:30,y:0,hp:1,type:'slice'}]});assert.equal(a.x,.5);
  a=env.policy({...scene,steps:24,player:{...scene.player,milkFuel:2,charge:100},peels:[{x:10,y:0}]});assert.ok(a.x<0);assert.equal(a.jet,true);assert.equal(a.dash,true);
});
test('Mobile arrival zones scale down, higher priority bottles interrupt attacks, and reset clears policy memory',()=>{
  const env=createEnvironment(),scene=policyScene({viewport:{scale:.7},enemies:[{id:1,x:-100,y:0,hp:1,type:'slice'}]});assert.ok(env.policy(scene).x<0);
  assert.ok(env.policy({...scene,steps:6,milkBottles:[{id:2,x:100,y:0}]}).x>0);
  env.reset();const arrive={...scene,enemies:[],milkBottles:[{id:3,x:13,y:0}]};assert.equal(env.policy(arrive).x,0);assert.equal(env.policy({...arrive,steps:6,player:{...arrive.player,x:-12}}).x,0);assert.ok(env.policy({...arrive,steps:12,player:{...arrive.player,x:-16}}).x>0);
  env.reset();assert.ok(env.policy({...scene,milkBottles:[{id:4,x:-101,y:0},{id:5,x:100,y:0}]}).x>0);
});
test('A pad lock follows the same giant into its airborne head attack',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',player:{...policyScene().player,z:50,vz:100},giants:[{id:1,x:-200,y:0,forming:false,pads:[{index:0,x:-60,y:0}]},{id:2,x:120,y:0,forming:false,pads:[{index:0,x:80,y:0}]}]});assert.ok(env.policy(scene).x<0);
  const a=env.policy({...scene,steps:6,player:{...scene.player,boosted:true}});assert.ok(a.x<0);
});

test('Boss pursuit takes off at range, waits for height, and retreats after a missed stomp',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',boss:{x:100,y:0,hp:10,hit:0,phase:'rest',clones:[]}});
  let a=env.policy(scene);assert.equal(a.jump,true);assert.equal(a.x,0);
  a=env.policy({...scene,steps:6,player:{...scene.player,z:20,vz:280}});assert.equal(a.x,0);
  a=env.policy({...scene,steps:12,player:{...scene.player,z:60,vz:-80}});assert.ok(a.x>0);assert.equal(a.jump,false);
  a=env.policy({...scene,steps:18,boss:{...scene.boss,x:60},player:{...scene.player,z:20,vz:-180}});assert.ok(a.x<0);
  env.reset();a=env.policy({...scene,boss:{...scene.boss,x:35}});assert.ok(a.x<0);assert.equal(a.jump,true);
});
test('Invulnerable and shielded bosses cause a retreat without wasting the ultimate; vulnerable clones remain targets',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',player:{...policyScene().player,charge:100},boss:{x:80,y:0,hp:8,hit:3,phase:'stunned',clones:[]}});
  let a=env.policy(scene);assert.ok(a.x<0);assert.equal(a.jump,false);assert.equal(a.dash,false);
  env.reset();a=env.policy({...scene,boss:{...scene.boss,hit:0,phase:'shield'},player:{...scene.player,z:70}});assert.ok(a.x<0);assert.equal(a.dash,false);
  env.reset();a=env.policy({...scene,boss:{...scene.boss,x:-200,hit:0,phase:'shield',clones:[{id:1,x:200,y:0,phase:'rest',hit:0}]}});assert.ok(a.x>0);
});
test('Minions interrupt boss pursuit at distance, while high jumps can pass ordinary ground enemies',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',boss:{x:250,y:0,hp:10,hit:0,phase:'rest',clones:[]}});
  assert.ok(env.policy(scene).x>0);
  let a=env.policy({...scene,steps:6,enemies:[{id:1,x:60,y:0,hp:1,type:'normal'}]});assert.notEqual(a.y,0);assert.equal(a.jump,true);
  a=env.policy({...scene,steps:12,player:{...scene.player,z:70},enemies:[{id:1,x:60,y:0,hp:1,type:'normal'}]});assert.ok(a.x>0);assert.equal(a.y,0);
  a=env.policy({...scene,steps:18,player:{...scene.player,z:70,vz:-350},enemies:[{id:1,x:60,y:0,hp:1,type:'normal'}]});assert.notEqual(a.y,0);
  env.reset();a=env.policy({...scene,enemies:[{id:1,x:0,y:0,hp:1,type:'normal'}]});assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));assert.ok(Math.hypot(a.x,a.y)>0);
});
test('Mobile boss takeoff and waiting distances scale with the collision footprint',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',viewport:{scale:.7},boss:{x:75,y:0,hp:10,hit:0,phase:'rest',clones:[]}});
  let a=env.policy(scene);assert.equal(a.jump,true);assert.equal(a.x,0);
  a=env.policy({...scene,steps:6,boss:{...scene.boss,x:45},player:{...scene.player,z:20,vz:-100}});assert.ok(a.x<0);
  a=env.policy({...scene,steps:12,boss:{...scene.boss,hit:1}});assert.ok(a.x<0);assert.equal(a.dash,false);
});
test('Simulation canonicalizes actor coordinates without quantizing the gameplay timer',()=>{
  const env=createEnvironment({mode:'survival',seed:7,entrance:false});env.step({x:.123456,y:.654321});const o=env.observe();
  for(const actor of [o.player,...o.enemies])for(const key of ['x','y','z'])if(Number.isFinite(actor[key]))assert.ok(Math.abs(actor[key]*1e6-Math.round(actor[key]*1e6))<1e-5);
  assert.equal(o.time,1/60);
});
test('A long crowded boss fight replays through minion collisions and later boss phases',()=>{
  const {tape}=run({mode:'boss',seed:31},90),host=createEnvironment(),playback=host.replayTape(tape);
  assert.ok(tape.steps>2400);assert.equal(tape.ruleset,'banana-hop-sim-2');
  while(!playback.step().done){}assert.equal(playback.environment.summary().hp,tape.result.hp);assert.equal(playback.environment.summary().steps,tape.steps);
});
function policyGiant(overrides={}){
  const g={id:1,x:170,y:0,hp:3,forming:false,hit:0,angle:Math.PI,attackPhase:'idle',attackTime:0,...overrides};
  g.pads=Array.from({length:4},(_,index)=>({index,x:g.x+Math.cos(g.angle+index*Math.PI/2)*102,y:g.y+Math.sin(g.angle+index*Math.PI/2)*102}));return g;
}
test('Giant pad approach takes off early and waits above the damaging edge before closing',()=>{
  const env=createEnvironment(),scene=policyScene({phase:'boss',giants:[policyGiant()]});
  let a=env.policy(scene);assert.equal(a.jump,true);assert.equal(a.x,0);
  a=env.policy({...scene,steps:6,player:{...scene.player,z:12,vz:300}});assert.equal(a.x,0);
  a=env.policy({...scene,steps:12,player:{...scene.player,z:40,vz:220}});assert.ok(a.x>0);
});
test('Spiralling pads and incoming airborne slices deflect pursuit, including during a player jump',()=>{
  for(const scale of [1,.7]){
    const env=createEnvironment(),scene=policyScene({viewport:{scale},milkBottles:[{id:9,x:200,y:0}]}),before=env.policy(scene);assert.equal(before.x,1);assert.equal(before.y,0);
    const flight={id:1,type:'slice',hp:1,x:-130,y:0,z:20,sliceFlight:{t:0,ax:-130,ay:0,bx:170,by:0,startZ:20,duration:300/460}};
    const action=env.policy({...scene,steps:6,enemies:[flight]});assert.ok(Math.abs(action.y)>.2);
    const hop={id:2,type:'slice',hp:1,x:90,y:0,z:35,sliceHop:{t:.18,ax:126,ay:0,bx:0,by:0}};
    const jumping=env.policy({...scene,steps:12,player:{...scene.player,z:70*scale,vz:-200},enemies:[hop]});assert.ok(jumping.x<.9||Math.abs(jumping.y)>.2);
  }
  const env=createEnvironment(),scene=policyScene({phase:'boss',giants:[policyGiant({attackPhase:'out',attackTime:.1,jumpLaunch:{x:170,y:0},jumpLanding:{x:0,y:200}})]});
  const before=JSON.stringify(scene),a=env.policy(scene);assert.ok(a.x<0);assert.equal(a.jump,false);assert.equal(JSON.stringify(scene),before);
});
test('Vertical clearance keeps harmless airborne slices from causing unnecessary swerves',()=>{
  const env=createEnvironment(),scene=policyScene({milkBottles:[{id:9,x:200,y:0}],player:{...policyScene().player,z:200,vz:100},enemies:[{id:1,type:'slice',hp:1,x:-130,y:0,z:20,sliceFlight:{t:0,ax:-130,ay:0,bx:170,by:0,startZ:20,duration:300/460}}]});
  const a=env.policy(scene);assert.equal(a.x,1);assert.equal(a.y,0);
});
