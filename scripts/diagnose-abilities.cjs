'use strict';
const fs=require('node:fs'),path=require('node:path');
const {scenarios}=require('../sim/ability-scenarios.cjs');
const {loadPolicy,runCase}=require('../sim/ability-runner.cjs');
const {verify}=require('../sim/ability-replay.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const args=process.argv.slice(2),checkpoints=[];let split='test',episodes=4,output='.training/diagnostics',replayPath=null;
for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];if(!v)throw Error('Missing argument');if(k==='--checkpoint')checkpoints.push(v);else if(k==='--split')split=v;else if(k==='--episodes')episodes=Number(v);else if(k==='--output')output=v;else if(k==='--replay')replayPath=v;else throw Error(`Unknown flag ${k}`);}
if(replayPath){console.log(JSON.stringify({verified:true,summary:verify(JSON.parse(fs.readFileSync(replayPath,'utf8')))},null,2));process.exit(0);}
if(!Number.isInteger(episodes)||episodes<1||episodes>64)throw Error('Episodes must be 1..64');
const cases=scenarios(split),policies=[{name:'idle'},{name:'visible-skills'},{name:'visible-primitive'},...checkpoints.map(loadPolicy)];
const id=new Date().toISOString().replace(/[:.]/g,'-'),root=path.resolve(output),dir=path.join(root,id),replays=path.join(root,'replays');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(replays,{recursive:true});
function saveReplay(tape,name){const file=path.join(replays,`${id}-${name}.json`),json=JSON.stringify(tape);if(Buffer.byteLength(json)>1000000)return {skipped:'Replay exceeds 1 MB'};fs.writeFileSync(file,json);let list=fs.readdirSync(replays).filter(n=>n.endsWith('.json')).map(n=>({file:path.join(replays,n),time:fs.statSync(path.join(replays,n)).mtimeMs,size:fs.statSync(path.join(replays,n)).size})).sort((a,b)=>a.time-b.time||a.file.localeCompare(b.file));let size=list.reduce((s,f)=>s+f.size,0);while(list.length>100||size>100000000){const oldest=list.shift();fs.unlinkSync(oldest.file);size-=oldest.size;}return {file:path.relative(root,file)};}
const report={schema:1,id,split,sourceDigest,profile:{width:1000,height:650,mobile:false},note:'Read-only diagnostic evaluation. NN weights unchanged; implementation digest is not a resume check. Micro fixtures use real physics and a bounded horizon. Full-game Replay is browser compatible; fixture replay is Node-only. New diagnostic seeds, not original checkpoint scores.',policies:policies.map(({net,...p})=>p),results:[],summary:[]};
for(const [pi,policy]of policies.entries()){
 const specs=[...cases,...Array(episodes).fill(null)],seen=new Set();
 for(let i=0;i<specs.length;i++){
  const spec=specs[i],family=spec?.family??'full',seed=spec?.seed??((split==='test'?0xd2000000:0x22000000)+(i-cases.length)),record=!seen.has(family);seen.add(family);
  const r=runCase(policy,spec,{seed,record});if(r.replay){r.replayFile=saveReplay(r.replay,`${pi}-${r.id}`);delete r.replay;}report.results.push(r);
 }
 for(const family of ['bullets','slices','corner','bottle','full']){const rs=report.results.filter(r=>r.policy===policy.name&&r.family===family),row={policy:policy.name,family,n:rs.length,meanSeconds:rs.reduce((s,r)=>s+r.summary.gameSeconds,0)/rs.length,successRate:rs.filter(r=>r.success).length/rs.length,meanHits:rs.reduce((s,r)=>s+r.diagnostics.damage.length,0)/rs.length,meanMilk:rs.reduce((s,r)=>s+r.items.milkBottles,0)/rs.length};report.summary.push(row);console.log(JSON.stringify(row));}
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
}
fs.writeFileSync(path.join(dir,'summary.md'),`# 能力基準診斷 ${id}\n\n${report.note}\n\n|策略|場景|場數|平均秒數|成功率|平均損血次數|平均牛奶瓶|\n|---|---|---:|---:|---:|---:|---:|\n`+report.summary.map(r=>`|${r.policy}|${r.family}|${r.n}|${r.meanSeconds.toFixed(2)}|${(r.successRate*100).toFixed(0)}%|${r.meanHits.toFixed(2)}|${r.meanMilk.toFixed(2)}|`).join('\n')+'\n');
console.log(`Report: ${path.join(dir,'report.json')}`);
