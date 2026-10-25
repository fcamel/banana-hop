'use strict';
const {encode}=require('./training.cjs');
const {skillContext,targetSlots,currentTarget,createOption,optionControl,skills,inViewport}=require('./skills.cjs');
const {Random}=require('./ppo.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function previousFrom(f){return [f[27]*8,f[28],f[29],f[30]];}
function features(o,previous,history,active){return encode(o,previous,history,active?{...active,target:currentTarget(active,o)||null}:null);}
const identity=t=>t?`${t.kind}:${t.object.id}`:'none';
function predict(net,o,previous,history,active){
 const f=features(o,previous,history,active),context=skillContext(o),slots=targetSlots(o),sample=net.sample(f,new Random(1),true,context),choice=sample.action,joint={};
 const heads=[];
 for(let s=0;s<skills.length;s++)if(context.skills[s]){
  const p=context.parameters[s],masks=[context.skills,p.direction,p.target,p.travel],probs=net.forward(f,masks,s).probs;
  heads.push({skill:s,probabilities:probs.map(a=>Array.from(a))});
  for(let d=0;d<p.direction.length;d++)if(p.direction[d])for(let t=0;t<p.target.length;t++)if(p.target[t])for(let v=0;v<p.travel.length;v++)if(p.travel[v])joint[`${s}|${d}|${identity(slots[t])}|${v}`]=sample.probs[0][s]*probs[1][d]*probs[2][t]*probs[3][v];
 }
 const candidate=createOption(choice,o),same=active&&active.skill===candidate.skill&&active.direction===candidate.direction&&active.travel===candidate.travel&&active.target?.kind===candidate.target?.kind&&(active.target?.id!==undefined?active.target.id===candidate.target?.id:JSON.stringify(active.target)===JSON.stringify(candidate.target));
 const control=optionControl(clone(same?active:candidate),o);
 return {choice,skill:skills[choice[0]].name,target:identity(slots[choice[2]]),skillProbabilities:Array.from(sample.probs[0]),heads,targetSlotIdentities:slots.map(identity),joint,continued:!!same,control};
}
function variants(o,id){
 const target=o.enemies.find(e=>e.id===id),p=o.player,dx=target.x-p.x,dy=target.y-p.y,out=[];
 const add=(family,label,edit)=>{const changed=clone(o),e=changed.enemies.find(e=>e.id===id);edit(changed,e);
  const valid=inViewport(changed,e)&&Math.abs(e.x)<=1250&&Math.abs(e.y)<=1250;
  out.push({family,label,valid,observation:changed});};
 for(const factor of [.5,1.5])add('distance',String(factor),(v,e)=>{e.x=p.x+dx*factor;e.y=p.y+dy*factor;});
 for(const sign of [-1,1])add('side',sign<0?'left':'right',(v,e)=>{e.x=p.x+sign*Math.max(60,Math.abs(dx));});
 for(const height of [0,64])add('height',String(height),(v,e)=>{e.z=height;});
 // Preserve actual airborne height; do not invent a jump for grounded/jet states.
 if(p.z>1&&!p.milkFuel)for(const sign of [1,-1])add('player-phase',sign>0?'rising':'falling',v=>{v.player.vz=sign*190;});
 return out;
}
function tv(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].reduce((s,k)=>s+Math.abs((a[k]||0)-(b[k]||0)),0)/2;}
function compare(a,b){const aa=a.control.action||{},bb=b.control.action||{};return {changedSkill:a.choice[0]!==b.choice[0],changedTarget:a.target!==b.target,changedChoice:a.choice[0]!==b.choice[0]||a.choice[1]!==b.choice[1]||a.choice[3]!==b.choice[3]||a.target!==b.target,skillTV:tv(a.skillProbabilities,b.skillProbabilities),jointTV:tv(a.joint,b.joint),changedControl:Math.hypot((aa.x||0)-(bb.x||0),(aa.y||0)-(bb.y||0))>1e-6||['jump','dash','surf','jet'].some(k=>!!aa[k]!==!!bb[k])||a.control.done!==b.control.done};}
module.exports={previousFrom,features,identity,predict,variants,compare,tv};
