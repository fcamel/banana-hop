'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {featureCount,skillEnvironment}=require('../sim/training.cjs'),{createNetwork,Random,Adam}=require('../sim/ppo.cjs'),{trainEpoch}=require('../sim/imitation.cjs');
const {rows,evaluate}=require('../sim/route-pair-probes.cjs'),{createEnvironment,sourceDigest}=require('../sim/environment.cjs'),{loadPolicy}=require('../sim/ability-runner.cjs');
const {RAW,LOCAL,prepare,sample,range}=require('../sim/coordinate-experiment.cjs');
const source='.training/models/ppo-desktop-attention-validation-v2/best.json',hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash();
const dir=path.resolve('.training/diagnostics','coordinate-transfer-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash,status:'training',config:{trainingSeeds:[701,702,703],gameSeeds:Array.from({length:4},(_,i)=>0xf8100000+i),profiles:[{name:'desktop',width:1000,height:650,mobile:false},{name:'mobile-emulation',width:390,height:844,mobile:true}],epochs:300,batchSize:16,learningRate:.001},note:'Route imitation only, no PPO training. Standard action replays carry their original viewport. Scale is explicit model metadata; original model never receives scaled inputs.',models:[],episodes:[],ranges:{}};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));const policies=[];
for(const contract of [RAW,LOCAL])for(const seed of report.config.trainingSeeds){
 const net=createNetwork(featureCount,32,new Random(seed),'entity-attention-v1'),adam=new Adam(net.parameters.length),rng=new Random(seed),train=rows('train').map(r=>({...r,features:prepare(r.features,contract)}));
 for(let epoch=0;epoch<300;epoch++)trainEpoch(net,adam,train,rng,report.config);
 const name=(contract===RAW?'raw':'xy200')+'-'+seed,checkpoint={schema:'banana-hop-coordinate-experiment-v1',coordinateContract:contract,sourceDigest,architecture:'entity-attention-v1',hidden:32,parameters:Array.from(net.parameters)};
 const file=path.join(dir,name+'.json');fs.writeFileSync(file,JSON.stringify(checkpoint));const saved=JSON.parse(fs.readFileSync(file)),restored=createNetwork(featureCount,saved.hidden,new Random(0),saved.architecture);assert.ok([RAW,LOCAL].includes(saved.coordinateContract));restored.parameters.set(saved.parameters);
 const p={name,trainingSeed:seed,coordinateContract:saved.coordinateContract,net:restored};assert.deepEqual(sample(p,rows('train')[0].features,new Random(1),true,train[0].context).action,net.sample(train[0].features,new Random(1),true,train[0].context).action);policies.push(p);
 report.models.push({name,coordinateContract:contract,trainingSeed:seed,checkpoint:path.basename(file),validation:evaluate(net,rows('validation').map(r=>({...r,features:prepare(r.features,contract)})))});save();console.log('trained',name);
}
policies.push({name:'g50-reference',coordinateContract:RAW,...loadPolicy(source)});policies.at(-1).name='g50-reference';report.status='evaluating';save();
for(const profile of report.config.profiles)for(const seed of report.config.gameSeeds)for(const p of policies){
 const env=skillEnvironment({...profile,seed,record:true}),rng=new Random(seed);let decisions=0;
 while(env.summary().outcome==='running'){
  const f=env.features(),bounds=range(f),group=report.ranges[profile.name]??={};
  for(const [name,v]of Object.entries(bounds)){const r=group[name]??={count:0,maxAbsX:0,maxAbsY:0};r.count+=v.count;r.maxAbsX=Math.max(r.maxAbsX,v.maxAbsX);r.maxAbsY=Math.max(r.maxAbsY,v.maxAbsY);}
  env.step(sample(p,f,rng,true,env.context()).action);decisions++;
 }
 const tape=env.replay();createEnvironment().restoreTape(tape);const name=`${profile.name}-${seed}-${p.name}.replay.json`;fs.writeFileSync(path.join(dir,name),JSON.stringify(tape));
 report.episodes.push({profile:profile.name,seed,policy:p.name,trainingSeed:p.trainingSeed,seconds:env.summary().gameSeconds,decisions,items:env.metrics(),hits:env.damageEvents().length,replay:name,replayVerified:true});save();console.log(profile.name,seed,p.name,env.summary().gameSeconds);
}
report.sourceUnchanged=sourceHash===hash();assert.ok(report.sourceUnchanged);report.status='complete';save();
