'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {measure,Adam,Random}=require('../sim/imitation.cjs');
const {collectLearner,trainRound}=require('../sim/dagger.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,contract}=require('../sim/training.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-dagger.cjs PRIOR_BC_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),source=fs.readFileSync(old.source.file),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(old.sourceDigest!==sourceDigest||hash(source)!==old.source.sha256)throw Error('Prior dataset/source mismatch');
const c=JSON.parse(source),loaded=loadPolicy(old.source.file),sets=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(prior,'demonstrations.v8.gz'))));
const id='dagger-bc-'+new Date().toISOString().replace(/[:.]/g,'-'),dir=path.resolve('.training/imitation',id);fs.mkdirSync(dir,{recursive:true});
const config={rounds:12,updates:24,batchSize:32,learningRate:.001,trainSeeds:Array.from({length:4},(_,i)=>0xdb000000+i),validationSeeds:Array.from({length:2},(_,i)=>0xdc000000+i),testSeeds:Array.from({length:8},(_,i)=>0xdd000000+i),seed:102};
const report={id,source:old.source,sourceDigest,prior,config,rollouts:[],arms:[],evaluation:[],status:'collecting'},extra={train:[],validation:[]};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
console.log('Directory:',dir);save();
for(const split of ['train','validation'])for(const seed of config[split+'Seeds']){const r=collectLearner(loaded.net,seed);extra[split].push(...r.rows);report.rollouts.push({split,seed,rows:r.rows.length,...r.summary});save();console.log('Collect',split,seed,r.rows.length,r.summary.gameSeconds);}
fs.writeFileSync(path.join(dir,'learner-labels.v8.gz'),zlib.gzipSync(v8.serialize(extra)));
report.rows={naturalTrain:sets.train.length,learnerTrain:extra.train.length,naturalValidation:sets.validation.length,learnerValidation:extra.validation.length};save();
const validation=net=>{const natural=measure(net,sets.validation),learner=measure(net,extra.validation);return {loss:(natural.loss+learner.loss)/2,natural,learner};};
const make=()=>{const n=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture);n.parameters.set(c.parameters);return n;},selected=[];
for(const name of ['natural','dagger']){
 const net=make(),adam=new Adam(net.parameters.length),rng=new Random(config.seed),arm={name,rounds:[],before:validation(net)};report.arms.push(arm);let best=Float64Array.from(net.parameters),bestLoss=arm.before.loss,bestEpoch=0;report.status=name;
 for(let round=1;round<=config.rounds;round++){const start=performance.now(),training=trainRound(net,adam,sets.train,name==='dagger'?extra.train:null,rng,config),row={round,training,validation:validation(net),seconds:(performance.now()-start)/1000};arm.rounds.push(row);if(row.validation.loss<bestLoss){bestLoss=row.validation.loss;best=Float64Array.from(net.parameters);bestEpoch=round;}save();console.log(name,round,row.validation.loss);}
 net.parameters.set(best);arm.bestRound=bestEpoch;arm.selected=validation(net);arm.train={natural:measure(net,sets.train),learner:measure(net,extra.train)};selected.push({name,net});
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({schema:'banana-hop-bc-diagnostic-v1',purpose:'Inference only; critic not fitted',contract,sourceDigest,architecture:c.architecture,config:{hidden:c.config.hidden},sizes:net.sizes,parameters:Array.from(best),generation:bestEpoch,runId:id+'-'+name,sourceCheckpoint:old.source}));save();
}
report.status='evaluating';save();
for(const policy of [{name:'visible-skills'},{name:'before',net:loaded.net},...selected])for(const seed of config.testSeeds){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);console.log('Eval',policy.name,seed,r.summary.gameSeconds);save();}
if(hash(fs.readFileSync(old.source.file))!==old.source.sha256)throw Error('Source changed');report.sourceUnchanged=true;report.status='complete';save();console.log('Report:',path.join(dir,'report.json'));
