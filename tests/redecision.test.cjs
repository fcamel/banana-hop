'use strict';
const assert=require('node:assert/strict');
const {skillEnvironment}=require('../sim/training.cjs');
const {runCase}=require('../sim/ability-runner.cjs');
const {scenarios}=require('../sim/ability-scenarios.cjs');
const normal=skillEnvironment({seed:17}),explicit=skillEnvironment({seed:17,diagnosticRedecisionFrames:30}),fast=skillEnvironment({seed:17,diagnosticRedecisionFrames:12});
assert.deepEqual(normal.features(),fast.features());assert.deepEqual(normal.context(),fast.context());
for(let i=0;i<5;i++){const a=normal.step([0,1,0,0]),b=explicit.step([0,1,0,0]);assert.deepEqual(a,b);}
while(fast.summary().steps<normal.summary().steps){const r=fast.step([0,1,0,0]);assert.ok(r.option.frames<=12);}
assert.equal(fast.summary().steps,normal.summary().steps);assert.equal(JSON.stringify(fast.observe()),JSON.stringify(normal.observe()));assert.deepEqual(fast.features(),normal.features());assert.equal(fast.diagnosticDigest(),normal.diagnosticDigest());
assert.throws(()=>skillEnvironment({diagnosticRedecisionFrames:0}));assert.throws(()=>skillEnvironment({diagnosticRedecisionFrames:13}));
const spec=scenarios('development').find(s=>s.family==='bottle');
const check=runCase({name:'visible-skills'},spec,{seed:spec.seed,greedy:true,redecisionFrames:12,record:true});assert.equal(check.redecisionFrames,12);assert.equal(check.replayVerified,true);
console.log('PASS default unchanged, faster decisions preserve physics under identical inputs, feature contract and replay');
const continuing=skillEnvironment({seed:17,diagnosticRedecisionFrames:12}),target=continuing.context().parameters[1].target.findIndex(Boolean),choice=[1,0,target,0];
const first=continuing.step(choice),second=continuing.step(choice),third=continuing.step(choice);assert.equal(first.option.frames,12);assert.equal(second.option.continued,true);assert.equal(second.option.totalFrames,24);assert.equal(third.option.totalFrames,36);assert.equal(third.option.reason,'timeout');
console.log('PASS repeated approach preserves active target and original 0.6s option lifetime');
