'use strict';
// Real game evaluation to verify the dashboard pipeline; this does not train a NN.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createEnvironment}=require('../sim/environment.cjs');
const args=process.argv.slice(2),get=(key,fallback)=>{const at=args.indexOf('--'+key);return at<0?fallback:args[at+1];};
let directory;
try{
  const seed=Number(get('seed',7)),seconds=Number(get('seconds',60)),runId=get('run-id','rule-baseline-'+Date.now());
  if(!Number.isFinite(seconds)||seconds<=0||seconds>60)throw Error('seconds must be in (0,60]');
  const env=createEnvironment({mode:'milk',seed,record:true,entrance:false,survivalOnly:true});
  while(env.summary().steps<Math.round(seconds*60)&&env.summary().outcome==='running')env.step(env.policy(env.observe()),Math.min(6,Math.round(seconds*60)-env.summary().steps));
  const tape=env.replay(),record={runId,name:'規則 AI 基準（非 NN）',trainer:'rule-based',generation:1,scores:[tape.result.gameSeconds],evaluationSeeds:[seed],config:{mode:'milk',seconds,width:1000,height:650,mobile:false,entrance:false,survivalOnly:true}};
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'banana-baseline-'));const recordPath=path.join(directory,'generation.json'),replayPath=path.join(directory,'replay.json');
  fs.writeFileSync(recordPath,JSON.stringify(record));fs.writeFileSync(replayPath,JSON.stringify(tape));
  process.stdout.write(execFileSync('python3',['scripts/record-generation.py',recordPath,'--replay',replayPath],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}));
  console.log('Recorded a rule-based baseline, not NN training. Open http://127.0.0.1:8893/training/');
}catch(error){console.error(error.message);process.exitCode=1;}finally{if(directory)fs.rmSync(directory,{recursive:true,force:true});}
