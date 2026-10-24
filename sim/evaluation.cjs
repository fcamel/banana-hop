'use strict';
// Fast chart scores, checkpoint selection and the final test use disjoint seeds.
// None of these episodes can become curriculum snapshots.
function evaluationSetup(){return {
 evaluationSeeds:Array.from({length:4},(_,i)=>0xf0000000+i),
 validationSeeds:Array.from({length:16},(_,i)=>0xe2000000+i),
 testSeeds:Array.from({length:16},(_,i)=>0xe3000000+i),validationEvery:10
};}
function improves(mean,best){return Number.isFinite(mean)&&mean>best+1e-9;}
function needsValidation(generation,mean,quickBest,every=10){return generation===1||generation%every===0||improves(mean,quickBest);}
function summarizeEvaluation(results,seeds){
 if(!results.length||results.length!==seeds.length||results.some(r=>!Number.isFinite(r.score)||r.score<0||r.score>60+1e-6))throw Error('Invalid evaluation results');
 const scores=results.map(r=>r.score);return {seeds:[...seeds],scores,mean:scores.reduce((s,v)=>s+v,0)/scores.length,minimum:Math.min(...scores),maximum:Math.max(...scores),successRate:scores.filter(v=>v>=60-1e-6).length/scores.length,itemMetrics:results.map(r=>r.itemMetrics??null),damage:results.map(r=>r.damage?.summary??null)};
}
function evaluatePolicy(pool,net,config,seeds,policySeedBase,recordReplay=false){return Promise.all(seeds.map((seed,i)=>pool.run({kind:'evaluate',seed,policySeed:policySeedBase+i,profile:config.profiles[i%config.profiles.length],decisions:601,hidden:config.hidden,architecture:config.architecture,parameters:net.parameters,recordReplay})));}
module.exports={evaluationSetup,improves,needsValidation,summarizeEvaluation,evaluatePolicy};
