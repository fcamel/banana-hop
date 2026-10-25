'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {createNetwork,heads}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {sourceDigest,createEnvironment}=require('../sim/environment.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-jet-weight.cjs NATURAL_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));assert.equal(old.status,'complete');assert.equal(old.sourceDigest,sourceDigest);
const file=path.join(prior,'demonstrations.v8.gz'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),data=v8.deserialize(zlib.gunzipSync(fs.readFileSync(file))),sources=[{file,hash:hash(file)}];
const config={...old.config,testSeeds:Array.from({length:8},(_,i)=>0xf8600000+i),jetSkillWeight:3};
const dir=path.resolve('.training/diagnostics','jet-weight-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={prior,sourceDigest,config,status:'training',models:[],episodes:[],sources,note:'Raw coordinates fixed. Only jet label skill-head CE weight changes 1 to 3; parameter-head weights remain 1. Reuse exact earlier unweighted controls, train treatment fresh with same seeds/shuffle/40 epochs. No PPO.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
function metrics(net,rows){let positive=0,tp=0,fp=0,eligibleNegative=0,eligibleFP=0,correct=0;const rng=new Random(1);for(const r of rows){const a=net.sample(r.features,rng,true,r.context).action,p=r.action[0]===6,chosen=a[0]===6;positive+=+p;tp+=+(p&&chosen);fp+=+(!p&&chosen);if(!p&&r.context.skills[6]){eligibleNegative++;eligibleFP+=+chosen;}correct+=+a.every((v,i)=>v===r.action[i]);}return {rows:rows.length,positive,tp,fp,recall:positive?tp/positive:null,falsePositiveRate:fp/(rows.length-positive),eligibleNegative,eligibleFP,eligibleFalsePositiveRate:eligibleNegative?eligibleFP/eligibleNegative:null,jointAccuracy:correct/rows.length};}
const weights=heads.map(n=>Array(n).fill(1));weights[0][6]=3;const policies=[];
for(const seed of config.modelSeeds){
 const f=path.join(prior,'raw-'+seed+'.json'),c=JSON.parse(fs.readFileSync(f));assert.equal(c.coordinateContract,'milk-skills-v5');assert.equal(c.sourceDigest,sourceDigest);sources.push({file:f,hash:hash(f)});
 const baseline=createNetwork(featureCount,32,new Random(seed),'entity-attention-v1');assert.equal(c.parameters.length,baseline.parameters.length);baseline.parameters.set(c.parameters);
 policies.push({name:'control-'+seed,arm:'control',seed,net:baseline});report.models.push({name:'control-'+seed,validation:metrics(baseline,data.validation),reused:true});
 const net=createNetwork(featureCount,32,new Random(seed),'entity-attention-v1'),adam=new Adam(net.parameters.length),rng=new Random(seed),curve=[];
 for(let e=1;e<=config.epochs;e++){const loss=trainEpoch(net,adam,data.train,rng,{...config,classWeights:weights});if(e%10===0){curve.push({epoch:e,loss});console.log(seed,e,loss);}}
 const name='jet3-'+seed;fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({...c,parameters:Array.from(net.parameters),jetSkillWeight:3}));policies.push({name,arm:'jet3',seed,net});report.models.push({name,curve,validation:metrics(net,data.validation)});save();
}
report.status='evaluating';save();
for(const seed of config.testSeeds)for(const p of [...policies,{name:'teacher',arm:'teacher'}]){
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:!!p.net}),rng=new Random(seed);let previous=0,teacherJet=0,studentJet=0,matchedJet=0,teacherNonJet=0,falseJet=0;
 while(env.summary().outcome==='running'){const f=env.features(),context=env.context(),teacher=choose(f,context,previous).choice,a=p.net?p.net.sample(f,rng,true,context).action:teacher;teacherJet+=+(teacher[0]===6);studentJet+=+(a[0]===6);matchedJet+=+(teacher[0]===6&&a[0]===6);teacherNonJet+=+(teacher[0]!==6);falseJet+=+(teacher[0]!==6&&a[0]===6);previous=a[1];env.step(a);}
 const row={seed,policy:p.name,arm:p.arm,trainingSeed:p.seed,seconds:env.summary().gameSeconds,teacherJet,studentJet,matchedJet,teacherNonJet,falseJet};if(p.net){const tape=env.replay();createEnvironment().restoreTape(tape);row.replay=seed+'-'+p.name+'.replay.json';fs.writeFileSync(path.join(dir,row.replay),JSON.stringify(tape));row.replayVerified=true;}
 report.episodes.push(row);save();console.log('eval',seed,p.name,row.seconds);
}
const score=(arm,t,s)=>report.episodes.find(r=>r.arm===arm&&r.trainingSeed===t&&r.seed===s).seconds;report.paired=crossedBootstrap(config.modelSeeds.map(t=>config.testSeeds.map(s=>score('jet3',t,s)-score('control',t,s))));for(const s of sources)assert.equal(hash(s.file),s.hash);report.sourcesUnchanged=true;report.status='complete';save();
