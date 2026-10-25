'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createNetwork,Random}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {sourceDigest,createEnvironment}=require('../sim/environment.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const {metrics}=require('../sim/jet-demo.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/evaluate-jet-demo.cjs JET_DEMO_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));assert.equal(old.status,'complete');assert.equal(old.sourceDigest,sourceDigest);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),sources=[];
function load(file){const c=JSON.parse(fs.readFileSync(file));assert.equal(c.sourceDigest,sourceDigest);assert.equal(c.schema,'banana-hop-coordinate-experiment-v1');assert.equal(c.coordinateContract,'milk-skills-v5');assert.equal(c.architecture,'entity-attention-v1');assert.equal(c.hidden,32);const net=createNetwork(featureCount,32,new Random(0),c.architecture);assert.equal(c.parameters.length,net.parameters.length);assert.ok(c.parameters.every(Number.isFinite));net.parameters.set(c.parameters);sources.push({file,hash:hash(file)});return net;}
const policies=['control','mixed'].flatMap(arm=>old.config.modelSeeds.map(trainingSeed=>({name:arm+'-'+trainingSeed,arm,trainingSeed,net:load(path.join(prior,arm+'-'+trainingSeed+'.json'))})));
const collectors=old.config.modelSeeds.map(seed=>({seed,net:load(path.join(old.prior,'raw-'+seed+'.json'))}));
const probeSeeds=Array.from({length:4},(_,i)=>0xf8a00000+i),testSeeds=Array.from({length:16},(_,i)=>0xf8b00000+i),used=new Set([...old.config.trainSeeds,...old.config.validationSeeds,...old.config.testSeeds]);assert.equal(new Set([...probeSeeds,...testSeeds]).size,20);assert.ok([...probeSeeds,...testSeeds].every(s=>!used.has(s)));
const dir=path.resolve('.training/diagnostics','jet-demo-holdout-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={prior,sourceDigest,sources,probeSeeds,testSeeds,status:'collecting',collection:[],models:[],episodes:[],note:'Frozen six models. Same held-out jet-legal observations from original frozen raw collectors for all policies. Four probe seeds, separate sixteen survival seeds. No training/selection; desktop only.'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();const rows=[];
for(const seed of probeSeeds)for(const c of collectors){const env=skillEnvironment({seed,width:1000,height:650,mobile:false}),rng=new Random(seed);let previous=0,count=0,positive=0;
 while(env.summary().outcome==='running'){const features=env.features(),context=env.context(),action=c.net.sample(features,rng,true,context).action;if(context.skills[6]){const label=choose(features,context,previous).choice;rows.push({features,context,action:label,seed,collector:c.seed});count++;positive+=+(label[0]===6);}previous=action[1];env.step(action);}
 report.collection.push({seed,collector:c.seed,rows:count,positive,seconds:env.summary().gameSeconds});save();console.log('collect',seed,c.seed,count,positive);
}
assert.ok(rows.some(r=>r.action[0]===6)&&rows.some(r=>r.action[0]!==6));fs.writeFileSync(path.join(dir,'heldout-observations.v8.gz'),zlib.gzipSync(v8.serialize(rows)));
for(const p of policies){report.models.push({name:p.name,metrics:metrics(p.net,rows),perGameSeed:probeSeeds.map(seed=>({seed,metrics:metrics(p.net,rows.filter(r=>r.seed===seed))}))});save();}
report.status='evaluating';save();
for(const seed of testSeeds)for(const p of policies){const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:true}),rng=new Random(seed);while(env.summary().outcome==='running')env.step(p.net.sample(env.features(),rng,true,env.context()).action);const tape=env.replay();createEnvironment().restoreTape(tape);const replay=seed+'-'+p.name+'.replay.json';fs.writeFileSync(path.join(dir,replay),JSON.stringify(tape));report.episodes.push({seed,policy:p.name,arm:p.arm,trainingSeed:p.trainingSeed,seconds:env.summary().gameSeconds,replay,replayVerified:true});save();console.log('eval',seed,p.name,env.summary().gameSeconds);}
const score=(arm,t,s)=>report.episodes.find(r=>r.arm===arm&&r.trainingSeed===t&&r.seed===s).seconds;report.paired=crossedBootstrap(old.config.modelSeeds.map(t=>testSeeds.map(s=>score('mixed',t,s)-score('control',t,s))));for(const s of sources)assert.equal(hash(s.file),s.hash);report.sourcesUnchanged=true;report.status='complete';save();
