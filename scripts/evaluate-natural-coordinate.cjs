'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createNetwork,Random}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {RAW,LOCAL,sample}=require('../sim/coordinate-experiment.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {createEnvironment,sourceDigest}=require('../sim/environment.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/evaluate-natural-coordinate.cjs PRIOR_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));assert.equal(old.status,'complete');assert.equal(old.sourceDigest,sourceDigest);
const seeds=Array.from({length:16},(_,i)=>0xf8500000+i),used=new Set([...old.config.trainSeeds,...old.config.validationSeeds,...old.config.testSeeds]);assert.ok(seeds.every(s=>!used.has(s)));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const policies=[],sources=[];
for(const arm of ['raw','xy200'])for(const trainingSeed of old.config.modelSeeds){
 const name=arm+'-'+trainingSeed,file=path.join(prior,name+'.json'),c=JSON.parse(fs.readFileSync(file));
 assert.equal(c.schema,'banana-hop-coordinate-experiment-v1');assert.equal(c.sourceDigest,sourceDigest);assert.equal(c.coordinateContract,arm==='raw'?RAW:LOCAL);assert.equal(c.architecture,'entity-attention-v1');assert.equal(c.hidden,32);
 const net=createNetwork(featureCount,c.hidden,new Random(0),c.architecture);assert.equal(c.parameters.length,net.parameters.length);assert.ok(c.parameters.every(Number.isFinite));net.parameters.set(c.parameters);
 policies.push({name,arm,trainingSeed,net,coordinateContract:c.coordinateContract});sources.push({file,sha256:hash(file)});
}
const dir=path.resolve('.training/diagnostics','natural-coordinate-holdout-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={prior,sourceDigest,sources,seeds,trainingSeeds:old.config.modelSeeds,status:'evaluating',episodes:[],config:{width:1000,height:650,mobile:false,greedy:true},note:'Frozen models, independent game seeds. No training or model selection. Save/verify 96 model replays; teacher reference has no replay.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(const seed of seeds)for(const p of [...policies,{name:'visible-teacher',arm:'teacher'}]){
 const env=skillEnvironment({...report.config,seed,record:!!p.net}),rng=new Random(seed);let previous=0;
 while(env.summary().outcome==='running'){const f=env.features(),context=env.context(),action=p.net?sample(p,f,rng,true,context).action:choose(f,context,previous).choice;previous=action[1];env.step(action);}
 const row={seed,policy:p.name,arm:p.arm,trainingSeed:p.trainingSeed,seconds:env.summary().gameSeconds,items:env.metrics(),hits:env.damageEvents().length};
 if(p.net){const tape=env.replay();createEnvironment().restoreTape(tape);row.replay=seed+'-'+p.name+'.replay.json';fs.writeFileSync(path.join(dir,row.replay),JSON.stringify(tape));row.replayVerified=true;}
 report.episodes.push(row);save();console.log(seed,p.name,row.seconds);
}
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
report.summary=Object.fromEntries(['raw','xy200','teacher'].map(arm=>{const e=report.episodes.filter(r=>r.arm===arm);return [arm,{episodes:e.length,meanSeconds:mean(e.map(r=>r.seconds)),wins:e.filter(r=>r.seconds>=60-1e-7).length,meanHits:mean(e.map(r=>r.hits))}];}));
const score=(arm,trainingSeed,seed)=>report.episodes.find(r=>r.arm===arm&&r.trainingSeed===trainingSeed&&r.seed===seed).seconds;
const matrix=old.config.modelSeeds.map(t=>seeds.map(s=>score('xy200',t,s)-score('raw',t,s)));report.paired=crossedBootstrap(matrix);report.paired.perGameSeed=seeds.map((seed,i)=>({seed,difference:mean(matrix.map(r=>r[i]))}));
for(const s of sources)assert.equal(hash(s.file),s.sha256);report.sourcesUnchanged=true;report.status='complete';save();
