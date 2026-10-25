'use strict';
const {input}=require('./skill-semantic-probes.cjs');
const {encode}=require('./training.cjs');
const {skillContext,directions,validateChoice}=require('./skills.cjs');
const {decode,estimate,unit}=require('./visible-baseline.cjs');
const {Random}=require('./ppo.cjs');
// Labels are explicit visible-geometry demonstrations, not optimal-action truth.
function rows(split){
 if(!['train','validation'].includes(split))throw Error('Unknown split');
 const held=split==='validation',out=[];
 for(let bearing=0;bearing<8;bearing++)for(let layout=0;layout<2;layout++)for(const side of [-1,0,1]){
  const theta=bearing*Math.PI/4,forward={x:Math.cos(theta),y:Math.sin(theta)},right={x:-forward.y,y:forward.x},radius=(held?245:210)+layout*25;
  const o=input({family:'distance',phase:'ground',bearing:0,time:held?37:30,distance:60,height:0}).observation;
  o.enemies=[];o.milkBottles=[{id:900,x:forward.x*radius,y:forward.y*radius,age:0}];
  if(side)for(let j=0;j<3;j++){
   const ahead=(held?48:40)+j*24+layout*8,lateral=side*((held?38:30)+layout*6);
   o.enemies.push({id:j+1,type:'slice',hp:1,x:forward.x*ahead+right.x*lateral,y:forward.y*ahead+right.y*lateral,z:0,stackCount:1});
  }
  const features=encode(o),context=skillContext(o),view=decode(features);
  let action=[7,0,129,0],scores=[];
  if(side){
   scores=directions.map((_,d)=>{const u=unit(d);return {direction:d,score:-estimate(view,{x:u.x*205,y:u.y*205},false).risk+u.x*forward.x+u.y*forward.y};}).filter(s=>s.direction>0);
   scores.sort((a,b)=>b.score-a.score||a.direction-b.direction);action=[0,scores[0].direction,0,0];
  }
  validateChoice(action,context);out.push({id:`${split}-${bearing}-${layout}-${side}`,pair:`${split}-${bearing}-${layout}`,bearing,layout,side,features,context,action,scores,observation:o});
 }
 return out;
}
function evaluate(net,data){
 const predictions=data.map(row=>({id:row.id,pair:row.pair,side:row.side,label:row.action,choice:net.sample(row.features,new Random(1),true,row.context).action}));
 const exact=r=>r.choice.every((v,i)=>v===r.label[i]),threat=predictions.filter(r=>r.side),clear=predictions.filter(r=>!r.side),pairs=[];
 for(const key of [...new Set(threat.map(r=>r.pair))]){const a=threat.find(r=>r.pair===key&&r.side===-1),b=threat.find(r=>r.pair===key&&r.side===1);pairs.push({key,labelsDiffer:JSON.stringify(a.label)!==JSON.stringify(b.label),choicesDiffer:JSON.stringify(a.choice)!==JSON.stringify(b.choice),bothCorrect:exact(a)&&exact(b)});}
 return {count:data.length,accuracy:predictions.filter(exact).length/data.length,threatAccuracy:threat.filter(exact).length/threat.length,clearAccuracy:clear.filter(exact).length/clear.length,pairs: pairs.length,pairsBothCorrect:pairs.filter(p=>p.bothCorrect).length,pairsChoicesDiffer:pairs.filter(p=>p.choicesDiffer).length,predictions};
}
module.exports={rows,evaluate};
