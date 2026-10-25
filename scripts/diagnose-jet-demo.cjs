'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {lossAndGradient,Adam,Random}=require('../sim/imitation.cjs');
const {createNetwork}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {sourceDigest,createEnvironment}=require('../sim/environment.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const {batch,metrics}=require('../sim/jet-demo.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-jet-demo.cjs NATURAL_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));assert.equal(old.status,'complete');assert.equal(old.sourceDigest,sourceDigest);
const file=path.join(prior,'demonstrations.v8.gz'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),data=v8.deserialize(zlib.gunzipSync(fs.readFileSync(file))),sources=[{file,hash:hash(file)}];
const config={modelSeeds:[701,702,703],trainSeeds:[0xf8700000,0xf8700001],validationSeeds:[0xf8800000,0xf8800001],testSeeds:Array.from({length:4},(_,i)=>0xf8900000+i),updates:200,batchSize:32,learningRate:.001};
assert.equal(new Set([...config.trainSeeds,...config.validationSeeds,...config.testSeeds]).size,8);
const dir=path.resolve('.training/diagnostics','jet-demo-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={prior,sourceDigest,config,sources,status:'collecting',collection:[],models:[],episodes:[],note:'Raw scale, all CE weights 1. Frozen students collect visible teacher labels only when jet is legal. Whole game seeds separated. Matched 200-step fine-tunes; control original data, mixed half original/half student data with natural class proportions.'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
const checkpoints=config.modelSeeds.map(seed=>{const f=path.join(prior,'raw-'+seed+'.json'),c=JSON.parse(fs.readFileSync(f));assert.equal(c.sourceDigest,sourceDigest);assert.equal(c.coordinateContract,'milk-skills-v5');sources.push({file:f,hash:hash(f)});return {seed,c};});
function make(c){const n=createNetwork(featureCount,c.hidden,new Random(0),c.architecture);assert.equal(c.parameters.length,n.parameters.length);assert.ok(c.parameters.every(Number.isFinite));n.parameters.set(c.parameters);return n;}
const extra={train:[],validation:[]};
for(const split of ['train','validation'])for(const {seed:trainingSeed,c} of checkpoints){const net=make(c);for(const seed of config[split+'Seeds']){
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false}),rng=new Random(seed);let previous=0,rows=0,positive=0;
 while(env.summary().outcome==='running'){const features=env.features(),context=env.context(),action=net.sample(features,rng,true,context).action;
 if(context.skills[6]){const teacher=choose(features,context,previous).choice;extra[split].push({features,context,action:teacher,seed,trainingSeed,time:env.observe().time});rows++;positive+=+(teacher[0]===6);}previous=action[1];env.step(action);}
 report.collection.push({split,trainingSeed,seed,rows,positive,seconds:env.summary().gameSeconds});save();console.log('collect',split,trainingSeed,seed,rows,positive);
}}
for(const split of ['train','validation']){assert.ok(extra[split].some(r=>r.action[0]===6));assert.ok(extra[split].some(r=>r.action[0]!==6));}
fs.writeFileSync(path.join(dir,'student-labels.v8.gz'),zlib.gzipSync(v8.serialize(extra)));
const policies=[];report.status='training';save();
for(const {seed,c}of checkpoints){report.models.push({name:'before-'+seed,studentValidation:metrics(make(c),extra.validation),originalValidation:metrics(make(c),data.validation)});
 for(const arm of ['control','mixed']){const net=make(c),adam=new Adam(net.parameters.length),rng=new Random(seed),name=arm+'-'+seed;for(let i=0;i<config.updates;i++){const b=batch(data.train,extra.train,rng,arm==='mixed'),r=lossAndGradient(net,b);adam.step(net.parameters,r.gradient,config.learningRate);}
 report.models.push({name,studentValidation:metrics(net,extra.validation),originalValidation:metrics(net,data.validation)});policies.push({name,arm,trainingSeed:seed,net});fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({...c,parameters:Array.from(net.parameters)}));save();console.log('trained',name);
 }}
report.status='evaluating';save();
for(const seed of config.testSeeds)for(const p of policies){const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:true}),rng=new Random(seed);while(env.summary().outcome==='running')env.step(p.net.sample(env.features(),rng,true,env.context()).action);
 const tape=env.replay();createEnvironment().restoreTape(tape);const replay=seed+'-'+p.name+'.replay.json';fs.writeFileSync(path.join(dir,replay),JSON.stringify(tape));report.episodes.push({seed,policy:p.name,arm:p.arm,trainingSeed:p.trainingSeed,seconds:env.summary().gameSeconds,replay,replayVerified:true});save();console.log('eval',seed,p.name,env.summary().gameSeconds);}
const score=(arm,t,s)=>report.episodes.find(r=>r.arm===arm&&r.trainingSeed===t&&r.seed===s).seconds;report.paired=crossedBootstrap(config.modelSeeds.map(t=>config.testSeeds.map(s=>score('mixed',t,s)-score('control',t,s))));for(const s of sources)assert.equal(hash(s.file),s.hash);report.sourcesUnchanged=true;report.status='complete';save();
