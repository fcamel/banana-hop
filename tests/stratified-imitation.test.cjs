'use strict';
const assert=require('node:assert/strict');
const {Random}=require('../sim/ppo.cjs');
const {createStratifiedSampler}=require('../sim/stratified-imitation.cjs');
const a=[{source:'teacher',action:[0]},{source:'teacher',action:[6]}],b=[{source:'learner',action:[0]},{source:'learner',action:[3]},{source:'learner',action:[6]}];
const sample=createStratifiedSampler(a,b),before=JSON.stringify([a,b]);
for(let seed=0;seed<20;seed++){const batch=sample(new Random(seed));assert.equal(batch.length,32);assert.equal(batch.filter(r=>r.source==='teacher').length,16);assert.ok(batch.filter(r=>r.action[0]===6).length>=4);assert.ok(batch.filter(r=>r.action[0]===3).length>=4);assert.ok(batch.every(r=>a.includes(r)||b.includes(r)));assert.deepEqual(batch,sample(new Random(seed)));}
assert.equal(JSON.stringify([a,b]),before);assert.throws(()=>sample(new Random(1),31));assert.throws(()=>createStratifiedSampler([],b));
const missing=createStratifiedSampler(a.slice(0,1),b.slice(0,1))(new Random(1));assert.equal(missing.length,32);assert.ok(missing.every(r=>r.action[0]===0));
console.log('PASS stratified batches preserve source balance, rare quotas, deterministic sampling and missing-skill fallback');
