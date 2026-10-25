'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {bootstrap}=require('../sim/paired-evaluation.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/evaluate-frozen-imitation.cjs EXPERIMENT_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(old.status!=='complete'||old.sourceDigest!==sourceDigest||hash(old.source.file)!==old.source.sha256)throw Error('Source or completed experiment mismatch');
const auxiliary=old.config.auxiliaryCoefficient!==undefined,names=auxiliary?['ppo','ppo-aux']:['uniform','stratified'];
const checkpoints=[{name:'before',file:old.source.file},...names.map(name=>({name,file:path.resolve(prior,name+'.json')}))].map(p=>({...p,sha256:hash(p.file)}));
const policies=checkpoints.map(p=>({name:p.name,net:loadPolicy(p.file).net}));
const seeds=Array.from({length:32},(_,i)=>(auxiliary?0xe4000000:0xe0000000)+i);if(seeds.some(s=>old.config.testSeeds.includes(s)))throw Error('Reused prior test seed');
const dir=path.resolve('.training/imitation','frozen-eval-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const report={prior,sourceDigest,checkpoints,seeds,greedy:true,note:'Preselected checkpoints; 32 new paired seeds, no training or checkpoint selection. Original G50 is the reference; comparisons fixed before running.',rows:[],summary:[],paired:[],status:'running'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log('Directory:',dir);
const start=performance.now();
for(const seed of seeds){for(const policy of policies){const r=runCase(policy,null,{seed,greedy:true});delete r.diagnostics.decisions;delete r.diagnostics.responses;report.rows.push(r);save();}console.log('Completed seed',seeds.indexOf(seed)+1,'/32');}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
for(const {name} of policies){const rows=report.rows.filter(r=>r.policy===name);report.summary.push({name,episodes:rows.length,seconds:mean(rows.map(r=>r.summary.gameSeconds)),wins:rows.filter(r=>r.success).length,median:rows.map(r=>r.summary.gameSeconds).sort((a,b)=>a-b).slice(15,17).reduce((a,b)=>a+b)/2,milk:mean(rows.map(r=>r.items.milkBottles)),jetSeconds:mean(rows.map(r=>r.items.milkJetSeconds))});}
for(const [a,b]of [[names[1],names[0]],[names[1],'before'],[names[0],'before']]){const differences=seeds.map(seed=>report.rows.find(r=>r.seed===seed&&r.policy===a).summary.gameSeconds-report.rows.find(r=>r.seed===seed&&r.policy===b).summary.gameSeconds);report.paired.push({a,b,...bootstrap(differences),better:differences.filter(x=>x>1e-8).length,worse:differences.filter(x=>x< -1e-8).length,tied:differences.filter(x=>Math.abs(x)<=1e-8).length});}
if(checkpoints.some(p=>hash(p.file)!==p.sha256))throw Error('Checkpoint changed');report.weightsUnchanged=true;report.wallSeconds=(performance.now()-start)/1000;report.status='complete';save();console.log(JSON.stringify({summary:report.summary,paired:report.paired},null,2));
