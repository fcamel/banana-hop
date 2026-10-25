'use strict';
const assert=require('node:assert/strict');
const {Network,createNetwork,heads}=require('../sim/ppo.cjs');
const {lossAndGradient,measure,trainEpoch,Adam,Random,collect}=require('../sim/imitation.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
function test(n,f){f();console.log('PASS',n);}
const context={skills:heads.map(()=>0)};context.skills=Array.from({length:10},(_,i)=>i===0);context.parameters=Array.from({length:10},()=>({direction:Array.from({length:9},(_,i)=>i===1||i===5),target:Array.from({length:173},(_,i)=>i===0),travel:[true,false]}));
test('Behavior cloning learns known labels without a value target',()=>{
 const net=new Network(2,8,new Random(3)),adam=new Adam(net.parameters.length),rows=[-1,1].map(x=>({features:[x,1],action:[0,x>0?1:5,0,0],context})),initial=measure(net,rows),valueIndex=net.layers.at(-1).b+net.layers.at(-1).outs-1,valueBias=net.parameters[valueIndex];
 for(let i=0;i<120;i++)trainEpoch(net,adam,rows,new Random(i),{batchSize:2,learningRate:.01});const result=measure(net,rows);assert.ok(result.loss<initial.loss*.1);assert.equal(result.jointAccuracy,1);assert.equal(result.heads[1].macroRecall,1);assert.equal(result.heads[1].confusion.length,9);assert.equal(result.heads[1].recall[0].recall,null);assert.equal(result.heads[0].accuracy,null);assert.equal(net.parameters[valueIndex],valueBias);
});
test('Conditional attention BC gradients match finite differences, including target encoder',()=>{
 const env=skillEnvironment({seed:1}),c=env.context(),slot=c.parameters[7].target.findIndex(Boolean),row={features:env.features(),context:c,action:[7,0,slot,0]},net=createNetwork(featureCount,4,new Random(8),'entity-attention-v1'),r=lossAndGradient(net,[row]);
 const indices=[net.targetQuery.w,net.targetKey.w,net.skillEmbedding+7*4,net.output.w,net.encoders[3][0].w];
 for(const i of indices){const p=net.parameters[i],eps=1e-5;net.parameters[i]=p+eps;const plus=lossAndGradient(net,[row]).loss;net.parameters[i]=p-eps;const minus=lossAndGradient(net,[row]).loss;net.parameters[i]=p;assert.ok(Math.abs((plus-minus)/(2*eps)-r.gradient[i])<1e-5,`${i}`);}
 const bad={...row,action:[7,0,0,0]};assert.throws(()=>lossAndGradient(net,[bad]),/Unavailable/);
});
test('Teacher records pre-action observations and legal target slots throughout a full episode',()=>{
 const data=collect(0xd4000000);assert.ok(data.rows.length>100);assert.equal(data.rows[0].time,0);for(const r of data.rows){assert.ok(Math.abs(60-r.features[15]*60-r.time)<1e-8);assert.equal(r.context.parameters[r.action[0]].target[r.action[2]],true);}assert.equal(data.summary.gameSeconds,60);
});
test('Class balancing only uses train counts, caps relative weighting and keeps mean scale',()=>{
 const {balancingWeights}=require('../sim/imitation.cjs');const rows=Array.from({length:10},(_,i)=>({context,action:[0,i===9?5:1,0,0]})),w=balancingWeights(rows);assert.ok(Math.abs((w[1][1]*9+w[1][5])/10-1)<1e-10);assert.ok(w[1][5]/w[1][1]<=3);assert.ok(w[2].every(x=>x===1));
 const net=new Network(2,4,new Random(3)),batch=rows.slice(-2).map(r=>({...r,features:[1,0]})),g=lossAndGradient(net,batch,w);const i=net.layers.at(-1).b+11,old=net.parameters[i],eps=1e-5;net.parameters[i]=old+eps;const plus=lossAndGradient(net,batch,w).loss;net.parameters[i]=old-eps;const minus=lossAndGradient(net,batch,w).loss;net.parameters[i]=old;assert.ok(Math.abs(g.gradient[i]-(plus-minus)/(2*eps))<1e-5);
});
test('Hazard examples use legal visible teacher labels and separate validation geometries',()=>{
 const {curriculumCases,curriculumFixture}=require('../sim/imitation-scenarios.cjs');const a=curriculumCases('train'),b=curriculumCases('validation');assert.equal(a.length,24);assert.equal(b.length,24);assert.ok(a.every(s=>!b.some(t=>s.seed===t.seed)));const counts={};for(const s of a){const r=collect(s.seed,curriculumFixture(s),s.seconds);assert.ok(Math.abs(r.summary.gameSeconds-s.seconds)<1e-8);for(const row of r.rows)counts[row.action[0]]=(counts[row.action[0]]||0)+1;}for(const skill of [2,3,6])assert.ok(counts[skill]>0);
});
