'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {collect,measure,trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {RAW,LOCAL,prepare,sample}=require('../sim/coordinate-experiment.cjs');
const {decode,choose}=require('../sim/visible-baseline.cjs');
const {createEnvironment,sourceDigest}=require('../sim/environment.cjs');
const source='.training/models/ppo-desktop-attention-validation-v2/best.json';
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const dir=path.resolve('.training/diagnostics','natural-coordinate-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const config={trainSeeds:Array.from({length:6},(_,i)=>0xf8200000+i),validationSeeds:[0xf8300000,0xf8300001],testSeeds:Array.from({length:4},(_,i)=>0xf8400000+i),modelSeeds:[701,702,703],epochs:40,batchSize:32,learningRate:.001};
assert.equal(new Set([...config.trainSeeds,...config.validationSeeds,...config.testSeeds]).size,12);
const report={config,sourceDigest,sourceHash:hash(),status:'collecting',teacher:[],coverage:{},models:[],episodes:[],note:'Natural visible-teacher behavioral cloning; fixed final checkpoint, no PPO or validation selection. Desktop only.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
const sets={train:[],validation:[]};
function tags(row){const {objects}=decode(row.features);return {bullets:objects.some(o=>o.kind==='drops'),flight:objects.some(o=>o.kind==='slices'&&o.flight),cluster:objects.filter(o=>['slices','milk'].includes(o.kind)&&Math.hypot(o.x,o.y)<180).length>=4,quiet:!objects.some(o=>['slices','milk','drops'].includes(o.kind)&&Math.hypot(o.x,o.y)<180)};}
for(const split of ['train','validation']){
 for(const seed of config[split+'Seeds']){const r=collect(seed);sets[split].push(...r.rows);report.teacher.push({split,seed,...r.summary,rows:r.rows.length});console.log('collected',split,seed,r.rows.length);}
 const counts={rows:sets[split].length,bullets:0,flight:0,cluster:0,quiet:0};for(const row of sets[split])for(const [k,on]of Object.entries(tags(row)))counts[k]+=+on;report.coverage[split]=counts;save();
}
for(const split of ['train','validation'])for(const key of ['bullets','flight','cluster','quiet'])assert.ok(report.coverage[split][key]>0,`Missing ${split} coverage: ${key}`);
fs.writeFileSync(path.join(dir,'demonstrations.v8.gz'),zlib.gzipSync(v8.serialize(sets)));
const policies=[];
for(const contract of [RAW,LOCAL])for(const seed of config.modelSeeds){
 const name=(contract===RAW?'raw':'xy200')+'-'+seed,net=createNetwork(featureCount,32,new Random(seed),'entity-attention-v1'),adam=new Adam(net.parameters.length),rng=new Random(seed);
 const data=Object.fromEntries(Object.entries(sets).map(([split,rows])=>[split,rows.map(r=>({...r,features:prepare(r.features,contract)}))]));
 const started=performance.now(),curve=[];for(let e=1;e<=config.epochs;e++){const loss=trainEpoch(net,adam,data.train,rng,config);if(e%10===0){curve.push({epoch:e,trainLoss:loss});console.log(name,e,loss);}}
 const validation=measure(net,data.validation),bySituation={};for(const k of ['bullets','flight','cluster','quiet']){const subset=data.validation.filter((_,i)=>tags(sets.validation[i])[k]);bySituation[k]=subset.length?measure(net,subset):null;}
 const checkpoint={schema:'banana-hop-coordinate-experiment-v1',coordinateContract:contract,sourceDigest,architecture:'entity-attention-v1',hidden:32,parameters:Array.from(net.parameters)};
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(checkpoint));policies.push({name,net,coordinateContract:contract});report.models.push({name,curve,validation,bySituation,seconds:(performance.now()-started)/1000,updates:config.epochs*Math.ceil(data.train.length/config.batchSize)});report.status='training';save();
}
report.status='evaluating';save();
for(const seed of config.testSeeds)for(const policy of [...policies,{name:'visible-teacher'}]){
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:true}),rng=new Random(seed);let previous=0;
 while(env.summary().outcome==='running'){const f=env.features(),c=env.context(),action=policy.net?sample(policy,f,rng,true,c).action:choose(f,c,previous).choice;previous=action[1];env.step(action);}
 const replay=env.replay();createEnvironment().restoreTape(replay);const file=seed+'-'+policy.name+'.replay.json';fs.writeFileSync(path.join(dir,file),JSON.stringify(replay));report.episodes.push({seed,policy:policy.name,seconds:env.summary().gameSeconds,items:env.metrics(),hits:env.damageEvents().length,replay:file,replayVerified:true});save();console.log('eval',seed,policy.name,env.summary().gameSeconds);
}
assert.equal(hash(),report.sourceHash);report.sourceUnchanged=true;report.status='complete';save();
