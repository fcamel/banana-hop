'use strict';
const {decode,choose:original,actionForChoice}=require('./visible-baseline.cjs');
// Public movement constants; analytic visible-state estimate only, never engine stepping.
function jetPose(view,t){const p=view.player,s=view.scale,on=Math.min(.3,Math.max(0,p.fuel)*1.5/5),u=Math.min(t,on),cap=108*s;if(on<=0)return {z:Math.max(0,p.z+p.vz*t-415*t*t),v:p.vz-830*t,on};let z,v;
 if(p.z<=cap){z=Math.min(cap,p.z+300*s*u);v=z<cap?300*s:0;}else{v=Math.max(-160*s,p.vz-830*u);z=Math.max(cap,p.z+(p.vz+v)*u/2);if(z===cap)v=0;}
 if(t>on){const dt=t-on;z=Math.max(0,z+v*dt-415*dt*dt);v=z>0?v-830*dt:0;}return {z,v,on};}
function jetRisk(view,velocity,flight=true,hardOnly=false){const p=view.player;let risk=0;for(const o of view.objects.filter(o=>['slices','milk','drops'].includes(o.kind)&&!o.disabled))for(const t of [.1,.2,.3,.4,.5,.6]){
 if(o.kind==='drops'&&o.life<t)continue;const z=flight?jetPose(view,t).z:Math.max(0,p.z+p.vz*t-415*t*t),oz=Math.max(0,o.z+o.vz*t);if(o.kind==='drops'?z>=48:oz-z < -14*view.scale||oz-z>80*view.scale)continue;
 const gap=Math.hypot(o.x+(o.vx-velocity.x)*t,o.y+(o.vy-velocity.y)*t),r=(o.kind==='drops'?23:29)*view.scale;
 if(gap<r+8)risk+=Math.max(0,1-p.inv/(t+.001))*12/(.2+t);if(!hardOnly)risk+=Math.max(0,(r+65-gap)/(r+65))*.35;
 }return risk;}
function scoreJet(features,context,direction,previous=0){const view=decode(features),moveContext={...context,skills:context.skills.map((on,i)=>on&&i===0),parameters:context.parameters.map((p,i)=>i!==0?p:{...p,direction:p.direction.map((on,d)=>on&&d===direction)})},move=original(features,moveContext,previous),choice=[6,direction,0,0],action=actionForChoice(view,choice),velocity={x:action.x*205,y:action.y*205},walkRisk=jetRisk(view,velocity,false,true),risk=jetRisk(view,velocity,true,true),on=jetPose(view,0).on,cost=.2*on/.3+.1*on/Math.max(.001,view.player.fuel*1.5/5);
 return {choice,action,score:move.score+walkRisk-risk-cost,walkRisk,risk,cost};}
function choose(features,context,previous=0){if(!context.skills[6])return original(features,context,previous);const noJet={...context,skills:context.skills.map((on,i)=>on&&i!==6)};let best=original(features,noJet,previous);for(let d=0;d<context.parameters[6].direction.length;d++)if(context.parameters[6].direction[d]&&context.parameters[0].direction[d]){const c=scoreJet(features,context,d,previous);if(c.score>best.score+1e-9)best=c;}return best;}
module.exports={choose,jetPose,jetRisk,scoreJet};
