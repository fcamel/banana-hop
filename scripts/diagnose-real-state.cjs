'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {skillEnvironment}=require('../sim/training.cjs'),{targetSlots}=require('../sim/skills.cjs'),{loadPolicy}=require('../sim/ability-runner.cjs');
const audit=require('../sim/real-state-probes.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash(),net=loadPolicy(source).net;
const traces=path.resolve('.training/diagnostics/failure-audit-2026-10-25T14-28-31-888Z');
const dir=path.resolve('.training/diagnostics','real-state-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash,status:'running',sampling:'First eligible decision at/after 5,12,19,26 seconds in each of nn-0..nn-9. No selection by counterfactual result.',rows:[],pairs:[],selectedPairs:[]};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
for(let i=0;i<10;i++){
 const trace=JSON.parse(fs.readFileSync(path.join(traces,`nn-${i}.trace.json`))),env=skillEnvironment({seed:trace.seed,width:1000,height:650,mobile:false});let next=0;
 for(const d of trace.decisions){
  const o=env.observe();assert.ok(Math.abs(o.time-d.time)<1e-8);
  const selected=targetSlots(o).find(t=>t?.kind==='slice'&&!t.object.hit&&!t.object.down);
  if(o.time>=[5,12,19,26][next]&&o.player.down<=0&&o.player.recoil<=0&&!o.special&&selected){
   const f=env.features(),previous=audit.previousFrom(f),active=env.diagnosticOption(),history=env.motion();
   const rebuilt=audit.features(o,previous,history,active);assert.deepEqual(Array.from(rebuilt),Array.from(f));
   const base=audit.predict(net,o,previous,history,active);assert.deepEqual(base.choice,d.choice);
   const row={episode:i,time:o.time,threshold:[5,12,19,26][next++],targetId:selected.object.id,player:{...o.player},active,base,variants:[]};
   for(const v of audit.variants(o,selected.object.id))row.variants.push({family:v.family,label:v.label,valid:v.valid,...(v.valid?{prediction:audit.predict(net,v.observation,previous,history,active)}:{})});
   for(const family of ['distance','side','height','player-phase']){const vs=row.variants.filter(v=>v.family===family);if(vs.length===2&&vs.every(v=>v.valid))report.pairs.push({episode:i,time:o.time,family,...audit.compare(vs[0].prediction,vs[1].prediction)});}
   const chosen=targetSlots(o)[base.choice[2]];
   if(chosen&&['slice','milk'].includes(chosen.kind)&&chosen.object.id!==selected.object.id){
    row.selectedTargetId=chosen.object.id;row.selectedVariants=[];
    for(const v of audit.variants(o,chosen.object.id))row.selectedVariants.push({family:v.family,label:v.label,valid:v.valid,...(v.valid?{prediction:audit.predict(net,v.observation,previous,history,active)}:{})});
    for(const family of ['distance','side','height']){const vs=row.selectedVariants.filter(v=>v.family===family);if(vs.length===2&&vs.every(v=>v.valid))report.selectedPairs.push({episode:i,time:o.time,family,...audit.compare(vs[0].prediction,vs[1].prediction)});}
   }
   report.rows.push(row);save();
  }
  if(next===4)break;
  assert.deepEqual(env.step(d.choice).option,d.result);
 }
 console.log(i,next);
}
report.sourceUnchanged=sourceHash===hash();assert.ok(report.sourceUnchanged);report.status='complete';
report.summary=['distance','side','height','player-phase'].map(family=>{const rows=report.pairs.filter(p=>p.family===family),n=rows.length;return {family,n,changedSkill:rows.filter(p=>p.changedSkill).length,changedTarget:rows.filter(p=>p.changedTarget).length,changedChoice:rows.filter(p=>p.changedChoice).length,changedControl:rows.filter(p=>p.changedControl).length,meanSkillTV:rows.reduce((s,p)=>s+p.skillTV,0)/n,meanJointTV:rows.reduce((s,p)=>s+p.jointTV,0)/n};});save();console.log(JSON.stringify(report.summary,null,2));
