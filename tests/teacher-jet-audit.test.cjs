'use strict';
const assert=require('node:assert/strict'),{featureCount}=require('../sim/training.cjs'),{inspect}=require('../sim/teacher-jet-audit.cjs');
const context={skills:Array.from({length:10},(_,i)=>i===0||i===6),parameters:Array.from({length:10},()=>({direction:Array.from({length:9},(_,i)=>i===0),target:Array.from({length:173},(_,i)=>i===0),travel:[true,false]}))};
const f=new Float64Array(featureCount);f[4]=1;f[11]=1;f[18]=1;f[32]=1;
const threshold=94*(1-1/2.1),near=Float64Array.from(f),far=Float64Array.from(f);near[33]=(threshold-.01)/1250;far[33]=(threshold+.01)/1250;
const a=inspect(near,context),b=inspect(far,context);assert.equal(a.chosen[0],6);assert.equal(b.chosen[0],0);assert.ok(Math.abs(a.scoreDifference-1)<1e-10);assert.ok(Math.abs(b.scoreDifference+.4)<1e-10);assert.equal(a.jet.risk,a.sameDirectionMove.risk);assert.ok(Math.abs(a.jet.score-b.jet.score)>1.39);assert.equal(f[33],0);
console.log('Teacher jet threshold and equal-risk tests passed');
