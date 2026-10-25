'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createNetwork}=require('../sim/ppo.cjs'),{trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {rows,evaluate}=require('../sim/route-pair-probes.cjs'),{transform,directionDiagnostics}=require('../sim/route-learning-controls.cjs');
const source='.training/models/ppo-desktop-attention-validation-v2/best.json',hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash();
const dir=path.resolve('.training/diagnostics','route-controls-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const arms=[{name:'attention-raw',compact:false,scale:1},{name:'attention-scaled',compact:false,scale:6.25},{name:'compact-mlp-raw',compact:true,scale:1},{name:'compact-mlp-scaled',compact:true,scale:6.25}];
const epochs=process.argv.includes('--extended')?300:30;
const report={sourceHash,status:'running',config:{seeds:[701,702,703],epochs,batchSize:16,learningRate:.001,hidden:32},note:'Fresh initialization only; same frozen 48 train/48 held-out demonstration cases. Compact model removes only absent object slots in this specialized task. Coordinate rescaling is diagnostic preprocessing, not new observations or a production contract change.',runs:[]};const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
const compactResult=r=>{const {predictions,...rest}=r;return rest;};
for(const arm of arms)for(const seed of report.config.seeds){
 const data=split=>rows(split).map(r=>({...r,features:transform(r.features,arm)})),train=data('train'),validation=data('validation');
 const net=createNetwork(train[0].features.length,32,new Random(seed),arm.compact?'mlp-v1':'entity-attention-v1'),adam=new Adam(net.parameters.length),rng=new Random(seed);
 const run={arm,seed,parameters:net.parameters.length,input:train[0].features.length,curve:[]},started=performance.now();report.runs.push(run);
 const record=epoch=>{run.curve.push({epoch,train:compactResult(evaluate(net,train)),direction:directionDiagnostics(net,train)});save();};record(0);
 for(let epoch=1;epoch<=epochs;epoch++){trainEpoch(net,adam,train,rng,report.config);if([10,30,100,200,300].includes(epoch))record(epoch);}
 run.validation=evaluate(net,validation);run.validationDirection=directionDiagnostics(net,validation);run.seconds=(performance.now()-started)/1000;save();console.log(arm.name,seed,compactResult(run.validation));
}
report.sourceUnchanged=sourceHash===hash();if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();
