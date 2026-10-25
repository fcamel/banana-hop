'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {scenarios}=require('../sim/ability-scenarios.cjs');
const {bootstrap}=require('../sim/paired-evaluation.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const file=process.argv[2];if(!file||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-redecision.cjs CHECKPOINT');
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=hash(),loaded=loadPolicy(file),policy={name:'nn',net:loaded.net};
const dir=path.resolve('.training/diagnostics','redecision-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const seeds=Array.from({length:32},(_,i)=>0xe8000000+i),report={sourceDigest,checkpoint:{file,sha256:before},config:{redecisionFrames:[30,12],greedy:true,seeds,profile:{width:1000,height:650,mobile:false}},note:'Only the option return-to-policy cap changes. Physics and option max duration unchanged. Old policy not retrained; diagnostic cap is not a production change.',rows:[],status:'micro'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)),add=r=>{delete r.diagnostics.decisions;delete r.diagnostics.responses;report.rows.push(r);save();};save();console.log('Directory:',dir);
for(const p of [policy,{name:'visible-skills'}])for(const cap of [30,12]){for(const s of scenarios('test')){const r=runCase(p,s,{seed:s.seed,greedy:true,redecisionFrames:cap,record:s.family==='slices'&&s.pose==='flight'&&s.side===1});if(r.replay){fs.writeFileSync(path.join(dir,`${p.name}-${cap}-flight.json`),JSON.stringify(r.replay));delete r.replay;}add(r);}console.log('Micro',p.name,cap,'complete');}
report.status='full';save();for(const [i,seed]of seeds.entries()){for(const cap of [30,12])add(runCase(policy,null,{seed,greedy:true,redecisionFrames:cap}));if((i+1)%4===0)console.log('Full',i+1,'/32');}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
report.summary=[];for(const name of ['nn','visible-skills'])for(const cap of [30,12])for(const family of ['bullets','slices','corner','bottle','full']){const rows=report.rows.filter(r=>r.policy===name&&r.redecisionFrames===cap&&r.family===family);if(rows.length)report.summary.push({name,cap,family,n:rows.length,successes:rows.filter(r=>r.success).length,seconds:mean(rows.map(r=>r.summary.gameSeconds)),hits:mean(rows.map(r=>r.diagnostics.damage.length)),decisions:mean(rows.map(r=>r.decisions)),milk:mean(rows.map(r=>r.items.milkBottles)),jetSeconds:mean(rows.map(r=>r.items.milkJetSeconds)),wallSeconds:mean(rows.map(r=>r.wallSeconds))});}
const full=report.rows.filter(r=>r.family==='full'),d=seeds.map(seed=>full.find(r=>r.seed===seed&&r.redecisionFrames===12).summary.gameSeconds-full.find(r=>r.seed===seed&&r.redecisionFrames===30).summary.gameSeconds);report.paired={...bootstrap(d),better:d.filter(x=>x>1e-8).length,worse:d.filter(x=>x< -1e-8).length,tied:d.filter(x=>Math.abs(x)<=1e-8).length};
if(hash()!==before)throw Error('Source weights changed');report.weightsUnchanged=true;report.status='complete';save();console.log(JSON.stringify({summary:report.summary,paired:report.paired},null,2));
