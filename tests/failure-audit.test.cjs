'use strict';
const assert=require('node:assert/strict');
const {begin,frame,summarize}=require('../sim/failure-audit.cjs');
const {skillEnvironment}=require('../sim/training.cjs');
const env=skillEnvironment({seed:1,width:1000,height:650,mobile:false});const features=env.features(),copy=Array.from(features),d=begin(features,[0,1,0,0],0);
assert.deepEqual(Array.from(features),copy);assert.equal(d.skill,'move');
frame(d,{before:{time:0,player:{x:0,y:0,z:0,hp:5,jumpLock:0,down:0,recoil:0}},action:{x:1,y:0,jump:true},result:{observation:{time:1/60,player:{x:3,y:0,z:4,hp:4}}}});
assert.equal(d.hits,1);assert.equal(d.actualTravel,3);assert.equal(d.groundJumpRequests,1);
frame(d,{before:{time:1/60,player:{x:3,y:0,z:4,hp:4}},action:{x:1,y:0,jump:true},result:{observation:{time:2/60,player:{x:6,y:0,z:6,hp:4}}}});
assert.equal(d.jumpRequests,2);assert.equal(d.groundJumpRequests,1);assert.equal(summarize([d]).hits,1);assert.equal(summarize([d]).bySkill.move.hitsPerSecond,30);
assert.equal(summarize([]).hits,0);
let active;
const observed=skillEnvironment({seed:7,width:1000,height:650,mobile:false,onPhysicsStep:f=>frame(active,f)}),plain=skillEnvironment({seed:7,width:1000,height:650,mobile:false});
for(let i=0;i<5;i++){const c=[0,observed.context().parameters[0].direction[1]?1:0,0,0];active=begin(observed.features(),c,observed.observe().time);observed.step(c);plain.step(c);}
assert.deepEqual(observed.summary(),plain.summary());assert.deepEqual(Array.from(observed.features()),Array.from(plain.features()));

console.log('Failure audit tests passed');
