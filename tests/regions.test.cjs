'use strict';
const assert=require('node:assert/strict');
const {RegionAttentionNetwork,architecture,centers,screenPosition,regionGeometry}=require('../sim/regions.cjs');
const {AttentionNetwork}=require('../sim/attention.cjs');
const {featureCount,encode,skillEnvironment}=require('../sim/training.cjs');
const {Random,Adam,createNetwork,policySize,lossAndGradient,logProbability,optimize}=require('../sim/ppo.cjs');
const {skillContext}=require('../sim/skills.cjs');
const {checkpoint,restore}=require('../scripts/train-nn.cjs');
function test(name,fn){fn();console.log('PASS',name);}
function scene(){return {time:12,viewport:{width:1000,height:650,scale:1},player:{x:100,y:50,z:20,vz:50,hp:5,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:100,milkFuel:0,surfStock:1},enemies:[{id:1,type:'slice',x:170,y:80,z:30,stackCount:3},{id:2,type:'slice',x:30,y:90,z:5},{id:3,type:'milk',x:110,y:-80,z:0}],milkBottles:[{id:4,x:290,y:40}],milkDrops:[{id:5,x:40,y:30,z:20,vx:200,vy:-30,hostile:true,life:1}],spawnWarnings:[{x:30,y:40,time:.3}],pickups:[{id:6,x:-100,y:0}],surfPickups:[{id:7,x:80,y:10}]};}
function close(a,b,eps=1e-9){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}
function sample(net,o){const skill=2,c=skillContext(o),masks=[c.skills,c.parameters[skill].direction,c.parameters[skill].target,c.parameters[skill].travel],features=encode(o),action=[skill,0,1,0],f=net.forward(features,masks,skill);return {features,masks,action,probs:f.probs,logp:logProbability(f.probs,action),value:f.value,advantage:1.2,target:17};}
test('Nine spatial pools share weights and derive projected relative positions only from visible observations',()=>{
 const net=new RegionAttentionNetwork(featureCount,4,new Random(1)),o=scene(),input=encode(o),c=net.forward(input);assert.equal(c.extension.regions.length,9);assert.equal(c.extension.fused.length,58);assert.equal(c.tokens.length,9);
 const pos=screenPosition(c.tokens[1],input);close(pos.x,.5+70/1000);close(pos.y,.52+30*.72/650-30/650);
 for(const [i,r] of c.extension.regions.entries()){assert.deepEqual(r.center,centers[i]);assert.equal(r.weights.length,c.tokens.length);close(r.weights.reduce((a,b)=>a+b),1);assert.equal(r.vector.length,4);close(r.objects[1].x[4],pos.x-r.center.x);close(r.objects[1].x[5],pos.y-r.center.y);}
 assert.notDeepEqual(c.extension.regions[0].vector,c.extension.regions[8].vector);
 const middle=c.extension.regions[4];close(middle.objects[1].x[5],pos.y-.5);assert.notEqual(.52,.5,'Viewport middle is not player ground anchor');
 const moved=structuredClone(o);moved.player.x+=500;moved.player.y+=300;for(const list of ['enemies','milkBottles','milkDrops','spawnWarnings','pickups','surfPickups'])for(const e of moved[list]){e.x+=500;e.y+=300;}
 const other=net.forward(encode(moved));for(let i=0;i<c.tokens.length;i++)assert.deepEqual(screenPosition(c.tokens[i],input),screenPosition(other.tokens[i],encode(moved)));
});
test('Region outputs ignore padded and offscreen objects, handle no objects, and vary smoothly across cell boundaries',()=>{
 const net=new RegionAttentionNetwork(featureCount,4,new Random(2)),o=scene(),base=net.forward(encode(o)),padded=encode(o);padded.fill(999,32+2*18+1,32+3*18);assert.deepEqual(net.forward(padded).scene,base.scene);
 const outside=structuredClone(o);outside.enemies.push({id:999,type:'slice',x:99999,y:99999});assert.deepEqual(net.forward(encode(outside)).scene,base.scene);
 const empty=structuredClone(o);for(const key of ['enemies','milkBottles','milkDrops','spawnWarnings','pickups','surfPickups'])empty[key]=[];const c=net.forward(encode(empty));assert.equal(c.tokens.length,1);assert.ok(c.scene.every(Number.isFinite));assert.ok(c.extension.regions.every(r=>r.weights.length===1&&r.weights[0]===1));
 const near=structuredClone(empty);near.enemies=[{id:1,type:'slice',x:near.player.x+1000/6-.0001,y:near.player.y}];const a=net.forward(encode(near));near.enemies[0].x+=.0002;const b=net.forward(encode(near));assert.ok(Math.max(...a.scene.map((v,i)=>Math.abs(v-b.scene[i])))<1e-4);
});
test('Regional scene is invariant to object ordering while individual target logits remain equivariant',()=>{
 const net=new RegionAttentionNetwork(featureCount,4,new Random(3)),f=encode(scene()),swap=f.slice();swap.set(f.slice(50,68),32);swap.set(f.slice(32,50),50);const a=net.forward(f,null,2),b=net.forward(swap,null,2);
 for(let i=0;i<9;i++)for(let k=0;k<4;k++)close(a.extension.regions[i].vector[k],b.extension.regions[i].vector[k]);for(let i=0;i<a.activations[1].length;i++)if(i!==20&&i!==21)close(a.activations[1][i],b.activations[1][i]);close(a.activations[1][20],b.activations[1][21]);
});
test('Every regional and original analytic parameter gradient matches numerical differentiation end to end',()=>{
 const net=new RegionAttentionNetwork(featureCount,4,new Random(4)),s=sample(net,scene()),r=lossAndGradient(net,[s]),eps=1e-5;
 for(let at=0;at<net.parameters.length;at++){const old=net.parameters[at];net.parameters[at]=old+eps;const plus=lossAndGradient(net,[s]).loss;net.parameters[at]=old-eps;const minus=lossAndGradient(net,[s]).loss;net.parameters[at]=old;assert.ok(Math.abs((plus-minus)/(2*eps)-r.gradient[at])<2e-6,`region gradient ${at}`);}
 for(const layer of [net.regionRelation,net.regionScore,net.regionValue,net.regionFuse,net.encoders[1][0],net.q,net.poolQ,net.targetQuery])assert.ok(r.gradient.slice(layer.w,layer.b).some(v=>Math.abs(v)>1e-12));
 const changed=structuredClone(scene());changed.milkDrops[0].vx*=-1;assert.notDeepEqual(net.forward(encode(changed)).extension.regions[4].vector,net.forward(s.features).extension.regions[4].vector,'Visible bullet velocity must reach region representation');
});
test('Region parameters influence decisions and update through PPO without changing action masks or replay physics',()=>{
 const net=createNetwork(featureCount,4,new Random(5),architecture),o=scene(),s=sample(net,o),before=net.parameters.slice(),output=net.forward(s.features).activations[1];assert.ok(net instanceof RegionAttentionNetwork);
 for(let i=net.regionFuse.w;i<net.regionFuse.b;i++)net.parameters[i]=0;assert.notDeepEqual(net.forward(s.features).activations[1],output);net.parameters.set(before);
 const stats=optimize(net,new Adam(net.parameters.length),[s,{...s,advantage:-.5,target:4}],new Random(6),{epochs:1,batchSize:2});assert.equal(stats.updates,1);assert.notDeepEqual(net.parameters.slice(net.regionRelation.w),before.slice(net.regionRelation.w));
 const env=skillEnvironment({seed:7,record:true}),rng=new Random(7);while(env.summary().outcome==='running'){const a=net.sample(env.features(),rng,false,env.context());assert.ok(a.masks.every((m,h)=>m[a.action[h]]));const r=env.step(a.action);assert.ok(r.option.frames<=30);}require('../sim/environment.cjs').createEnvironment().restoreTape(env.replay());
 const saved=checkpoint(net,new Adam(net.parameters.length),{hidden:4,architecture},1,'regions-test',rng,null),copy=restore(JSON.parse(JSON.stringify(saved)));assert.ok(copy.net instanceof RegionAttentionNetwork);assert.deepEqual(copy.net.parameters,net.parameters);assert.throws(()=>restore({...saved,architecture:'entity-attention-v1'}),/architecture mismatch/);
 const worker=require('../sim/training-worker.cjs').execute({kind:'rollout',startAt:0,seed:7,policySeed:8,profile:{width:1000,height:650,mobile:false},decisions:2,hidden:4,architecture,parameters:net.parameters});assert.equal(worker.buffer.at(-1).terminated,true);
 const original=new AttentionNetwork(featureCount,4,new Random(5));assert.equal(original.architecture,'entity-attention-v1');assert.ok(original.parameters.length<net.parameters.length);
});
test('Regional terrain distinguishes empty walkable space from map exterior at all edges and corners',()=>{
 const o=scene();o.player.x=0;o.player.y=0;const center=centers[4];for(const g of centers){const v=regionGeometry(g,encode(o));close(v.walkableFraction,1);assert.equal(v.centerInside,1);}
 o.player.x=-1250;o.player.y=-1250;let f=encode(o),v=regionGeometry(center,f);close(v.walkableFraction,.22);assert.equal(v.centerInside,0);assert.equal(regionGeometry(centers[0],f).walkableFraction,0);assert.equal(regionGeometry(centers[0],f).centerInside,0);close(regionGeometry(centers[8],f).walkableFraction,1);
 o.player.x=1250;o.player.y=1250;f=encode(o);v=regionGeometry(center,f);close(v.walkableFraction,.28);assert.equal(v.centerInside,1);assert.equal(regionGeometry(centers[8],f).walkableFraction,0);close(regionGeometry(centers[0],f).walkableFraction,1);
 for(const [x,y] of [[-1250,0],[1250,0],[0,-1250],[0,1250]]){o.player.x=x;o.player.y=y;const geometries=centers.map(c=>regionGeometry(c,encode(o)));assert.ok(geometries.some(g=>g.walkableFraction===0));assert.ok(geometries.some(g=>g.walkableFraction>0&&g.walkableFraction<1));}
 o.viewport={width:390,height:700,scale:.7};o.player.x=-1250;o.player.y=-1250;const low=centers.map(c=>regionGeometry(c,encode(o)));close(low[4].walkableFraction,.22);o.player.z=200;assert.deepEqual(centers.map(c=>regionGeometry(c,encode(o))),low,'Ground bounds must not move with player jump height');
});
test('Terrain enters both learned region relations and direct fusion while the old regional architecture remains loadable',()=>{
 const net=new RegionAttentionNetwork(featureCount,4,new Random(19)),o=scene();o.player.x=-1250;o.player.y=-1250;const f=encode(o),c=net.forward(f);for(const [i,r] of c.extension.regions.entries()){close(r.objects[0].x[10],r.geometry.walkableFraction);assert.equal(r.objects[0].x[11],r.geometry.centerInside);close(c.extension.fused[4+i*6+4],r.geometry.walkableFraction);assert.equal(c.extension.fused[4+i*6+5],r.geometry.centerInside);}
 const onlyTerrain=f.slice();onlyTerrain[19]=onlyTerrain[20]=onlyTerrain[21]=onlyTerrain[22]=.5;const changed=net.forward(onlyTerrain);assert.notDeepEqual(c.extension.regions[0].vector,changed.extension.regions[0].vector);assert.notDeepEqual(c.activations[1],changed.activations[1]);
 const old=createNetwork(featureCount,32,new Random(1),'region-attention-v1');assert.equal(old.parameters.length,41304);assert.equal(old.terrain,false);assert.equal(old.forward(f).extension.fused.length,320);
 const rng=new Random(1),saved=checkpoint(old,new Adam(old.parameters.length),{architecture:'region-attention-v1',hidden:32},1,'legacy-region',rng,null),loaded=restore(saved);assert.deepEqual(loaded.net.forward(f).activations[1],old.forward(f).activations[1]);assert.notEqual(net.architecture,old.architecture);
});
