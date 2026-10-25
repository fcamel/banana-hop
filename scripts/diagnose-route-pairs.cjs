'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount}=require('../sim/training.cjs');
const initialization=process.argv.includes('--fresh')?'fresh':'pretrained';
const {trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {rows,evaluate}=require('../sim/route-pair-probes.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash();
const train=rows('train'),validation=rows('validation'),dir=path.resolve('.training/diagnostics','route-pairs-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const compact=x=>{const {predictions,...summary}=x;return summary;};
const report={source,sourceHash,initialization,status:'running',config:{epochs:30,batchSize:16,learningRate:.001,seeds:[701,702,703]},note:'Disposable supervised imitation probe, not PPO generations. Teacher uses visible linear risk plus progress to a fixed bottle; no future engine rollout. Validation geometry never used for gradients or checkpoint selection.',trainCases:train.map(({features,context,...r})=>r),validationCases:validation.map(({features,context,...r})=>r),baseline:{train:evaluate(loadPolicy(source).net,train),validation:evaluate(loadPolicy(source).net,validation)},runs:[]};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log('baseline',compact(report.baseline.validation));
for(const seed of report.config.seeds){
 const metadata=JSON.parse(fs.readFileSync(source)),net=initialization==='fresh'?createNetwork(featureCount,metadata.config.hidden,new Random(seed),metadata.architecture):loadPolicy(source).net,adam=new Adam(net.parameters.length),rng=new Random(seed),run={seed,measurements:[]},started=performance.now();run.initial=evaluate(net,validation);report.runs.push(run);
 for(let epoch=1;epoch<=30;epoch++){
  const loss=trainEpoch(net,adam,train,rng,report.config);
  if(epoch%10===0){const result={epoch,loss,train:compact(evaluate(net,train))};run.measurements.push(result);save();console.log(seed,epoch,result.train.accuracy);}
 }
 run.train=evaluate(net,train);run.validation=evaluate(net,validation);run.seconds=(performance.now()-started)/1000;save();console.log('final',seed,compact(run.validation));
}
report.sourceUnchanged=hash()===sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();
