'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs'),{mirrorPolicy}=require('../sim/mirror-policy.cjs'),{bootstrap}=require('../sim/paired-evaluation.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),net=loadPolicy(source).net;
const dir=path.resolve('.training/diagnostics','mirror-eval-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash:hash(),status:'running',rows:[],note:'Frozen left-right joint-policy mixture, greedy conditional decoding; original game and 0.5s controller. Sixteen NEW paired seeds; no training.'};const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(let i=0;i<16;i++)for(const p of [{name:'original',net},{name:'mirror-mixture',net:mirrorPolicy(net)}]){
 const r=runCase(p,null,{seed:0xf4100000+i,greedy:true});report.rows.push({seed:i,name:p.name,seconds:r.summary.gameSeconds,success:r.success,wallSeconds:r.wallSeconds,items:r.items,bySkill:r.diagnostics.bySkill});save();console.log(i,p.name,r.summary.gameSeconds);
}
report.paired=bootstrap(Array.from({length:16},(_,i)=>report.rows.find(r=>r.seed===i&&r.name==='mirror-mixture').seconds-report.rows.find(r=>r.seed===i&&r.name==='original').seconds));report.sourceUnchanged=hash()===report.sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();console.log(report.paired);
