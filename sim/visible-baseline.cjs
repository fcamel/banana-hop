'use strict';
// The policy accepts ONLY the serialized NN feature contract and its legal masks.
// It cannot access an environment, enemy trajectory endpoints, RNG or offscreen actors.
const {groups,featureCount}=require('./training.cjs');
const {directions}=require('./skills.cjs');
function decode(features){
 if(features.length!==featureCount||!Array.from(features).every(Number.isFinite))throw Error('Invalid visible features');
 const f=features,objects=[];let offset=32,slot=1;
 for(const [kind,count,width] of groups){const targetable=!['drops','warnings'].includes(kind);
  for(let i=0;i<count;i++){const x=f.slice(offset,offset+width);if(x[0]){
   const o={kind,slot:targetable?slot+i:null,x:x[1]*1250,y:x[2]*1250,z:0,vx:0,vy:0,vz:0,valid:false};
   if(kind==='slices')Object.assign(o,{z:x[3]*200,stack:x[4]*3,disabled:x[5]>0||x[6]>0,hop:!!x[7],flight:!!x[8],chargeSeconds:x[10]*3,vx:x[11]*500,vy:x[12]*500,vz:x[14]*400,valid:!!x[16],charging:!!x[17]});
   if(kind==='milk')Object.assign(o,{z:x[3]*200,vz:x[10]*400,valid:!!x[12]});
   if(kind==='drops')Object.assign(o,{z:x[3]*200,vx:x[4]*500,vy:x[5]*500,valid:true,life:x[7]});
   objects.push(o);
  }offset+=width;}if(targetable)slot+=count;
 }
 return {player:{x:f[0]*1250,y:f[1]*1250,z:f[2]*200,vz:f[3]*400,hp:f[4]*5,inv:f[5]*2.5,down:f[7],recoil:f[8],jumpLock:f[9],charge:f[10]*100,fuel:f[11]*5,surf:f[12]*3,special:!!f[13]},time:60-f[15]*60,scale:f[18],objects};
}
const unit=d=>{const [x,y]=directions[d],n=Math.hypot(x,y)||1;return {x:x/n,y:y/n};};
function threats(view){return view.objects.filter(o=>['slices','milk','drops'].includes(o.kind)&&!o.disabled);}
// Approximate kinematics, not a call to actual engine future simulation.
function estimate(view,velocity={x:0,y:0},jump=false){
 const p=view.player;let risk=0,eta=null,nearest=null;
 for(const o of threats(view)){
  const d=Math.hypot(o.x,o.y);if(!nearest||d<nearest.distance)nearest={kind:o.kind,distance:d,height:o.z,velocityKnown:o.valid};
  for(const t of [.1,.2,.3,.4,.5,.6]){
   if(o.kind==='drops'&&o.life<t)continue;
   const z=Math.max(0,p.z+(jump&&p.z<=1?350:p.vz)*t-415*t*t),oz=Math.max(0,o.z+o.vz*t);
   if(o.kind==='drops'?z>=48:oz-z < -14*view.scale||oz-z>80*view.scale)continue;
   const gap=Math.hypot(o.x+(o.vx-velocity.x)*t,o.y+(o.vy-velocity.y)*t),r=(o.kind==='drops'?23:29)*view.scale;
   if(gap<r+8){if(eta===null||t<eta)eta=t;risk+=Math.max(0,1-p.inv/(t+.001))*12/(.2+t);}
   risk+=Math.max(0,(r+65-gap)/(r+65))*.35;
  }
 }
 return {risk,eta,nearest,method:'visible-linear-motion-estimate-not-collision-truth'};
}
function actionForChoice(view,choice){
 const [skill,direction,target,travel=0]=choice;let v=unit(direction);
 if([1,2,7,8,9].includes(skill)){const o=view.objects.find(o=>o.slot===target);const n=o?Math.hypot(o.x,o.y):0;v=n>20*view.scale?{x:o.x/n,y:o.y/n}:{x:0,y:0};}
 return {...v,jump:(skill===2||skill===3||skill>=7&&travel===1)&&view.player.z<=1,jet:skill===6,dash:skill===4,surf:skill===5};
}
function choose(features,context,previousDirection=0){
 const view=decode(features),p=view.player,candidates=[];
 function add(a){const [s,d,t,v]=a,m=context.parameters[s];if(context.skills[s]&&m.direction[d]&&m.target[t]&&m.travel[v])candidates.push(a);}
 for(const skill of [0,3,4,5,6])for(let d=0;d<9;d++)add([skill,d,0,0]);
 for(const kind of ['bottles','pickups','surfPickups','slices','milk']){
  const skill={bottles:7,pickups:8,surfPickups:9,slices:2,milk:2}[kind];
  for(const o of view.objects.filter(o=>o.kind===kind).slice(0,3)){
   if(skill===2&&(Math.hypot(o.x,o.y)>140||o.z>40))continue;
   for(const travel of [0,1])add([skill,0,o.slot,travel]);
  }
 }
 let best=null;
 for(const choice of candidates){
  const a=actionForChoice(view,choice),velocity={x:a.x*205,y:a.y*205},danger=estimate(view,velocity,a.jump);
  let score=-danger.risk;
  for(const t of [.2,.6]){const x=p.x+velocity.x*t,y=p.y+velocity.y*t;score-=Math.max(0,Math.abs(x)-1220)/10+Math.max(0,Math.abs(y)-1220)/10;}
  score+=(a.x||a.y)?.05:0;score+=choice[1]===previousDirection?.04:0;
  const target=view.objects.find(o=>o.slot===choice[2]);
  if(target){score+=choice[0]>=7?1.2:.25;if(choice[0]===7&&p.fuel>4)score-=1;}
  else{const bottle=view.objects.find(o=>o.kind==='bottles');if(bottle&&p.fuel<4){const n=Math.hypot(bottle.x,bottle.y)||1;score+=(a.x*bottle.x+a.y*bottle.y)/n*.5;}}
  if(a.jump)score-=.08;
  if(a.jet)score+=danger.risk>1?1:-.4;
  if(a.dash||a.surf){score=-estimate(view,velocity,false).risk*.02-2;}
  if(!best||score>best.score+1e-9)best={choice,score,action:a};
 }
 if(!best)throw Error('No legal visible baseline action');return best;
}
module.exports={decode,estimate,choose,actionForChoice,unit};
