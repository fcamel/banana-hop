'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {skillEnvironment}=require('../sim/training.cjs');
const {createEnvironment}=require('../sim/environment.cjs');
const {measure,directionProbe}=require('../sim/execution-audit.cjs');
const source=path.resolve('.training/diagnostics/failure-audit-2026-10-25T14-28-31-888Z');
const dir=path.resolve('.training/diagnostics','execution-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,status:'running',episodes:[],note:'Reexecute all 32 prior traces unchanged. No alternate future rollouts, training, or policy modification. Risk rankings are visible linear estimates, not labels of optimal actions.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
for(let seed=0;seed<16;seed++)for(const policy of ['nn','rule']){
 const name=policy+'-'+seed,old=JSON.parse(fs.readFileSync(path.join(source,name+'.trace.json'))),tape=JSON.parse(fs.readFileSync(path.join(source,name+'.replay.json')));
 const metrics={eligibleFrames:0,mismatchedFrames:0,maxError:0,excluded:{},groundJumpRequests:0,groundJumpRose:0,airJumpRequests:0};
 const env=skillEnvironment({seed:old.seed,width:1000,height:650,mobile:false,record:true,onPhysicsStep:f=>{
  const m=measure(f);if(m.excluded){metrics.excluded[m.excluded]=(metrics.excluded[m.excluded]||0)+1;return;}
  metrics.eligibleFrames++;metrics.maxError=Math.max(metrics.maxError,m.error);if(m.error>.001)metrics.mismatchedFrames++;
  if(m.groundJumpRequested){metrics.groundJumpRequests++;if(m.jumpRose)metrics.groundJumpRose++;}
  else if(m.jumpRequested&&f.before.player.z>1)metrics.airJumpRequests++;
 }});
 const probes=[];
 for(const d of old.decisions){
  assert.ok(Math.abs(env.observe().time-d.time)<1e-8);
  const probe=[0,3].includes(d.choice[0])?directionProbe(env.features(),d.choice,env.context()):null;
  if(probe)probes.push({time:d.time,skill:d.skill,direction:d.choice[1],hits:d.hits,...probe});
  const result=env.step(d.choice);assert.deepEqual(result.option,d.result);
  const p=env.observe().player;for(const k of ['x','y','z','hp'])assert.ok(Math.abs(p[k]-d.end[k])<1e-5,`${name} ${d.time} ${k}`);
 }
 assert.equal(env.replay().finalDigest,tape.finalDigest);createEnvironment().restoreTape(env.replay());
 report.episodes.push({name,seconds:env.summary().gameSeconds,metrics,probes,replayVerified:true});save();console.log(name,metrics.mismatchedFrames,probes.length);
}
report.status='complete';save();
for(const policy of ['nn','rule']){
 const rows=report.episodes.filter(e=>e.name.startsWith(policy+'-')),m=rows.map(e=>e.metrics),p=rows.flatMap(e=>e.probes);
 const sum=k=>m.reduce((s,r)=>s+r[k],0),worse=p.filter(r=>r.gap>1),high=p.filter(r=>r.selected>1);
 console.log(JSON.stringify({policy,eligibleFrames:sum('eligibleFrames'),mismatchedFrames:sum('mismatchedFrames'),maxError:Math.max(...m.map(r=>r.maxError)),groundJumpRequests:sum('groundJumpRequests'),groundJumpRose:sum('groundJumpRose'),airJumpRequests:sum('airJumpRequests'),probes:p.length,estimatedRiskAbove1:high.length,lowerRiskAlternativeGapAbove1:worse.length,selectedRiskMean:p.reduce((s,r)=>s+r.selected,0)/p.length,examples:worse.slice(0,3)},null,2));
}
