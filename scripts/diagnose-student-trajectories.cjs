'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createNetwork,Random}=require('../sim/ppo.cjs');
const {featureCount,skillEnvironment}=require('../sim/training.cjs');
const {RAW,LOCAL,sample}=require('../sim/coordinate-experiment.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const {key,situation,coverage,summarize}=require('../sim/student-audit.cjs');
const {skills}=require('../sim/skills.cjs');
const holdout=process.argv[2];if(!holdout||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-student-trajectories.cjs HOLDOUT_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(holdout,'report.json')));assert.equal(old.status,'complete');assert.equal(old.sourceDigest,sourceDigest);
const data=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(old.prior,'demonstrations.v8.gz')))),counts=coverage(data.train),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const dir=path.resolve('.training/diagnostics','student-trajectories-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={holdout,sourceDigest,status:'auditing',seeds:old.seeds.slice(0,4),rows:[],episodes:[],validationCoverage:{rows:data.validation.length,sparse:data.validation.filter(r=>(counts[key(r.features)]||0)<=5).length},note:'First four holdout seeds fixed by order. Teacher advice only; never executed. Coarse visible-state buckets are descriptive, not proof of novelty. Hits assigned to current decision interval, not causally attributed.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(const source of old.sources){
 assert.equal(hash(source.file),source.sha256);const c=JSON.parse(fs.readFileSync(source.file));assert.equal(c.sourceDigest,sourceDigest);assert.ok([RAW,LOCAL].includes(c.coordinateContract));
 const net=createNetwork(featureCount,c.hidden,new Random(0),c.architecture);assert.equal(c.parameters.length,net.parameters.length);assert.ok(c.parameters.every(Number.isFinite));net.parameters.set(c.parameters);
 const policy={name:path.basename(source.file,'.json'),net,coordinateContract:c.coordinateContract};
 for(const seed of report.seeds){
  const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:true}),rng=new Random(seed),rows=[];let previous=0;
  while(env.summary().outcome==='running'){
   const f=env.features(),context=env.context(),choice=sample(policy,f,rng,true,context).action,teacher=choose(f,context,previous).choice,time=env.observe().time,n=env.damageEvents().length;
   env.step(choice);const events=env.damageEvents().slice(n);
   rows.push({seed,policy:policy.name,time,duration:env.observe().time-time,choice,teacher,skill:skills[choice[0]].name,teacherSkill:skills[teacher[0]].name,disagree:choice.some((x,i)=>x!==teacher[i]),situation:situation(f),trainingCount:counts[key(f)]||0,hits:events.length,events,previous:rows.slice(-2).map(r=>({time:r.time,choice:r.choice}))});previous=choice[1];
  }
  const reference=old.episodes.find(e=>e.seed===seed&&e.policy===policy.name),tape=JSON.parse(fs.readFileSync(path.join(holdout,reference.replay)));assert.equal(env.replay().finalDigest,tape.finalDigest);
  report.rows.push(...rows);report.episodes.push({seed,policy:policy.name,seconds:env.summary().gameSeconds,matchedOriginalReplay:true,summary:summarize(rows)});save();console.log(policy.name,seed,env.summary().gameSeconds);
 }
 assert.equal(hash(source.file),source.sha256);
}
report.summary=summarize(report.rows);report.byArm=Object.fromEntries(['raw','xy200'].map(a=>[a,summarize(report.rows.filter(r=>r.policy.startsWith(a)))]));report.bySkill=Object.fromEntries([...new Set(report.rows.map(r=>r.skill))].map(s=>[s,summarize(report.rows.filter(r=>r.skill===s))]));report.sourcesUnchanged=true;report.status='complete';save();
