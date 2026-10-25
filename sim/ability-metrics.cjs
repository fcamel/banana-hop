'use strict';
const {decode,estimate}=require('./visible-baseline.cjs');
const {skills}=require('./skills.cjs');
// Analysis only: these values are never supplied to a policy or reward function.
class AbilityMetrics{
 constructor(){this.decisions=[];this.bySkill={};this.frames=[];this.inputChanges=[];this.lastInput=null;this.current=null;}
 begin(features,choice,time){
  const view=decode(features),threat=estimate(view),skill=skills[choice[0]].name;
  this.current={time,skill,choice:[...choice],threat,frames:0,hits:0,firstHitAfter:null,controllableSeconds:0,vulnerableSeconds:0,blockedSeconds:0};this.decisions.push(this.current);
 }
 frame({before,action,result}){
  const d=this.current,p=before.player,after=result.observation.player,dt=result.observation.time-before.time;
  if(!d||dt<=0)return;
  const input=[action.x||0,action.y||0,+!!action.jump,+!!action.jet,+!!action.dash,+!!action.surf];
  if(this.lastInput&&(Math.hypot(input[0]-this.lastInput[0],input[1]-this.lastInput[1])>.2||input.slice(2).some((v,i)=>v>this.lastInput[i+2])))this.inputChanges.push(before.time);
  this.lastInput=input;
  if(p.inv<=0&&!before.special)d.vulnerableSeconds+=dt;
  d.frames++;const controllable=p.down<=0&&p.recoil<=0&&!before.special;
  if(controllable)d.controllableSeconds+=dt;
  const wanted=Math.hypot(action.x,action.y)>.1;
  if(controllable&&wanted&&Math.hypot(after.x-p.x,after.y-p.y)<.1&&(Math.abs(p.x)>1200||Math.abs(p.y)>1200))d.blockedSeconds+=dt;
  if(after.hp<p.hp){d.hits++;d.firstHitAfter??=result.observation.time-d.time;this.frames.push({time:result.observation.time,hpLost:p.hp-after.hp,controllableBefore:controllable,player:{x:p.x,y:p.y,z:p.z},decisionAge:result.observation.time-d.time,actions:this.decisions.slice(-3).map(a=>({time:a.time,skill:a.skill,choice:a.choice})),estimatedThreatAtDecision:d.threat});}
 }
 finish(events){
  for(const d of this.decisions){const s=this.bySkill[d.skill]??={seconds:0,decisions:0,hits:0,controllableSeconds:0,vulnerableSeconds:0,blockedSeconds:0};s.seconds+=d.frames/60;s.decisions++;s.hits+=d.hits;s.controllableSeconds+=d.controllableSeconds;s.vulnerableSeconds+=d.vulnerableSeconds;s.blockedSeconds+=d.blockedSeconds;}
  for(const s of Object.values(this.bySkill)){s.hitsPerSecond=s.seconds?s.hits/s.seconds:0;s.hitsPerDecision=s.hits/s.decisions;}
  const responses=[];
  for(let i=0;i<this.decisions.length;i++){const d=this.decisions[i];if(d.threat.eta===null)continue;const next=this.decisions.slice(i+1).find(n=>JSON.stringify(n.choice)!==JSON.stringify(d.choice));responses.push({time:d.time,estimatedImpactIn:d.threat.eta,nextChangedChoiceAfter:next?next.time-d.time:null,firstChangedInputAfter:this.inputChanges.find(t=>t>=d.time-1e-8)===undefined?null:Math.max(0,this.inputChanges.find(t=>t>=d.time-1e-8)-d.time),firstHitAfter:d.firstHitAfter});}
  return {bySkill:this.bySkill,damage:this.frames.map((f,i)=>({...f,reason:events[i]?.reason??null,source:events[i]?.source??null})),responses,decisions:this.decisions,note:'Threat ETA is a visible linear estimate. Changed choice is not proof of recognizing a threat; hit rates are exposure-normalized associations, not causal skill quality.'};
 }
}
module.exports={AbilityMetrics};
