'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Worker}=require('node:worker_threads'),{execFileSync}=require('node:child_process');
const {sourceDigest}=require('../sim/environment.cjs'),{contract,featureCount}=require('../sim/training.cjs'),{Network,Adam,Random,optimize}=require('../sim/ppo.cjs');
const {startTimes,createStartBank,validateBank,rolloutJobs}=require('../sim/curriculum.cjs');
const root=path.resolve(__dirname,'..');
const implementationDigest=require('node:crypto').createHash('sha256').update(['sim/curriculum.cjs','sim/training.cjs','sim/ppo.cjs','sim/training-worker.cjs','scripts/train-nn.cjs'].map(name=>name+'\n'+fs.readFileSync(path.join(root,name),'utf8')).join('\n')).digest('hex');
class Pool{
  constructor(count){this.queue=[];this.slots=Array.from({length:count},()=>{const slot={worker:new Worker(path.join(root,'sim/training-worker.cjs')),job:null};slot.worker.on('message',m=>{const job=slot.job;slot.job=null;if(m.error)job.reject(Error(m.error));else job.resolve(m.result);this.pump();});slot.worker.on('error',e=>{if(slot.job){slot.job.reject(e);slot.job=null;}this.failed=e;for(const job of this.queue)job.reject(e);this.queue=[];});return slot;});}
  run(job){if(this.failed)return Promise.reject(this.failed);return new Promise((resolve,reject)=>{this.queue.push({data:job,resolve,reject});this.pump();});}
  pump(){for(const slot of this.slots)if(!slot.job&&this.queue.length){slot.job=this.queue.shift();slot.worker.postMessage(slot.job.data);}}
  async close(){await Promise.all(this.slots.map(s=>s.worker.terminate()));}
}
function atomic(file,data){const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(data));fs.renameSync(temporary,file);}
function options(argv){
  const out={};for(let i=0;i<argv.length;i++){if(argv[i]==='--help'){out.help=true;continue;}if(!/^--[a-z-]+$/.test(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Options require --name value');out[argv[i].slice(2)]=argv[++i];}
  const allowed=new Set(['help','generations','workers','rollout','epochs','batch-size','hidden','seed','learning-rate','run-id','directory','resume','baselines']);for(const key of Object.keys(out))if(!allowed.has(key))throw Error('Unknown option: '+key);
  return out;
}
function numeric(args,key,fallback,min,max,integer=true){const n=Number(args[key]??fallback);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error('Invalid --'+key);return n;}
function checkpoint(net,adam,config,generation,runId,random,stats){return {schema:1,contract,sourceDigest,implementationDigest,config,generation,runId,randomState:random.state,sizes:net.sizes,parameters:Array.from(net.parameters),adam:{t:adam.t,m:Array.from(adam.m),v:Array.from(adam.v)},stats};}
function restore(saved){
  if(saved.schema!==1||saved.contract!==contract||saved.sourceDigest!==sourceDigest||saved.implementationDigest!==implementationDigest)throw Error('Checkpoint needs the same game source and NN contract');
  const cfg=saved.config;if(!cfg||!Number.isInteger(cfg.hidden)||cfg.hidden<4||cfg.hidden>256||saved.sizes?.[0]!==featureCount)throw Error('Invalid checkpoint architecture');
  const net=new Network(featureCount,cfg.hidden),adam=new Adam(net.parameters.length);
  for(const values of [saved.parameters,saved.adam?.m,saved.adam?.v])if(!Array.isArray(values)||values.length!==net.parameters.length||!values.every(Number.isFinite))throw Error('Invalid checkpoint weights/optimizer');
  if(!Number.isInteger(saved.adam.t)||saved.adam.t<0||!Number.isInteger(saved.generation)||saved.generation<1||!Number.isInteger(saved.randomState))throw Error('Invalid checkpoint state');
  net.parameters.set(saved.parameters);adam.m.set(saved.adam.m);adam.v.set(saved.adam.v);adam.t=saved.adam.t;return {net,adam};
}
function trainingSetup(){return {evaluationSeeds:Array.from({length:4},(_,i)=>0xe0000000+i),profiles:[{width:1000,height:650,mobile:false}],rollout:1024,startTimes:[...startTimes]};}
async function main(argv){
  const args=options(argv);if(args.help){console.log('npm run training:nn -- --generations 10 [--workers 2 --rollout 1024 --epochs 4 --run-id name --directory .training]\nResume: --resume .training/models/RUN/latest.json --generations 10\nCPU PPO; no npm/Python ML dependencies. Generation 1 is the untrained NN. Training: equal 0/30/50s starts; evaluation: 0s only.');return;}
  const generations=numeric(args,'generations',10,1,100000),workers=numeric(args,'workers',Math.min(4,os.availableParallelism()),1,16);
  let config,runId,net,adam,random,start=1;
  const directory=path.resolve(args.directory||process.env.BANANA_TRAINING_DIR||path.join(root,'.training'));
  const {evaluationSeeds,profiles,rollout}=trainingSetup();
  if(args.resume){
    const saved=JSON.parse(fs.readFileSync(args.resume,'utf8'));({net,adam}=restore(saved));config=saved.config;runId=saved.runId;start=saved.generation+1;random=new Random(saved.randomState);
    for(const key of ['rollout','epochs','batch-size','hidden','seed','learning-rate','run-id'])if(args[key]!==undefined)throw Error('Resume preserves configuration; omit --'+key);
  }else{
    config={objective:'survival-seconds',contract,implementationDigest,curriculum:{startTimes:[...startTimes],equalDecisionBudgets:true,bankSize:8,generator:'rule-based-authentic-prefix'},visibility:'viewport-projected-anchor',decisionFrames:6,seconds:60,entrance:false,profiles,evaluationPolicy:'stochastic-fixed-stream',evaluationSeeds,hidden:numeric(args,'hidden',32,4,256),seed:numeric(args,'seed',1,0,0xffffffff),rollout:numeric(args,'rollout',rollout,8,16384),epochs:numeric(args,'epochs',4,1,100),batchSize:numeric(args,'batch-size',64,2,4096),learningRate:numeric(args,'learning-rate',.0003,.000001,.1,false),gamma:1,lambda:.95,clip:.2,entropy:.01,valueCoefficient:.5,targetKl:.02};
    runId=args['run-id']||'ppo-milk-'+Date.now();random=new Random(config.seed);net=new Network(featureCount,config.hidden,random);adam=new Adam(net.parameters.length);
  }
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(runId))throw Error('Invalid run-id');
  const folder=path.join(directory,'models',runId);fs.mkdirSync(folder,{recursive:true});
  if(!args.resume&&fs.existsSync(path.join(folder,'latest.json')))throw Error('Run already exists; use --resume or a new run-id');
  const bankFile=path.join(folder,'starts.json');
  let banks;
  if(fs.existsSync(bankFile)){banks=JSON.parse(fs.readFileSync(bankFile,'utf8'));for(const profile of profiles)validateBank(banks.find(b=>JSON.stringify(b.profile)===JSON.stringify(profile)),profile);}
  else{banks=profiles.map(profile=>createStartBank({profile,seed:0x20000000+(config.seed%0x10000000),size:config.curriculum.bankSize}));atomic(bankFile,banks);}
  const pool=new Pool(workers),started=Date.now();let trainedSteps=0,stopping=false;
  const requestStop=()=>{stopping=true;console.log('Stopping after the current generation; checkpoint will be saved.');};process.on('SIGINT',requestStop);process.on('SIGTERM',requestStop);
  try{
    if(start===1&&args.baselines!=='false'){
      const baselines={};for(const policy of ['idle','random','rule']){const results=await Promise.all(evaluationSeeds.map((seed,i)=>pool.run({kind:'baseline',policy,seed,policySeed:0xd0000000+i,profile:profiles[i%profiles.length]})));baselines[policy]=results.map(r=>r.score);console.log(`Baseline ${policy}: ${(baselines[policy].reduce((a,b)=>a+b,0)/evaluationSeeds.length).toFixed(2)}s`);}
      atomic(path.join(folder,'baselines.json'),{sourceDigest,evaluationSeeds,profiles,scores:baselines});
    }
    for(let generation=start;generation<start+generations;generation++){
      const generationStart=performance.now();let rolloutMs=0,updateMs=0;
      let stats=null,training=null;
      if(generation>1){
        // Fixed-size batches independent of worker count; each job owns a VM and
        // uses deterministic generation/job seeds. No per-step process startup.
        const jobs=rolloutJobs({config,random,parameters:net.parameters,banks});
        const results=await Promise.all(jobs.map(j=>pool.run(j)));rolloutMs=performance.now()-generationStart;const updateStart=performance.now();trainedSteps+=results.reduce((s,r)=>s+r.physicsSteps,0);
        training={starts:Object.fromEntries(results.map(r=>[r.startAt,{decisions:r.buffer.length,completedEpisodes:r.episodes}])),timeBuckets:{0:0,30:0,50:0}};for(const r of results)for(const t of startTimes)training.timeBuckets[t]+=r.timeBuckets[t];
        stats=optimize(net,adam,results.flatMap(r=>r.buffer),random,{epochs:config.epochs,batchSize:config.batchSize,learningRate:config.learningRate});updateMs=performance.now()-updateStart;
      }
      const evaluationStart=performance.now();
      const results=await Promise.all(evaluationSeeds.map((seed,i)=>pool.run({kind:'evaluate',seed,policySeed:0xd0000000+i,profile:profiles[i%profiles.length],decisions:601,hidden:config.hidden,parameters:net.parameters})));
      const evaluationMs=performance.now()-evaluationStart,saveStart=performance.now();
      const scores=results.map(r=>r.score),best=results.reduce((a,b)=>a.score>=b.score?a:b),record={runId,name:'蕉片崛起 PPO（桌機・分段訓練）',trainer:'PPO / NN (CPU)',generation,evaluationSeeds,scores,config};
      const recordFile=path.join(folder,'pending-generation.json'),replayFile=path.join(folder,'pending-replay.json');
      atomic(recordFile,record);atomic(replayFile,best.replay);
      const result=JSON.parse(execFileSync('python3',[path.join(root,'scripts/record-generation.py'),recordFile,'--replay',replayFile,'--directory',directory],{encoding:'utf8'}));
      const saved=checkpoint(net,adam,config,generation,runId,random,stats);saved.training=training;saved.evaluation={seeds:evaluationSeeds,scores,profiles};atomic(path.join(folder,'latest.json'),saved);if(result.reason==='baseline')atomic(path.join(folder,'initial.json'),saved);if(result.reason!=='score-only')atomic(path.join(folder,'best.json'),saved);
      fs.unlinkSync(recordFile);fs.unlinkSync(replayFile);
      const mean=scores.reduce((a,b)=>a+b)/scores.length,toSeconds=ms=>Math.round(ms)/1000;
      console.log(JSON.stringify({runId,generation,mean,min:Math.min(...scores),success:scores.filter(n=>n>=60-1e-6).length/scores.length,desktop:mean,archive:result.reason,training,optimizer:stats,timingSeconds:{rollout:toSeconds(rolloutMs),update:toSeconds(updateMs),evaluation:toSeconds(evaluationMs),save:toSeconds(performance.now()-saveStart),total:toSeconds(performance.now()-generationStart)},physicsStepsPerSecond:Math.round(trainedSteps/((Date.now()-started)/1000))}));
      if(stopping)break;
    }
    console.log(`Checkpoint: ${path.join(folder,'latest.json')}\nDashboard: http://127.0.0.1:8893/training/`);
  }finally{process.removeListener('SIGINT',requestStop);process.removeListener('SIGTERM',requestStop);await pool.close();}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={Pool,checkpoint,restore,trainingSetup,main};
