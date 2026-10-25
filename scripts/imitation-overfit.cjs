'use strict';
// Supplemental capacity probe; never changes the selected policy or test results.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),v8=require('node:v8'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs');
const {measure,trainEpoch,Adam,Random}=require('../sim/imitation.cjs');
const dir=process.argv[2];if(!dir||process.argv.length!==3)throw Error('Usage: node scripts/imitation-overfit.cjs EXPERIMENT_DIRECTORY');
const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')),source=fs.readFileSync(report.source.file);
if(crypto.createHash('sha256').update(source).digest('hex')!==report.source.sha256)throw Error('Source changed');
const {net}=loadPolicy(report.source.file),sets=v8.deserialize(zlib.gunzipSync(fs.readFileSync(path.join(dir,'demonstrations.v8.gz')))),n=report.config.overfitSamples,rows=Array.from({length:n},(_,i)=>sets.train[Math.floor(i*sets.train.length/n)]),adam=new Adam(net.parameters.length),rng=new Random(101),results=[{epoch:0,...measure(net,rows)}];
for(let epoch=1;epoch<=200;epoch++){trainEpoch(net,adam,rows,rng,report.config);if(epoch%20===0){results.push({epoch,...measure(net,rows)});console.log(epoch,results.at(-1).jointAccuracy);}}
fs.writeFileSync(path.join(dir,'overfit-extended.json'),JSON.stringify({note:'Post-hoc extension of the same 32 training rows; source reset, no validation/test fitting, no checkpoint selection',epochs:200,results},null,2));
