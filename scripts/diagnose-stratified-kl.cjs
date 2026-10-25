'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {measure,Adam,Random}=require('../sim/imitation.cjs');
const {sampleBatch}=require('../sim/dagger.cjs');
const {createStratifiedSampler}=require('../sim/stratified-imitation.cjs');
const {referencePolicy,jointKL,regularizedLoss}=require('../sim/imitation-kl.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,contract}=require('../sim/training.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const {bootstrap}=require('../sim/paired-evaluation.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-stratified-kl.cjs PRIOR_DAGGER_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),source=fs.readFileSync(old.source.file),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(old.sourceDigest!==sourceDigest||hash(source)!==old.source.sha256)throw Error('Prior dataset/source mismatch');
const c=JSON.parse(source),loaded=loadPolicy(old.source.file),sets=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(old.prior,'demonstrations.v8.gz'))));
const id='stratified-kl-'+new Date().toISOString().replace(/[:.]/g,'-'),dir=path.resolve('.training/imitation',id);fs.mkdirSync(dir,{recursive:true});
const config={rounds:12,updates:24,batchSize:32,learningRate:.001,testSeeds:Array.from({length:8},(_,i)=>0xdf000000+i),seed:102};
const extra=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(prior,'learner-labels.v8.gz'))));
const report={id,source:old.source,sourceDigest,prior,config,arms:[],evaluation:[],status:'caching-reference',selection:'equal-split validation NLL + joint KL(reference || learner), coefficient 1 for both arms'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
console.log('Directory:',dir);save();
const stratified=createStratifiedSampler(sets.train,extra.train);
report.sampling='50/50 sources; per 16 source rows reserve 2 jet and 4 evade if available, remaining uniform';
const references=new Map();for(const rows of [sets.train,sets.validation,extra.train,extra.validation])for(const row of rows)references.set(row,referencePolicy(loaded.net,row));
const validation=net=>{const natural=measure(net,sets.validation),learner=measure(net,extra.validation),kl=([sets.validation,extra.validation].map(rows=>rows.reduce((n,row)=>n+jointKL(net,row,references.get(row)),0)/rows.length).reduce((a,b)=>a+b,0))/2;return {loss:(natural.loss+learner.loss)/2+kl,kl,natural,learner};};
const make=()=>{const n=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture);n.parameters.set(c.parameters);return n;},selected=[];
for(const name of ['uniform','stratified']){
 const net=make(),adam=new Adam(net.parameters.length),rng=new Random(config.seed),arm={name,rounds:[],sampledSkills:{},before:validation(net)};report.arms.push(arm);let best=Float64Array.from(net.parameters),bestLoss=arm.before.loss,bestEpoch=0;report.status=name;
 for(let round=1;round<=config.rounds;round++){const start=performance.now(),training=(()=>{let loss=0;for(let i=0;i<config.updates;i++){const batch=name==='stratified'?stratified(rng,config.batchSize):sampleBatch(sets.train,extra.train,rng,config.batchSize),r=regularizedLoss(net,batch,references,1);for(const row of batch)arm.sampledSkills[row.action[0]]=(arm.sampledSkills[row.action[0]]||0)+1;adam.step(net.parameters,r.gradient,config.learningRate);loss+=r.loss;}return {updates:config.updates,samples:config.updates*config.batchSize,loss:loss/config.updates};})(),row={round,training,validation:validation(net),seconds:(performance.now()-start)/1000};arm.rounds.push(row);if(row.validation.loss<bestLoss){bestLoss=row.validation.loss;best=Float64Array.from(net.parameters);bestEpoch=round;}save();console.log(name,round,row.validation.loss);}
 net.parameters.set(best);arm.bestRound=bestEpoch;arm.selected=validation(net);arm.train={natural:measure(net,sets.train),learner:measure(net,extra.train)};selected.push({name,net});
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({schema:'banana-hop-bc-diagnostic-v1',purpose:'Inference only; critic not fitted',contract,sourceDigest,architecture:c.architecture,config:{hidden:c.config.hidden},sizes:net.sizes,parameters:Array.from(best),generation:bestEpoch,runId:id+'-'+name,sourceCheckpoint:old.source}));save();
}
report.status='evaluating';save();
for(const policy of [{name:'visible-skills'},{name:'before',net:loaded.net},...selected])for(const seed of config.testSeeds){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);console.log('Eval',policy.name,seed,r.summary.gameSeconds);save();}
report.analysis={groups:[],paired:[]};
for(const name of ['visible-skills','before','uniform','stratified']){const rows=report.evaluation.filter(r=>r.policy===name),mean=f=>rows.reduce((n,r)=>n+f(r),0)/rows.length;report.analysis.groups.push({name,seconds:mean(r=>r.summary.gameSeconds),wins:rows.filter(r=>r.success).length,milk:mean(r=>r.items.milkBottles),jetSeconds:mean(r=>r.items.milkJetSeconds)});}
for(const [a,b] of [['uniform','before'],['stratified','before'],['stratified','uniform']])report.analysis.paired.push({a,b,...bootstrap(config.testSeeds.map(seed=>report.evaluation.find(r=>r.seed===seed&&r.policy===a).summary.gameSeconds-report.evaluation.find(r=>r.seed===seed&&r.policy===b).summary.gameSeconds))});
if(hash(fs.readFileSync(old.source.file))!==old.source.sha256)throw Error('Source changed');report.sourceUnchanged=true;report.status='complete';save();console.log('Report:',path.join(dir,'report.json'));
