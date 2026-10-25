'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs'),{skillEnvironment}=require('../sim/training.cjs'),{Random}=require('../sim/ppo.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const {mirrorFeatures,mirrorDirection,mirrorContext,mirrorChoice,totalVariation}=require('../sim/mirror-audit.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash(),net=loadPolicy(source).net;
const dir=path.resolve('.training/diagnostics','mirror-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash,status:'running',note:'Read-only mirror predictions on fixed greedy NN trajectories. One eligible state per >=0.5s; no mirrored rollout, future engine information or training.',episodes:[]};const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(let i=0;i<16;i++){
 const seed=0xf3100000+i,env=skillEnvironment({seed,width:1000,height:650,mobile:false}),rng=new Random(seed),rows=[];let last=-1;
 while(env.summary().outcome==='running'){
  const f=env.features(),c=env.context(),a=net.sample(f,rng,true,c);
  if(env.observe().time-last>=.5-1e-8&&f[7]<=0&&f[8]<=0&&!f[13]){
   last=env.observe().time;const mf=mirrorFeatures(f),mc=mirrorContext(c),b=net.sample(mf,rng,true,mc),r=choose(f,c,0).choice,mr=choose(mf,mc,0).choice,heads=[];
   for(const skill of [0,3,6])if(c.skills[skill]){
    const masks=[c.skills,c.parameters[skill].direction,c.parameters[skill].target,c.parameters[skill].travel],mm=[mc.skills,mc.parameters[skill].direction,mc.parameters[skill].target,mc.parameters[skill].travel];
    const p=net.forward(f,masks,skill).probs[1],q=net.forward(mf,mm,skill).probs[1];heads.push({skill,p,q,tv:totalVariation(p,mirrorDirection.map(j=>q[j]))});
   }
   rows.push({time:last,choice:a.action,mirroredChoice:b.action,expected:mirrorChoice(a.action),rule:r,mirroredRule:mr,expectedRule:mirrorChoice(r),value:a.value,mirroredValue:b.value,heads});
  }
  env.step(a.action);
 }
 report.episodes.push({seed,seconds:env.summary().gameSeconds,rows});save();console.log(i,rows.length);
}
report.sourceUnchanged=hash()===sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();
