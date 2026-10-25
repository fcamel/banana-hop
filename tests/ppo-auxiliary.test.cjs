'use strict';
const assert=require('node:assert/strict');
const {Network,Random,Adam,optimize}=require('../sim/ppo.cjs');
const make=()=>new Network(2,4,new Random(1));
function buffer(net){return Array.from({length:8},(_,i)=>{const features=[i%2,1],s=net.sample(features,new Random(i));return {...s,features,target:10,advantage:i-3};});}
const a=make(),b=make();const x=optimize(a,new Adam(a.parameters.length),buffer(a),new Random(4),{epochs:2,batchSize:4,targetKl:100});let calls=0;const y=optimize(b,new Adam(b.parameters.length),buffer(b),new Random(4),{epochs:2,batchSize:4,targetKl:100,auxiliary:net=>{calls++;return {loss:0,gradient:new Float64Array(net.parameters.length)};}});assert.deepEqual(a.parameters,b.parameters);assert.equal(x.updates,y.updates);assert.equal(calls,y.updates);assert.equal(y.auxiliaryStats.length,calls);
const c=make();assert.throws(()=>optimize(c,new Adam(c.parameters.length),buffer(c),new Random(4),{auxiliary:()=>({gradient:[NaN]})}),/Invalid auxiliary/);
console.log('PASS zero auxiliary preserves PPO exactly, executes once per update, and rejects invalid gradients');

const d=make(),e=make(),options={epochs:1,batchSize:8,targetKl:100};
optimize(d,new Adam(d.parameters.length),buffer(d),new Random(4),options);
const extra=optimize(e,new Adam(e.parameters.length),buffer(e),new Random(4),{...options,auxiliary:n=>({loss:1,gradient:Float64Array.from(n.parameters,()=>.01)})});
assert.notDeepEqual(d.parameters,e.parameters);assert.ok(extra.auxiliaryStats[0].auxiliaryNorm>0);
console.log('PASS nonzero auxiliary contributes to the combined update with recorded gradient norm');
