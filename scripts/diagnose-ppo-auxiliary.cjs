'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {execute}=require('../sim/training-worker.cjs');
const {Adam,Random,optimize}=require('../sim/ppo.cjs');
const {lossAndGradient}=require('../sim/imitation.cjs');
const {createStratifiedSampler}=require('../sim/stratified-imitation.cjs');
const {bootstrap}=require('../sim/paired-evaluation.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-ppo-auxiliary.cjs DAGGER_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(old.sourceDigest!==sourceDigest||hash(old.source.file)!==old.source.sha256)throw Error('Source mismatch');
const source=JSON.parse(fs.readFileSync(old.source.file)),read=p=>v8.deserialize(zlib.gunzipSync(fs.readFileSync(p))),natural=read(path.join(old.prior,'demonstrations.v8.gz')),learner=read(path.join(prior,'learner-labels.v8.gz')),sample=createStratifiedSampler(natural.train,learner.train);
const dir=path.resolve('.training/imitation','ppo-aux-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const config={rounds:3,decisions:512,epochs:2,batchSize:64,learningRate:.0003,targetKl:.02,auxiliaryCoefficient:.05,testSeeds:Array.from({length:8},(_,i)=>0xe1000000+i),trainSeeds:Array.from({length:3},(_,i)=>0xe2000000+i*100),profile:{width:1000,height:650,mobile:false}};
const report={source:old.source,sourceDigest,prior,config,note:'Warm start actor+critic; reset Adam equally. Opening-only complete episodes. Final round preselected, no test-based selection. No PPO resume checkpoint exported.',arms:[],evaluation:[],status:'training'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log('Directory:',dir);const selected=[];
for(const name of ['ppo','ppo-aux']){
 const {net}=loadPolicy(old.source.file),adam=new Adam(net.parameters.length),shuffle=new Random(104),auxRng=new Random(105),arm={name,rounds:[]};report.arms.push(arm);
 for(let round=0;round<config.rounds;round++){
  const start=performance.now(),roll=execute({kind:'rollout',seed:config.trainSeeds[round],policySeed:0xe3000000+round,profile:config.profile,decisions:config.decisions,hidden:source.config.hidden,architecture:source.architecture,parameters:net.parameters}),collected=performance.now();
  const stats=optimize(net,adam,roll.buffer,shuffle,{...config,...(name==='ppo-aux'?{auxiliary:n=>{const r=lossAndGradient(n,sample(auxRng,32));return {loss:r.loss*config.auxiliaryCoefficient,gradient:r.gradient.map(g=>g*config.auxiliaryCoefficient)};}}:{})});
  arm.rounds.push({round:round+1,decisions:roll.buffer.length,episodes:roll.episodes,skillCounts:roll.skillCounts,timeBuckets:roll.timeBuckets,rolloutSeconds:(collected-start)/1000,updateSeconds:(performance.now()-collected)/1000,stats});save();console.log(name,round+1,roll.buffer.length,stats.updates,stats.diagnostics.kl);
 }
 selected.push({name,net});fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({schema:'banana-hop-ppo-diagnostic-v1',contract:source.contract,sourceDigest,architecture:source.architecture,config:{hidden:source.config.hidden},sizes:net.sizes,parameters:Array.from(net.parameters),generation:3,runId:name,sourceCheckpoint:old.source}));
}
report.status='evaluating';save();
for(const seed of config.testSeeds){for(const p of [{name:'before',net:loadPolicy(old.source.file).net},...selected]){const r=runCase(p,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);save();}console.log('Test',config.testSeeds.indexOf(seed)+1,'/8');}
report.summary=['before','ppo','ppo-aux'].map(name=>{const rs=report.evaluation.filter(r=>r.policy===name),mean=f=>rs.reduce((n,r)=>n+f(r),0)/rs.length;return {name,seconds:mean(r=>r.summary.gameSeconds),wins:rs.filter(r=>r.success).length,milk:mean(r=>r.items.milkBottles),jetSeconds:mean(r=>r.items.milkJetSeconds)};});
report.paired=[['ppo-aux','ppo'],['ppo-aux','before'],['ppo','before']].map(([a,b])=>({a,b,...bootstrap(config.testSeeds.map(seed=>report.evaluation.find(r=>r.seed===seed&&r.policy===a).summary.gameSeconds-report.evaluation.find(r=>r.seed===seed&&r.policy===b).summary.gameSeconds))}));
if(hash(old.source.file)!==old.source.sha256)throw Error('Source changed');report.weightsUnchanged=true;report.status='complete';save();console.log(JSON.stringify({summary:report.summary,paired:report.paired},null,2));
