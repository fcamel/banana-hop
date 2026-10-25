'use strict';
// Controlled observations for diagnosis only. Never enter training or replay.
const {encode}=require('./training.cjs');
const {skillContext,directions}=require('./skills.cjs');
function observation(){return {time:45,viewport:{width:1000,height:650,scale:1},player:{x:0,y:0,z:0,vz:0,hp:2,inv:0,damageInv:0,down:0,recoil:0,jumpLock:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,charge:100,milkFuel:0,surfStock:0},enemies:[],milkBottles:[{id:99,x:0,y:-170}],milkDrops:[],spawnWarnings:[],pickups:[],surfPickups:[]};}
function cases(){
 const result=[];
 for(const side of [-1,1]){const o=observation();o.enemies=Array.from({length:8},(_,i)=>({id:i+1,type:'slice',x:side*(150+(i%2)*45),y:(Math.floor(i/2)-1.5)*55,z:0,stackCount:1}));result.push({name:side<0?'crowd-left':'crowd-right',observation:o});}
 for(const incoming of [true,false]){const o=observation();o.milkDrops=Array.from({length:8},(_,i)=>({id:i+1,x:170+(i%2)*40,y:(Math.floor(i/2)-1.5)*55,z:20,vx:incoming?-200:200,vy:0,hostile:true,life:2}));result.push({name:incoming?'bullets-right-incoming':'bullets-right-outgoing',observation:o});}
 return result;
}
function diagnose(net){return cases().map(c=>{const o=c.observation,f=encode(o),context=skillContext(o);return {name:c.name,skills:[0,3].map(skill=>{const masks=[context.skills,context.parameters[skill].direction,context.parameters[skill].target,context.parameters[skill].travel],raw=net.forward(f,masks,skill),p=raw.probs[1];return {skill:skill===0?'move':'evade',probabilities:p,expectedX:p.reduce((s,v,i)=>s+v*directions[i][0]/(Math.hypot(...directions[i])||1),0),expectedY:p.reduce((s,v,i)=>s+v*directions[i][1]/(Math.hypot(...directions[i])||1),0)};})};});}
module.exports={cases,diagnose};
