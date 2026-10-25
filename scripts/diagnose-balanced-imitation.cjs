'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {collect,measure,trainEpoch,balancingWeights,Adam,Random}=require('../sim/imitation.cjs');
const {curriculumCases,curriculumFixture}=require('../sim/imitation-scenarios.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,contract}=require('../sim/training.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-balanced-imitation.cjs PRIOR_BC_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),source=fs.readFileSync(old.source.file),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(old.sourceDigest!==sourceDigest||hash(source)!==old.source.sha256)throw Error('Prior dataset/source mismatch');
const c=JSON.parse(source),loaded=loadPolicy(old.source.file),sets=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(prior,'demonstrations.v8.gz'))));
const id='balanced-bc-'+new Date().toISOString().replace(/[:.]/g,'-'),dir=path.resolve('.training/imitation',id);fs.mkdirSync(dir,{recursive:true});
const config={epochs:12,batchSize:32,learningRate:.001,testSeeds:Array.from({length:8},(_,i)=>0xda000000+i),seed:102};
const report={id,source:old.source,sourceDigest,prior,config,teacher:[],arms:[],evaluation:[],status:'collecting'},extra={train:[],validation:[]};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
for(const split of ['train','validation'])for(const s of curriculumCases(split)){const r=collect(s.seed,curriculumFixture(s),s.seconds);for(const row of r.rows)row.scenario=s.id;const accepted=r.summary.hp===5;if(accepted)extra[split].push(...r.rows);report.teacher.push({id:s.id,split,accepted,rows:r.rows.length,...r.summary});}
const data={train:[...sets.train,...extra.train],validation:[...sets.validation,...extra.validation]};
fs.writeFileSync(path.join(dir,'demonstrations.v8.gz'),zlib.gzipSync(v8.serialize(data)));
const classWeights=balancingWeights(data.train);report.classWeights=classWeights;report.rows={naturalTrain:sets.train.length,dangerTrain:extra.train.length,naturalValidation:sets.validation.length,dangerValidation:extra.validation.length};save();console.log('Rows',report.rows);
const make=()=>{const n=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture);n.parameters.set(c.parameters);return n;},selected=[];
for(const name of ['unweighted','weighted']){
 const net=make(),adam=new Adam(net.parameters.length),rng=new Random(config.seed),arm={name,epochs:[],before:measure(net,data.validation)};report.arms.push(arm);let best=Float64Array.from(net.parameters),bestLoss=arm.before.loss,bestEpoch=0;report.status=name;
 for(let epoch=1;epoch<=config.epochs;epoch++){const start=performance.now();trainEpoch(net,adam,data.train,rng,{...config,classWeights:name==='weighted'?classWeights:null});const row={epoch,train:measure(net,data.train),validation:measure(net,data.validation),seconds:(performance.now()-start)/1000};arm.epochs.push(row);if(row.validation.loss<bestLoss){bestLoss=row.validation.loss;best=Float64Array.from(net.parameters);bestEpoch=epoch;}save();console.log(name,epoch,row.train.jointAccuracy,row.validation.jointAccuracy);}
 net.parameters.set(best);arm.bestEpoch=bestEpoch;arm.naturalValidation=measure(net,sets.validation);arm.dangerValidation=measure(net,extra.validation);selected.push({name,net});
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({schema:'banana-hop-bc-diagnostic-v1',purpose:'Inference only; critic not fitted',contract,sourceDigest,architecture:c.architecture,config:{hidden:c.config.hidden},sizes:net.sizes,parameters:Array.from(best),generation:bestEpoch,runId:id+'-'+name,sourceCheckpoint:old.source}));save();
}
report.status='evaluating';save();
for(const policy of [{name:'visible-skills'},{name:'before',net:loaded.net},...selected])for(const seed of config.testSeeds){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);console.log('Eval',policy.name,seed,r.summary.gameSeconds);save();}
if(hash(fs.readFileSync(old.source.file))!==old.source.sha256)throw Error('Source changed');report.sourceUnchanged=true;report.status='complete';save();console.log('Report:',path.join(dir,'report.json'));
