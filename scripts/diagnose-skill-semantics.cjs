'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs');
const {cases,probe}=require('../sim/skill-semantic-probes.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash(),{net}=loadPolicy(source);
const dir=path.resolve('.training/diagnostics','skill-semantics-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const rows=cases().map(s=>probe(net,s));
const groups=[];
for(const family of ['distance','height'])for(const phase of ['ground','rising','falling'])for(const value of family==='distance'?[60,120,180,240,320,400]:[0,32,64]){
 const selected=rows.filter(r=>r.family===family&&r.phase===phase&&r[family==='distance'?'distance':'height']===value),n=selected.length;
 groups.push({family,phase,value,n,skills:selected.reduce((a,r)=>(a[r.skill]=(a[r.skill]||0)+1,a),{}),meanStompProbability:selected.reduce((s,r)=>s+r.probabilities[2],0)/n,meanApproachProbability:selected.reduce((s,r)=>s+r.probabilities[1],0)/n,meanTowardTarget:selected.reduce((s,r)=>s+r.towardTarget,0)/n,jumpRequested:selected.filter(r=>r.requestJump).length});
}
const pairs=[];
for(const family of ['distance','height']){
 const low=family==='distance'?60:0,high=family==='distance'?400:64,key=family==='distance'?'distance':'height';
 const a=rows.filter(r=>r.family===family&&r[key]===low);const matches=a.map(r=>[r,rows.find(t=>t.family===family&&t.phase===r.phase&&t.time===r.time&&t.bearing===r.bearing&&t[key]===high&&(family==='distance'||t.distance===r.distance))]);
 pairs.push({family,n:matches.length,changedSkill:matches.filter(([a,b])=>a.skill!==b.skill).length,meanSkillTV:matches.reduce((s,[a,b])=>s+a.probabilities.reduce((v,p,i)=>v+Math.abs(p-b.probabilities[i]),0)/2,0)/matches.length});
}
const report={source,sourceUnchanged:before===hash(),note:'Synthetic visible observations; no future engine rollouts, training, optimal-action labels or performance claims. A stationary isolated enemy may legitimately be avoided under a survival objective.',rows,groups,pairs};
if(!report.sourceUnchanged)throw Error('Source changed');fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(dir);console.log(JSON.stringify({groups,pairs},null,2));
