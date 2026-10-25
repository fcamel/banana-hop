'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {collect,measure,trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,contract}=require('../sim/training.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const file=process.argv[2];if(!file||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-imitation.cjs CHECKPOINT');
const original=fs.readFileSync(file),c=JSON.parse(original),loaded=loadPolicy(file),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const id='bc-'+new Date().toISOString().replace(/[:.]/g,'-'),dir=path.resolve('.training/imitation',id);fs.mkdirSync(dir,{recursive:true});
const config={trainSeeds:[0xd4000000,0xd4000001,0xd4000002,0xd4000003],validationSeeds:[0xd5000000,0xd5000001],testSeeds:Array.from({length:8},(_,i)=>0xd6000000+i),epochs:12,batchSize:32,learningRate:.001,overfitSamples:32,overfitEpochs:40};
const report={id,source:{file,sha256:hash(original)},config,architecture:loaded.architecture,sourceDigest,teacher:[],overfit:[],epochs:[],evaluation:[],status:'collecting'};
const persist=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
const make=()=>{const net=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture);net.parameters.set(c.parameters);return net;};
const sets={train:[],validation:[]};
for(const split of Object.keys(sets))for(const seed of config[split+'Seeds']){const result=collect(seed);sets[split].push(...result.rows);report.teacher.push({split,seed,...result.summary});console.log('Collected',split,seed,result.rows.length,result.summary.gameSeconds);persist();}
fs.writeFileSync(path.join(dir,'demonstrations.v8.gz'),zlib.gzipSync(v8.serialize(sets)));
// Uniform time-spread subset, fixed before fitting; never uses validation/test.
const tiny=Array.from({length:config.overfitSamples},(_,i)=>sets.train[Math.floor(i*sets.train.length/config.overfitSamples)]);
let net=make(),adam=new Adam(net.parameters.length),rng=new Random(101);report.overfit.push({epoch:0,...measure(net,tiny)});report.status='overfit';persist();
for(let epoch=1;epoch<=config.overfitEpochs;epoch++){trainEpoch(net,adam,tiny,rng,config);if(epoch%10===0){report.overfit.push({epoch,...measure(net,tiny)});console.log('Overfit',epoch,report.overfit.at(-1).jointAccuracy);persist();}}
net=make();adam=new Adam(net.parameters.length);rng=new Random(102);report.before={train:measure(net,sets.train),validation:measure(net,sets.validation)};let bestLoss=report.before.validation.loss,best=Float64Array.from(net.parameters),bestEpoch=0;report.status='fitting';persist();
for(let epoch=1;epoch<=config.epochs;epoch++){
 trainEpoch(net,adam,sets.train,rng,config);const row={epoch,train:measure(net,sets.train),validation:measure(net,sets.validation)};report.epochs.push(row);
 if(row.validation.loss<bestLoss){bestLoss=row.validation.loss;best=Float64Array.from(net.parameters);bestEpoch=epoch;}
 console.log('Epoch',epoch,'train',row.train.jointAccuracy,'validation',row.validation.jointAccuracy);persist();
}
net.parameters.set(best);report.bestEpoch=bestEpoch;report.status='evaluating';
const checkpoint={schema:'banana-hop-bc-diagnostic-v1',purpose:'Read-only inference; critic not fitted; not a PPO resume checkpoint',contract,sourceDigest,architecture:c.architecture,config:{hidden:c.config.hidden},sizes:net.sizes,parameters:Array.from(best),generation:bestEpoch,runId:id,sourceCheckpoint:report.source};
fs.writeFileSync(path.join(dir,'policy.json'),JSON.stringify(checkpoint));persist();
for(const policy of [{name:'visible-skills'},{name:'before',net:loaded.net},{name:'imitation',net}])for(const seed of config.testSeeds){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);console.log('Eval',policy.name,seed,r.summary.gameSeconds);persist();}
if(hash(fs.readFileSync(file))!==report.source.sha256)throw Error('Source checkpoint changed');report.sourceUnchanged=true;report.status='complete';persist();console.log('Report:',path.join(dir,'report.json'));
