'use strict';
const {decode,estimate,actionForChoice}=require('./visible-baseline.cjs');
const {skills}=require('./skills.cjs');
// These descriptive measurements never feed back into observations or actions.
function begin(features,choice,time){
 const v=decode(features),target=v.objects.find(o=>o.slot===choice[2]),a=actionForChoice(v,choice);
 return {time,choice:[...choice],skill:skills[choice[0]].name,player:v.player,target:target?{...target,distance:Math.hypot(target.x,target.y)}:null,visibleCounts:Object.fromEntries(['slices','milk','drops','bottles'].map(k=>[k,v.objects.filter(o=>o.kind===k).length])),visible:v.objects,estimatedRisk:estimate(v,{x:a.x*205,y:a.y*205},a.jump),frames:0,inputTravel:0,actualTravel:0,jumpRequests:0,groundJumpRequests:0,hits:0};
}
function frame(d,{before,action,result}){
 const p=before.player,q=result.observation.player,dt=result.observation.time-before.time;if(dt<=0)return;
 d.frames++;d.inputTravel+=Math.hypot(action.x||0,action.y||0)*dt;d.actualTravel+=Math.hypot(q.x-p.x,q.y-p.y);
 if(action.jump){d.jumpRequests++;if(p.z<=1&&p.jumpLock<=0&&p.down<=0&&p.recoil<=0)d.groundJumpRequests++;}
 if(q.hp<p.hp)d.hits++;
 d.end={time:result.observation.time,x:q.x,y:q.y,z:q.z,hp:q.hp};
}
function summarize(rows){
 const skillsOut={};let hits=0,targetedHits=0,airborneTargetHits=0,nearbyThreatHits=0;
 for(const d of rows){const s=skillsOut[d.skill]??={decisions:0,seconds:0,hits:0,targetDistanceSum:0,targetDecisions:0,startedAirborne:0,jumpRequests:0,groundJumpRequests:0,reasons:{}};s.decisions++;s.seconds+=d.frames/60;s.hits+=d.hits;s.startedAirborne+=+(d.player.z>1);s.jumpRequests+=d.jumpRequests;s.groundJumpRequests+=d.groundJumpRequests;s.reasons[d.result?.reason||'unknown']=(s.reasons[d.result?.reason||'unknown']||0)+1;
 if(d.target){s.targetDecisions++;s.targetDistanceSum+=d.target.distance;targetedHits+=d.hits;if(d.target.z>40)airborneTargetHits+=d.hits;}
 hits+=d.hits;if(d.visible.some(o=>['slices','milk','drops'].includes(o.kind)&&Math.hypot(o.x,o.y)<100))nearbyThreatHits+=d.hits;
 }
 for(const s of Object.values(skillsOut)){s.hitsPerSecond=s.seconds?s.hits/s.seconds:0;s.meanTargetDistance=s.targetDecisions?s.targetDistanceSum/s.targetDecisions:null;}
 return {hits,targetedHits,airborneTargetHits,nearbyThreatHits,bySkill:skillsOut,note:'Exposure-normalized associations only. Visible objects are potential threats, not identified damage sources. Risk uses linear motion, not future engine simulation.'};
}
module.exports={begin,frame,summarize};
