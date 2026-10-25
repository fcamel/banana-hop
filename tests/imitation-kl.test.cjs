'use strict';
const assert=require('node:assert/strict');
const {createNetwork,Random}=require('../sim/ppo.cjs');
const {skillEnvironment,featureCount}=require('../sim/training.cjs');
const {referencePolicy,jointKL,regularizedLoss}=require('../sim/imitation-kl.cjs');
const {lossAndGradient}=require('../sim/imitation.cjs');
const env=skillEnvironment({seed:9}),context=env.context(),row={features:env.features(),context,action:[0,1,0,0]},net=createNetwork(featureCount,4,new Random(3),'entity-attention-v1');
const ref=referencePolicy(net,row),refs=new Map([[row,ref]]),frozen=JSON.stringify(ref);
assert.ok(Math.abs(jointKL(net,row,ref))<1e-12);
assert.deepEqual(regularizedLoss(net,[row],refs,0).gradient,lossAndGradient(net,[row]).gradient);
for(let i=0;i<net.parameters.length;i++)net.parameters[i]+=.03*Math.sin(i);
const result=regularizedLoss(net,[row],refs,.7);assert.ok(result.kl>0);
for(const i of [net.output.w,net.targetQuery.w,net.targetKey.w,net.skillEmbedding+7*4,net.encoders[3][0].w]){
 const p=net.parameters[i],eps=1e-5;net.parameters[i]=p+eps;const plus=regularizedLoss(net,[row],refs,.7).loss;net.parameters[i]=p-eps;const minus=regularizedLoss(net,[row],refs,.7).loss;net.parameters[i]=p;assert.ok(Math.abs((plus-minus)/(2*eps)-result.gradient[i])<1e-5,`${i}`);
}
assert.equal(JSON.stringify(ref),frozen);assert.ok(ref.branches.some(b=>b.skill===7));
console.log('PASS full conditional-policy KL gradients, zero baseline, immutable reference and all legal skills');
