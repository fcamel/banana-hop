'use strict';
// Offline measurements only. Never feed a score or alternate action to the policy.
const {decode,estimate,unit}=require('./visible-baseline.cjs');
function directionProbe(features,choice,context){
 const v=decode(features),p=v.player,[skill,direction]=choice;
 if(![0,3].includes(skill)||p.down>0||p.recoil>0||p.special||p.inv>0)return null;
 const scores=context.parameters[skill].direction.flatMap((allowed,d)=>{
  if(!allowed)return [];const u=unit(d);
  return [{direction:d,risk:estimate(v,{x:u.x*205,y:u.y*205},skill===3&&p.z<=1).risk}];
 });
 const selected=scores.find(s=>s.direction===direction),best=Math.min(...scores.map(s=>s.risk));
 return {selected:selected.risk,best,gap:selected.risk-best,lowerRiskDirections:scores.filter(s=>s.risk<selected.risk-1e-6).map(s=>s.direction),scores};
}
function measure({before,action,result}){
 const after=result.observation,p=before.player,q=after.player,dt=after.time-before.time;
 if(dt<=0)return {excluded:'no-time'};
 if(result.terminated)return {excluded:'terminal'};
 // Exclude mechanisms that intentionally override ordinary locomotion, including
 // their start/end frame. Boundary clamp is legitimate, not a controller fault.
 if(before.special||after.special||action.dash||action.surf||p.down>0||q.down>0||p.recoil>0||q.recoil>0||p.hp!==q.hp)return {excluded:'forced-motion'};
 if(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(q.x),Math.abs(q.y))>1240)return {excluded:'boundary'};
 if(Math.hypot(p.padDriftX||0,p.padDriftY||0)>1e-6)return {excluded:'drift'};
 const n=Math.hypot(action.x||0,action.y||0),den=Math.max(1,n),dx=(action.x||0)/den*205*dt,dy=(action.y||0)/den*205*dt;
 const ax=q.x-p.x,ay=q.y-p.y,error=Math.hypot(ax-dx,ay-dy);
 return {error,expectedDistance:Math.hypot(dx,dy),actualDistance:Math.hypot(ax,ay),jumpRequested:!!action.jump,groundJumpRequested:!!action.jump&&p.z<=1&&p.jumpLock<=0&&!p.milkFuel,jumpRose:!!action.jump&&q.z>p.z};
}
module.exports={directionProbe,measure};
