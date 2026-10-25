'use strict';
const assert=require('node:assert/strict');
const {situation,key,coverage,summarize}=require('../sim/student-audit.cjs');
const {input}=require('../sim/skill-semantic-probes.cjs');
const f=input({family:'distance',phase:'ground',bearing:0,time:5,distance:120,height:0}).features,copy=Array.from(f);
assert.equal(situation(f).nearThreat,true);assert.equal(situation(f).phase,'ground');assert.equal(coverage([{features:f},{features:f}])[key(f)],2);assert.deepEqual(Array.from(f),copy);
const rows=[{duration:.5,hits:1,disagree:true,choice:[0],teacher:[3],trainingCount:5},{duration:.2,hits:0,disagree:false,choice:[3],teacher:[3],trainingCount:6}];
const s=summarize(rows);assert.equal(s.all.decisions,2);assert.equal(s.all.sparseRate,.5);assert.equal(s.hit.hitsPerSecond,2);assert.equal(s.covered.hits,0);assert.equal(s.all.skillDisagree,1);assert.deepEqual(summarize([]),{});
console.log('Student audit tests passed');
