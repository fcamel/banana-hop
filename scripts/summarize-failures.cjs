'use strict';
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('../sim/failure-audit.cjs');
const dir=process.argv[2];if(!dir)throw Error('Usage: summarize-failures.cjs DIRECTORY');
const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json'))),out={status:report.status,policies:[]};
for(const policy of ['nn','rule']){
 const episodes=report.episodes.filter(e=>e.policy===policy),all=[],damage=[],directions=Array(9).fill(0);let farStomps=0,stomps=0,airEvades=0,evades=0;
 for(const e of episodes){const t=JSON.parse(fs.readFileSync(path.join(dir,e.trace)));all.push(...t.decisions);
  for(const d of t.decisions){if(d.skill==='stomp'){stomps++;farStomps+=+(d.target?.distance>200);}if(d.skill==='evade'){evades++;airEvades+=+(d.player.z>1);}
   if(['move','evade','jet','ultimate','surf'].includes(d.skill)&&d.player.down<=0&&d.player.recoil<=0&&!d.player.special)directions[d.choice[1]]+=d.frames/60;
  }
  for(const hit of t.damage){const d=t.decisions.find(d=>d.time<hit.time-1e-8&&d.end?.time>=hit.time-1e-8);if(!d)throw Error('Damage outside decision interval');
   damage.push({seed:e.seed,time:hit.time,reason:hit.reason,skill:d.skill,decisionAge:hit.time-d.time,playerHeight:hit.player.z,selectedWhileAirborne:d.player.z>1,target:d.target&&{kind:d.target.kind,distance:d.target.distance,height:d.target.z},visibleCounts:d.visibleCounts,estimatedEta:d.estimatedRisk.eta});
  }
 }
 out.policies.push({policy,episodes:episodes.length,meanSeconds:episodes.reduce((s,e)=>s+e.seconds,0)/episodes.length,wins:episodes.filter(e=>e.seconds>=60).length,summary:summarize(all),directionSeconds:directions,stomps,farStomps,evades,airEvades,damage,damageReasons:damage.reduce((a,e)=>(a[e.reason]=(a[e.reason]||0)+1,a),{}),hitsWithinPointTwoSeconds:damage.filter(e=>e.decisionAge<=.2+1e-8).length});
}
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out.policies.map(({damage,summary,...r})=>({...r,bySkill:summary.bySkill})),null,2));
