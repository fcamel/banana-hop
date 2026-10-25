'use strict';
// Static observation probes, never training examples or simulated future labels.
const {encode}=require('./training.cjs');
const {MotionHistory}=require('./motion.cjs');
const {skillContext,createOption,optionControl,skills}=require('./skills.cjs');
const {Random}=require('./ppo.cjs');
const phases={ground:[0,0],rising:[50,190],falling:[50,-190]};
function observation(spec){
 const [z,vz]=phases[spec.phase],angle=spec.bearing*Math.PI/4;
 return {time:spec.time,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z,vz,hp:2,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:0,milkFuel:0,surfStock:0},enemies:[{id:1,type:'slice',hp:1,x:spec.distance*Math.cos(angle),y:spec.distance*Math.sin(angle),z:spec.height||0,stackCount:1,sliceFlight:spec.family==='height'?{}:null}],milkDrops:[],milkBottles:[],spawnWarnings:[],pickups:[],surfPickups:[]};
}
function cases(){
 const out=[];
 for(const time of [5,30,50])for(let bearing=0;bearing<8;bearing++)for(const phase of Object.keys(phases)){
  for(const distance of [60,120,180,240,320,400])out.push({family:'distance',time,bearing,phase,distance,height:0});
  // Height intervention keeps the flight flag and measured velocities constant.
  for(const distance of [120,240])for(const height of [0,32,64])out.push({family:'height',time,bearing,phase,distance,height});
 }
 return out;
}
function input(spec){
 const o=observation(spec),old=structuredClone(o);old.time-=.1;
 if(spec.family==='height')old.enemies[0].x-=20; // Same observed vx=200 across all heights.
 const history=new MotionHistory();history.update(old);history.update(o);
 return {observation:o,features:encode(o,[0,0,0,0],history),context:skillContext(o)};
}
function probe(net,spec){
 const {observation:o,features,context}=input(spec),sample=net.sample(features,new Random(1),true,context),choice=sample.action;
 const masks=[context.skills,context.parameters[choice[0]].direction,context.parameters[choice[0]].target,context.parameters[choice[0]].travel];
 const probabilities=Array.from(net.forward(features,masks,choice[0]).probs[0]);
 const control=optionControl(createOption(choice,o),o),action=control.action||{};
 const n=Math.hypot(action.x||0,action.y||0),theta=spec.bearing*Math.PI/4;
 return {...spec,choice,skill:skills[choice[0]].name,probabilities,requestJump:!!action.jump,canStartJump:o.player.z<=1&&o.player.jumpLock<=0,initialControl:control,towardTarget:n?((action.x||0)*Math.cos(theta)+(action.y||0)*Math.sin(theta))/n:0};
}
module.exports={phases,cases,observation,input,probe};
