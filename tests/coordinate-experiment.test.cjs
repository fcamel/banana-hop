'use strict';
const assert=require('node:assert/strict');
const {RAW,LOCAL,prepare,sample}=require('../sim/coordinate-experiment.cjs');
const {input}=require('../sim/skill-semantic-probes.cjs');
const {encode,skillEnvironment}=require('../sim/training.cjs');
const {transform}=require('../sim/route-learning-controls.cjs');
const base=input({family:'distance',phase:'ground',bearing:0,time:5,distance:120,height:0});
assert.deepEqual(prepare(base.features,RAW),base.features);assert.deepEqual(prepare(base.features,LOCAL),transform(base.features,{scale:6.25}));
assert.throws(()=>prepare(base.features),/contract/);assert.throws(()=>prepare(base.features,'unknown'),/contract/);
for(const mobile of [false,true])for(const sx of [-1,1])for(const sy of [-1,1]){
 const o=structuredClone(base.observation);o.viewport=mobile?{width:390,height:844,scale:.7}:{width:1000,height:650,scale:1};o.player.x=sx*1250;o.player.y=sy*1250;o.enemies[0].x=o.player.x-sx*100;o.enemies[0].y=o.player.y-sy*100;
 const f=encode(o),g=prepare(f,LOCAL);assert.equal(g[33],-sx*.5);assert.equal(g[34],-sy*.5);assert.equal(g[0],f[0]);assert.equal(g[18],f[18]);
}
const high=structuredClone(base.observation);high.viewport={width:390,height:844,scale:.7};high.player.y=-500;Object.assign(high.enemies[0],{x:0,y:600,z:500});assert.equal(prepare(encode(high),LOCAL)[34],5.5);
const e=skillEnvironment({seed:2,width:1000,height:650,mobile:false});const f=e.features(),copy=Array.from(f);let seen;
sample({coordinateContract:LOCAL,net:{sample(input){seen=input;return {action:[0,0,0,0]};}}},f,null,true,e.context());assert.deepEqual(seen,prepare(f,LOCAL));assert.deepEqual(Array.from(f),copy);
console.log('Coordinate experiment tests passed');
