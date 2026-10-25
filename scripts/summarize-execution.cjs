'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {directions}=require('../sim/skills.cjs');
const dir=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
if(report.status!=='complete')throw Error('Incomplete report');
const summary={note:report.note,groups:[]};
for(const policy of ['nn','rule']){
 const rows=report.episodes.filter(e=>e.name.startsWith(policy+'-')),m=rows.map(e=>e.metrics),probes=rows.flatMap(e=>e.probes),sum=k=>m.reduce((s,r)=>s+r[k],0);
 let freeMovingFrames=0,wrongDirectionFrames=0,neutralFreeFrames=0,stomps=[],airStomp=0,airEvade=0;
 for(const row of rows){
  const t=JSON.parse(fs.readFileSync(path.join(report.source,row.name+'.trace.json'))),tape=JSON.parse(fs.readFileSync(path.join(report.source,row.name+'.replay.json')));
  const actions=tape.actions.flatMap(s=>Array.from({length:s.frames},()=>s.action));let frame=0;
  for(const d of t.decisions){
   if(d.skill==='stomp'&&!d.result.continued&&d.player.z<=1&&d.player.down<=0&&d.player.recoil<=0)stomps.push(d);
   if(!d.result.continued&&d.player.z>1){if(d.skill==='stomp')airStomp++;if(d.skill==='evade')airEvade++;}
   for(let i=0;i<d.frames;i++,frame++)if(['move','evade'].includes(d.skill)){
    const [x,y]=actions[frame],n=Math.hypot(x,y);if(!n){neutralFreeFrames++;continue;}
    freeMovingFrames++;const [dx,dy]=directions[d.choice[1]],dn=Math.hypot(dx,dy)||1;
    if(Math.hypot(x/n-dx/dn,y/n-dy/dn)>1e-5)wrongDirectionFrames++;
   }
  }
  assert.equal(frame,actions.length);
 }
 summary.groups.push({policy,episodes:rows.length,eligibleFrames:sum('eligibleFrames'),mismatchedFrames:sum('mismatchedFrames'),maxError:Math.max(...m.map(r=>r.maxError)),groundJumpRequests:sum('groundJumpRequests'),groundJumpRose:sum('groundJumpRose'),airJumpRequests:sum('airJumpRequests'),freeMovingFrames,wrongDirectionFrames,neutralFreeFrames,groundStompStarts:stomps.length,groundStompsOver200:stomps.filter(d=>d.target.distance>200).length,groundStompsOver300:stomps.filter(d=>d.target.distance>300).length,airborneNewStomp:airStomp,airborneNewEvade:airEvade,probes:probes.length,estimatedRiskAbove1:probes.filter(r=>r.selected>1).length,lowerRiskAlternativeGapAbove1:probes.filter(r=>r.gap>1).length,meanEstimatedRisk:probes.reduce((s,r)=>s+r.selected,0)/probes.length,examples:rows.flatMap(r=>r.probes.filter(p=>p.gap>1).slice(0,1).map(p=>({episode:r.name,...p}))).slice(0,3)});
}
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
