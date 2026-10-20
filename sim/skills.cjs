'use strict';
// Parameterized options. Controllers see only the same visible target slots as NN.
const directions=[[0,0],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const itemSkills=Object.freeze([
  {name:'collect_milk',seconds:1.5,itemKind:'bottle'},
  {name:'collect_bunch',seconds:1.5,itemKind:'pickup'},
  {name:'collect_surf',seconds:1.5,itemKind:'surfPickup'}
].map(Object.freeze));
const skills=Object.freeze([
  {name:'move',seconds:.3}, {name:'approach',seconds:.6},
  {name:'stomp',seconds:1.2}, {name:'evade',seconds:.8},
  {name:'ultimate',seconds:1.3}, {name:'surf',seconds:2.5}, {name:'jet',seconds:.3},...itemSkills
]);
const targetGroups=[['slice',64],['milk',64],['bottle',12],['pickup',16],['surfPickup',16]];
const targetCount=1+targetGroups.reduce((n,[,count])=>n+count,0);
const heads=[skills.length,directions.length,targetCount,2];
function inViewport(o,e){
  const x=o.viewport.width/2+e.x-o.player.x,y=o.viewport.height*.52+(e.y-o.player.y)*.72-(e.z||0);
  return x>=0&&x<=o.viewport.width&&y>=0&&y<=o.viewport.height;
}
function visibleSorted(o,list){const p=o.player;return list.filter(e=>inViewport(o,e)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||(a.id||0)-(b.id||0));}
function itemList(o,kind){return ((kind==='bottle'?o.milkBottles:kind==='pickup'?o.pickups:kind==='surfPickup'?o.surfPickups:[])||[]).filter(e=>!e.collected);}
function targetSlots(o){
  const slots=[null];
  for(const [kind,count] of targetGroups){
    const list=visibleSorted(o,['bottle','pickup','surfPickup'].includes(kind)?itemList(o,kind):o.enemies.filter(e=>e.type===kind));
    for(let i=0;i<count;i++)slots.push(list[i]?{kind,object:list[i]}:null);
  }
  return slots;
}
function skillContext(o){
  const slots=targetSlots(o),p=o.player,ready=!o.special&&p.down<=0&&p.recoil<=0;
  const jumpable=ready&&!p.milkFuel&&(p.z>1||p.jumpLock<=0);
  const isEnemy=t=>!!t&&(t.kind==='slice'||t.kind==='milk'),hasEnemy=slots.some(isEnemy);
  const available=[true,ready&&hasEnemy,jumpable&&hasEnemy,jumpable,!o.special&&p.charge>=100,!o.special&&p.surfStock>0,ready&&p.milkFuel>0,...itemSkills.map(s=>ready&&(s.itemKind!=='surfPickup'||p.surfStock<3)&&slots.some(t=>t?.kind===s.itemKind))];
  const onlyZero=n=>Array.from({length:n},(_,i)=>i===0),anyDirection=directions.map(()=>true),moving=directions.map((_,i)=>i>0);
  return {skills:available,parameters:skills.map((_,i)=>({
    direction:i===1||i===2||skills[i].itemKind?onlyZero(directions.length):i>=3&&i<=5?moving:anyDirection,
    target:skills[i].itemKind?slots.map(t=>t?.kind===skills[i].itemKind):i===1||i===2?slots.map(isEnemy):onlyZero(targetCount),
    travel:skills[i].itemKind?[true,!p.milkFuel&&(p.z>1||p.jumpLock<=0)]:onlyZero(2)
  }))};
}
function validateChoice(choice,context){
  if(!Array.isArray(choice)||![3,4].includes(choice.length)||choice.some((v,i)=>!Number.isInteger(v)||v<0||v>=heads[i]))throw Error('Invalid skill action');
  const [skill,direction,target,travel=0]=choice,parameters=context.parameters[skill];
  if(!context.skills[skill]||!parameters.direction[direction]||!parameters.target[target]||!parameters.travel[travel])throw Error('Unavailable skill or parameter');
}
function createOption(choice,o){
  validateChoice(choice,skillContext(o));
  const [skill,direction,target,travel=0]=choice,selected=targetSlots(o)[target];
  return {skill,direction,travel,target:selected?{kind:selected.kind,id:selected.object.id,x:selected.object.x,y:selected.object.y}:null,frames:0,airborne:o.player.z>1,triggered:false,specialSeen:false,startHp:o.player.hp};
}
function currentTarget(option,o){
  if(!option.target)return null;const saved=option.target;
  return targetSlots(o).find(t=>t&&t.kind===saved.kind&&(saved.id!==undefined?t.object.id===saved.id:t.object.x===saved.x&&t.object.y===saved.y))?.object||null;
}
function optionControl(option,o){
  const p=o.player,t=currentTarget(option,o),collecting=!!skills[option.skill].itemKind,targeted=option.skill===1||option.skill===2||collecting;
  if(targeted&&!t)return {done:true,reason:'target-lost'};
  const emergencyStart=(option.skill===4||option.skill===5)&&!option.triggered;
  if(p.hp<option.startHp||((p.down>0||p.recoil>0)&&!emergencyStart))return {done:true,reason:'interrupted'};
  let [x,y]=directions[option.direction],jump=false,dash=false,surf=false,jet=false;
  if(t){const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);x=d>1?dx/d:0;y=d>1?dy/d:0;
    if(collecting){
      if(option.travel===1&&!option.triggered){jump=p.z<=1;option.triggered=true;}
      if(d<=20*o.viewport.scale){x=0;y=0;}
    }
    if(option.skill===1&&d<=20*o.viewport.scale)return {done:true,reason:'arrived'};
    if(option.skill===2){
      if(p.z>1)option.airborne=true;
      if(option.airborne&&p.z<=1)return {done:true,reason:'landed'};
      // A selected stomp immediately requests a normal jump and steering.
      // The policy owns timing/target choice; no distance wait or height guard.
      jump=!option.triggered&&p.z<=1;option.triggered=true;
    }
  }
  if(option.skill===3){if(p.z>1)option.airborne=true;if(option.airborne&&p.z<=1)return {done:true,reason:'landed'};jump=!option.triggered;option.triggered=true;}
  if(option.skill===4||option.skill===5){
    if(o.special)option.specialSeen=true;
    if(option.specialSeen&&!o.special)return {done:true,reason:'finished'};
    // Simulation applies the requested direction before triggering the skill.
    if(!option.triggered){dash=option.skill===4;surf=option.skill===5;option.triggered=true;}
  }
  if(option.skill===6){if(!p.milkFuel)return {done:true,reason:'empty'};jet=true;}
  return {done:false,action:{x,y,jump,jet,dash,surf}};
}
module.exports={itemSkills,itemList,skills,directions,targetGroups,targetCount,heads,inViewport,visibleSorted,targetSlots,skillContext,validateChoice,createOption,currentTarget,optionControl};
