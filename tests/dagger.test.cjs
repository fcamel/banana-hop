'use strict';
const assert=require('node:assert/strict');
const {collectLearner,sampleBatch,trainRound}=require('../sim/dagger.cjs');
const {skillEnvironment}=require('../sim/training.cjs');
const {Random}=require('../sim/ppo.cjs');
const seed=42,options={diagnosticUntil:2};
const net={sample:()=>({action:[0,1,0,0]})},previous=[];
const collected=collectLearner(net,seed,options,(features,context,p)=>{previous.push(p);return {choice:[0,5,0,0]};});
const reference=skillEnvironment({seed,width:1000,height:650,mobile:false,...options});
for(const row of collected.rows){assert.equal(row.time,reference.observe().time);assert.deepEqual(row.features,reference.features());assert.deepEqual(row.context,reference.context());assert.deepEqual(row.action,[0,5,0,0]);assert.deepEqual(row.executedAction,[0,1,0,0]);reference.step(row.executedAction);}
assert.deepEqual(collected.summary,reference.summary());assert.equal(previous[0],0);assert.ok(previous.slice(1).every(p=>p===1));
console.log('PASS teacher labels aligned pre-action observations without controlling learner trajectory');
const a=[{source:'natural'}],b=[{source:'learner'}];
assert.equal(sampleBatch(a,b,new Random(1)).filter(r=>r.source==='learner').length,16);
assert.equal(sampleBatch(a,null,new Random(1)).length,32);assert.throws(()=>sampleBatch(a,b,new Random(1),3));
// Fixed budget applies to both arms regardless of dataset size.
const {Network,Adam}=require('../sim/ppo.cjs');
const context={skills:Array.from({length:10},(_,i)=>i===0),parameters:Array.from({length:10},()=>({direction:Array.from({length:9},(_,i)=>i===1),target:Array.from({length:173},(_,i)=>i===0),travel:[true,false]}))};
const rows=[{features:[1,0],action:[0,1,0,0],context}];
for(const extra of [null,rows.concat(rows)]){const n=new Network(2,4,new Random(1)),r=trainRound(n,new Adam(n.parameters.length),rows,extra,new Random(2),{updates:3});assert.equal(r.updates,3);assert.equal(r.samples,96);}
console.log('PASS equal update budget and balanced data-source sampling');
