'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {execute}=require('../sim/training-worker.cjs');
const {Adam,Random,optimize}=require('../sim/ppo.cjs');
const {lossAndGradient}=require('../sim/imitation.cjs');
const {createStratifiedSampler}=require('../sim/stratified-imitation.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function runReplicate({prior,dir,config,replicate}){
 const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),source=JSON.parse(fs.readFileSync(old.source.file)),read=p=>v8.deserialize(zlib.gunzipSync(fs.readFileSync(p))),natural=read(path.join(old.prior,'demonstrations.v8.gz')),learner=read(path.join(prior,'learner-labels.v8.gz')),sample=createStratifiedSampler(natural.train,learner.train);
 const report={replicate,arms:[],evaluation:[],status:'training'},save=()=>fs.writeFileSync(path.join(dir,`replicate-${replicate}.json`),JSON.stringify(report,null,2)),selected=[];save();
 for(const name of ['ppo','ppo-aux']){
  const {net}=loadPolicy(old.source.file),adam=new Adam(net.parameters.length),shuffle=new Random(1000+replicate),auxRng=new Random(2000+replicate),arm={name,rounds:[]};report.arms.push(arm);
  for(let round=0;round<config.rounds;round++){
   const start=performance.now(),roll=execute({kind:'rollout',seed:0xe5000000+replicate*0x10000+round*100,policySeed:0xe6000000+replicate*0x10000+round,profile:config.profile,decisions:config.decisions,hidden:source.config.hidden,architecture:source.architecture,parameters:net.parameters}),collected=performance.now();
   const stats=optimize(net,adam,roll.buffer,shuffle,{...config,...(name==='ppo-aux'?{auxiliary:n=>{const r=lossAndGradient(n,sample(auxRng,32));return {loss:r.loss*config.auxiliaryCoefficient,gradient:r.gradient.map(g=>g*config.auxiliaryCoefficient)};}}:{})});
   arm.rounds.push({round:round+1,decisions:roll.buffer.length,episodes:roll.episodes,seed:0xe5000000+replicate*0x10000+round*100,timeBuckets:roll.timeBuckets,rolloutSeconds:(collected-start)/1000,updateSeconds:(performance.now()-collected)/1000,stats});save();parentPort.postMessage({progress:`replicate ${replicate} ${name} ${round+1}/${config.rounds}`});
  }
  selected.push({name,net});const file=path.join(dir,`${name}-${replicate}.json`);fs.writeFileSync(file,JSON.stringify({schema:'banana-hop-ppo-diagnostic-v1',contract:source.contract,sourceDigest,architecture:source.architecture,config:{hidden:source.config.hidden},sizes:net.sizes,parameters:Array.from(net.parameters),generation:config.rounds,runId:`${name}-${replicate}`,sourceCheckpoint:old.source}));arm.checkpoint={file,sha256:hash(file)};
 }
 report.status='evaluating';save();const policies=replicate===0?[{name:'before',net:loadPolicy(old.source.file).net},...selected]:selected;
 for(const [i,seed]of config.testSeeds.entries()){for(const policy of policies){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.evaluation.push(r);}save();if((i+1)%8===0)parentPort.postMessage({progress:`replicate ${replicate} evaluation ${i+1}/32`});}
 if(hash(old.source.file)!==old.source.sha256||report.arms.some(a=>hash(a.checkpoint.file)!==a.checkpoint.sha256))throw Error('Weights changed');report.weightsUnchanged=true;report.status='complete';save();return report;
}
async function main(){
 const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-ppo-replicates.cjs DAGGER_DIRECTORY');const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));if(old.sourceDigest!==sourceDigest||hash(old.source.file)!==old.source.sha256)throw Error('Source mismatch');
 const dir=path.resolve('.training/imitation','ppo-replicates-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
 const config={replicates:3,rounds:10,decisions:512,epochs:2,batchSize:64,learningRate:.0003,targetKl:.02,auxiliaryCoefficient:.05,testSeeds:Array.from({length:32},(_,i)=>0xe7000000+i),profile:{width:1000,height:650,mobile:false}};
 const report={source:old.source,sourceDigest,prior,config,note:'Precommitted 3 training RNG replicas, same G50 initialization, 10 rounds each arm. Final models only, 32 unseen test seeds. Primary comparison PPO versus source; auxiliary versus PPO secondary. No selection or adaptive extension.',status:'running'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log('Directory:',dir);
 const workers=[];try{
  const results=await Promise.all(Array.from({length:config.replicates},(_,replicate)=>new Promise((resolve,reject)=>{const worker=new Worker(__filename,{workerData:{prior,dir,config,replicate}});workers.push(worker);let result;worker.on('message',m=>{if(m.progress)console.log(m.progress);else result=m.result;});worker.on('error',reject);worker.on('exit',code=>{if(code!==0||!result)reject(Error('Replicate worker failed '+code));else resolve(result);});})));
  report.summary=[];const base=results[0].evaluation.filter(r=>r.policy==='before'),mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  for(const name of ['before','ppo','ppo-aux']){const rows=name==='before'?base:results.flatMap(r=>r.evaluation.filter(e=>e.policy===name));report.summary.push({name,episodes:rows.length,seconds:mean(rows.map(r=>r.summary.gameSeconds)),wins:rows.filter(r=>r.success).length,milk:mean(rows.map(r=>r.items.milkBottles)),jetSeconds:mean(rows.map(r=>r.items.milkJetSeconds)),perReplicate:name==='before'?null:results.map(r=>mean(r.evaluation.filter(e=>e.policy===name).map(e=>e.summary.gameSeconds)))});}
  const score=(r,name,seed)=>(name==='before'?base:r.evaluation).find(e=>e.policy===name&&e.seed===seed).summary.gameSeconds;
  report.paired=[['ppo','before'],['ppo-aux','ppo'],['ppo-aux','before']].map(([a,b])=>({a,b,...crossedBootstrap(results.map(r=>config.testSeeds.map(seed=>score(r,a,seed)-score(r,b,seed))))}));
  if(hash(old.source.file)!==old.source.sha256)throw Error('Source changed');report.status='complete';report.weightsUnchanged=true;save();console.log(JSON.stringify({summary:report.summary,paired:report.paired},null,2));
 }catch(error){report.status='failed';report.error=error.message;save();throw error;}finally{await Promise.all(workers.map(w=>w.terminate()));}
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});else {parentPort.postMessage({result:runReplicate(workerData)});parentPort.close();}
