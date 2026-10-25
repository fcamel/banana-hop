'use strict';
const assert=require('node:assert/strict');
const {rows,evaluate}=require('../sim/route-pair-probes.cjs');
const {validateChoice,targetSlots}=require('../sim/skills.cjs');
const train=rows('train'),test=rows('validation');assert.equal(train.length,48);assert.equal(test.length,48);
for(const row of [...train,...test]){validateChoice(row.action,row.context);assert.ok(Array.from(row.features).every(Number.isFinite));assert.equal(targetSlots(row.observation).filter(t=>t?.kind==='bottle').length,1);}
for(const group of [train,test])for(const key of new Set(group.map(r=>r.pair))){const [a,c,b]=group.filter(r=>r.pair===key);assert.deepEqual(a.observation.milkBottles,b.observation.milkBottles);assert.notDeepEqual(a.action,b.action);assert.equal(c.action[0],7);}
const fingerprints=new Set(train.map(r=>JSON.stringify(Array.from(r.features))));assert.ok(test.every(r=>!fingerprints.has(JSON.stringify(Array.from(r.features)))));
const lookup=new Map(train.map(r=>[r.features,r.action])),perfect={sample:f=>({action:lookup.get(f)})};assert.equal(evaluate(perfect,train).pairsBothCorrect,16);assert.equal(evaluate(perfect,train).accuracy,1);
console.log('Route pair probe tests passed');
