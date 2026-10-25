'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {specification,episode}=require('../sim/dodge-curriculum.cjs');
const {Adam,Random,optimize}=require('../sim/ppo.cjs');
const {crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
const actorOnly=process.argv.includes('--actor-only');
const pattern=process.argv[2]||'single';if(!['single','cross'].includes(pattern))throw Error('Usage: diagnose-dodge-course.cjs [single|cross]');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const dir=path.resolve('.training/diagnostics','dodge-course-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const report={source,sourceHash:hash(),config:{pattern,actorOnly,rounds:10,minDecisions:256,replicates:3,testCases:64,transferSeeds:8,horizon:4,hp:1},rounds:[],local:[],transfer:[],status:'running'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log(dir);
const policies=[{...loadPolicy(source),name:'before'}];
for(let rep=0;rep<3;rep++){
 const policy={...loadPolicy(source),name:'course-'+rep},adam=new Adam(policy.net.parameters.length),rng=new Random(810+rep);let caseIndex=rep*10000;
 for(let round=0;round<10;round++){
  const start=performance.now(),buffer=[];let episodes=0;
  while(buffer.length<256){const r=episode(policy,specification(caseIndex++,'train',pattern),{rng,collect:true});buffer.push(...r.buffer);episodes++;}
  const stats=optimize(policy.net,adam,buffer,rng,{epochs:2,batchSize:64,learningRate:.0003,...(actorOnly?{valueCoefficient:0}:{})});
  report.rounds.push({rep,round:round+1,episodes,decisions:buffer.length,seconds:(performance.now()-start)/1000,updates:stats.updates,diagnostics:stats.diagnostics});save();console.log(rep,round+1);
 }
 policies.push(policy);fs.writeFileSync(path.join(dir,policy.name+'.json'),JSON.stringify({schema:'banana-hop-ppo-diagnostic-v1',contract:'milk-skills-v5',sourceDigest:JSON.parse(fs.readFileSync(source)).sourceDigest,architecture:policy.net.architecture||policy.architecture,config:{hidden:JSON.parse(fs.readFileSync(source)).config.hidden},sizes:policy.net.sizes,parameters:Array.from(policy.net.parameters),generation:10,runId:policy.name,diagnosticOnly:true}));
}
for(const p of [...policies,{name:'idle'},{name:'visible-rule'}]){
 const rows=Array.from({length:64},(_,i)=>episode(p,specification(i+(pattern==='cross'?1000:0),'test',pattern),{greedy:true}));
 report.local.push({name:p.name,seconds:rows.reduce((n,r)=>n+r.seconds,0)/64,wins:rows.filter(r=>r.success).length,rows});save();console.log(report.local.at(-1).name,report.local.at(-1).wins);
}
for(let i=0;i<8;i++)for(const p of policies){const r=runCase(p,null,{seed:0xf2100000+i,greedy:true});report.transfer.push({name:p.name,seed:i,seconds:r.summary.gameSeconds,success:r.success});save();}
report.transferDifference=crossedBootstrap(policies.slice(1).map(p=>report.transfer.filter(r=>r.name===p.name).map(r=>r.seconds-report.transfer.find(b=>b.name==='before'&&b.seed===r.seed).seconds)));
report.sourceUnchanged=hash()===report.sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();console.log(JSON.stringify({local:report.local.map(({rows,...r})=>r),transfer:policies.map(p=>({name:p.name,seconds:report.transfer.filter(r=>r.name===p.name).reduce((n,r)=>n+r.seconds,0)/8}))}));
