'use strict';
const assert=require('node:assert/strict');
const {specification,initial,episode}=require('../sim/dodge-curriculum.cjs');
const {createCodec}=require('../sim/snapshot.cjs');
const {skillEnvironment}=require('../sim/training.cjs');
const spec=specification(0),world=createCodec().decode(initial(spec).world);
assert.equal(world.player.hp,1);
assert.deepEqual(initial(spec),initial(spec));
assert.notEqual(spec.angle,specification(0,'test').angle);
for(const drop of world.milkDrops){assert.ok(Math.abs(drop.x)<500&&Math.abs(drop.y)<325);assert.equal(drop.hostile,true);}
const idle=episode({name:'idle'},spec);assert.equal(idle.success,false);assert.ok(idle.seconds<4);
const normal=skillEnvironment({seed:1,width:1000,height:650,mobile:false});assert.equal(normal.observe().player.hp,5);
const safe=episode({name:'idle'},{...spec,count:0});assert.equal(safe.success,true);assert.ok(Math.abs(safe.seconds-4)<1e-8);
// A fixed synthetic policy suffices to check complete-episode return plumbing.
const policy={net:{sample:()=>({action:[0,0,0,0],value:0,logp:0})}};
const collected=episode(policy,{...spec,count:0},{collect:true});
assert.ok(Math.abs(collected.buffer[0].target-4)<1e-8);assert.equal(collected.buffer.at(-1).terminated,true);assert.ok(Math.abs(collected.buffer.reduce((n,r)=>n+r.reward,0)-4)<1e-8);
assert.throws(()=>specification(-1));
console.log('Dodge curriculum tests passed');

const cross=specification(0,'train','cross');assert.equal(createCodec().decode(initial(cross).world).milkDrops.length,3*cross.count);
assert.throws(()=>specification(0,'train','unknown'));
