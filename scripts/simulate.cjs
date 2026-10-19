'use strict';
const fs=require('node:fs'),{performance}=require('node:perf_hooks'),{createEnvironment}=require('../sim/environment.cjs');
const args=process.argv.slice(2),get=(key,fallback)=>{const at=args.indexOf('--'+key);return at<0?fallback:args[at+1];};
try{
  const replayPath=get('replay',null);
  if(replayPath){const tape=JSON.parse(fs.readFileSync(replayPath,'utf8')),env=createEnvironment(),player=env.replayTape(tape);while(!player.step().done){}console.log(JSON.stringify({verified:true,...player.environment.summary()}));}
  else{
    const count=Number(get('episodes',1)),seconds=Number(get('seconds',180)),seed=Number(get('seed',1)),mode=get('mode','milk'),recordPath=get('record',null);
    if(!Number.isInteger(count)||count<1||count>10000||!Number.isFinite(seconds)||seconds<=0||seconds>36000||!Number.isInteger(seed)||seed<0||seed+count-1>0xffffffff)throw Error('Invalid episodes, seconds or seed');
    if(recordPath&&count!==1)throw Error('--record requires one episode');
    const env=createEnvironment({mode,seed,record:!!recordPath}),start=performance.now(),results=[];
    for(let i=0;i<count;i++){
      // Separate environments make episodes independent and safe to distribute
      // across worker processes later; observations/actions are plain data.
      const run=i?createEnvironment({mode,seed:seed+i,record:false}):env;
      while(run.summary().steps<seconds*60&&run.summary().outcome==='running')run.step(run.policy(run.observe()),Math.min(6,Math.ceil(seconds*60)-run.summary().steps));
      results.push({seed:seed+i,...run.summary(),truncated:run.summary().outcome==='running'});if(recordPath)fs.writeFileSync(recordPath,JSON.stringify(run.replay()));
    }
    const wallSeconds=(performance.now()-start)/1000;console.log(JSON.stringify({episodes:count,wallSeconds,simulatedSeconds:results.reduce((n,r)=>n+r.seconds,0),results},null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
