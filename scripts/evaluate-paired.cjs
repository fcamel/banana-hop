'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {summarize,paired}=require('../sim/paired-evaluation.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const files=process.argv.slice(2);if(!files.length)throw Error('Usage: node scripts/evaluate-paired.cjs CHECKPOINT...');
const policies=files.map(loadPolicy),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),before=files.map(hash);
if(new Set(policies.map(p=>p.name)).size!==policies.length)throw Error('Checkpoint policy names must be unique');
const dir=path.resolve('.training/diagnostics','paired-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const seeds=Array.from({length:16},(_,i)=>0xd3000000+i),policySeeds=[0xb4000000,0xb5000000];
const report={sourceDigest,seeds,policySeeds,checkpoints:files.map((f,i)=>({file:f,sha256:before[i]})),rows:[],summary:[],paired:[],note:'16 held-out game seeds; two sampled policy seeds per game vs one greedy. Bootstrap resamples game-seed clusters, not individual repeats. Fixed weights, no optimizer, no checkpoint selection.'};
function persist(){report.summary=summarize(report.rows);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));}
for(const policy of [{name:'visible-skills'},...policies]){
 const modes=policy.net?[{greedy:false,repeat:0},{greedy:false,repeat:1},{greedy:true,repeat:0}]:[{greedy:false,repeat:0}];
 for(const mode of modes){for(let i=0;i<seeds.length;i++){
  const r=runCase(policy,null,{seed:seeds[i],policySeed:policySeeds[mode.repeat]+i,greedy:mode.greedy});
  delete r.diagnostics.decisions;delete r.diagnostics.responses;
  report.rows.push({...r,policySeed:policy.net?r.policySeed:null,hits:r.diagnostics.damage.length});
  if((i+1)%4===0){persist();console.log(`${policy.name} ${policy.net?(mode.greedy?'greedy':'sample-'+mode.repeat):'rule'}: ${i+1}/16`);}
 }}
 if(policy.net)report.paired.push({policy:policy.name,greedyMinusSample:paired(report.rows,policy.name)});
 persist();
}
if(files.some((f,i)=>hash(f)!==before[i]))throw Error('Checkpoint modified during evaluation');report.weightsUnchanged=true;persist();console.log(JSON.stringify({summary:report.summary,paired:report.paired,report:path.join(dir,'report.json')},null,2));
