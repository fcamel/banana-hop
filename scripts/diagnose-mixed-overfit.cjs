'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {loadPolicy}=require('../sim/ability-runner.cjs');
const {measure,trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const {balancedProbe}=require('../sim/imitation-probe.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const prior=process.argv[2];if(!prior||process.argv.length!==3)throw Error('Usage: node scripts/diagnose-mixed-overfit.cjs DAGGER_DIRECTORY');
const old=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(old.sourceDigest!==sourceDigest||hash(fs.readFileSync(old.source.file))!==old.source.sha256)throw Error('Source mismatch');
const read=p=>v8.deserialize(zlib.gunzipSync(fs.readFileSync(p))),natural=read(path.join(old.prior,'demonstrations.v8.gz')),learner=read(path.join(prior,'learner-labels.v8.gz'));
const rows=balancedProbe([...natural.train,...learner.train]),dir=path.resolve('.training/imitation','mixed-overfit-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});
const report={source:old.source,sourceDigest,prior,purpose:'32-row capacity diagnostic only; no model promotion or gameplay claims',config:{updates:400,batchSize:32,learningRate:.001,shuffleSeeds:[101,102,103]},rows:rows.map(r=>({seed:r.seed,time:r.time,action:r.action})),runs:[],status:'running'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();console.log(dir);
for(const seed of report.config.shuffleSeeds){
 const {net}=loadPolicy(old.source.file),adam=new Adam(net.parameters.length),rng=new Random(seed),run={seed,measurements:[{update:0,...measure(net,rows)}]};report.runs.push(run);const start=performance.now();
 for(let update=1;update<=report.config.updates;update++){trainEpoch(net,adam,rows,rng,report.config);if(update%50===0){const m={update,...measure(net,rows)};run.measurements.push(m);save();console.log(seed,update,m.jointAccuracy,m.loss);}}
 run.seconds=(performance.now()-start)/1000;run.validation={natural:measure(net,natural.validation),learner:measure(net,learner.validation)};save();
}
if(hash(fs.readFileSync(old.source.file))!==old.source.sha256)throw Error('Source changed');report.sourceUnchanged=true;report.status='complete';save();
