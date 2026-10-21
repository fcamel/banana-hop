'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Worker}=require('node:worker_threads'),{execFileSync}=require('node:child_process');
const {sourceDigest}=require('../sim/environment.cjs'),{contract,featureCount}=require('../sim/training.cjs'),{Network,Adam,Random,optimize}=require('../sim/ppo.cjs');
const {startTimes,stageShares,weightRollouts,createStartBank,validateBank,rolloutJobs,materialize,breakthroughStarts}=require('../sim/curriculum.cjs');
const {skills,heads}=require('../sim/skills.cjs');
const root=path.resolve(__dirname,'..');
const implementationDigest=require('node:crypto').createHash('sha256').update(['sim/environment.cjs','sim/item-metrics.cjs','sim/snapshot.cjs','sim/curriculum.cjs','sim/skills.cjs','sim/motion.cjs','sim/telegraph.cjs','sim/training.cjs','sim/ppo.cjs','sim/training-worker.cjs','scripts/train-nn.cjs'].map(name=>name+'\n'+fs.readFileSync(path.join(root,name),'utf8')).join('\n')).digest('hex');
class Pool{
  constructor(count){this.queue=[];this.slots=Array.from({length:count},()=>{const slot={worker:new Worker(path.join(root,'sim/training-worker.cjs')),job:null};slot.worker.on('message',m=>{const job=slot.job;slot.job=null;if(m.error)job.reject(Error(m.error));else job.resolve(m.result);this.pump();});slot.worker.on('error',e=>{if(slot.job){slot.job.reject(e);slot.job=null;}this.failed=e;for(const job of this.queue)job.reject(e);this.queue=[];});return slot;});}
  run(job){if(this.failed)return Promise.reject(this.failed);return new Promise((resolve,reject)=>{this.queue.push({data:job,resolve,reject});this.pump();});}
  pump(){for(const slot of this.slots)if(!slot.job&&this.queue.length){slot.job=this.queue.shift();slot.worker.postMessage(slot.job.data);}}
  async close(){await Promise.all(this.slots.map(s=>s.worker.terminate()));}
}
function atomic(file,data){const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(data));fs.renameSync(temporary,file);}
function options(argv){
  const out={};for(let i=0;i<argv.length;i++){if(argv[i]==='--help'){out.help=true;continue;}if(!/^--[a-z-]+$/.test(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Options require --name value');out[argv[i].slice(2)]=argv[++i];}
  const allowed=new Set(['help','generations','workers','rollout','epochs','batch-size','hidden','seed','learning-rate','run-id','directory','resume','baselines','warm-start','curriculum-replay']);for(const key of Object.keys(out))if(!allowed.has(key))throw Error('Unknown option: '+key);
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
function trainingSetup(){return {evaluationSeeds:Array.from({length:4},(_,i)=>0xf0000000+i),profiles:[{width:1000,height:650,mobile:false}],rollout:1024,startTimes:[...startTimes]};}
async function main(argv){
  const args=options(argv);if(args.help){console.log('npm run training:nn -- --generations 10 [--workers 2 --rollout 1024 --epochs 4 --run-id name --directory .training]\nResume: --resume .training/models/RUN/latest.json --generations 10\nCPU PPO; no npm/Python ML dependencies. Generation 1 evaluates initial weights (or --warm-start PATH). New runs require --curriculum-replay PATH. Parameterized skills; rollout counts skill decisions. Training: opening/30s/breakthrough starts weighted 35/35/30%, complete episodes with Monte Carlo returns; --rollout sets one third of the total minimum budget; evaluation: 0s only.');return;}
  const generations=numeric(args,'generations',10,1,100000),workers=numeric(args,'workers',Math.min(4,os.availableParallelism()),1,16);
  let config,runId,net,adam,random,start=1;
  const directory=path.resolve(args.directory||process.env.BANANA_TRAINING_DIR||path.join(root,'.training'));
  const {evaluationSeeds,profiles,rollout}=trainingSetup();
  if(args.resume){
    if(args['warm-start']||args['curriculum-replay'])throw Error('Resume preserves model and curriculum');
    const saved=JSON.parse(fs.readFileSync(args.resume,'utf8'));({net,adam}=restore(saved));config=saved.config;runId=saved.runId;start=saved.generation+1;random=new Random(saved.randomState);
    for(const key of ['rollout','epochs','batch-size','hidden','seed','learning-rate','run-id'])if(args[key]!==undefined)throw Error('Resume preserves configuration; omit --'+key);
  }else{
    config={objective:'survival-seconds',contract,implementationDigest,curriculum:{startTimes:[...startTimes],shares:[...stageShares],completeEpisodes:true,lossWeighting:'stage-share',bankSize:8,generator:'authentic-snapshot-breakthrough',lateStage:'breakthrough',healBreakthrough:true},visibility:'viewport-projected-anchor',actionSpace:{kind:'parameterized-options',heads,skills,redecisionSeconds:.5,maxOptionSeconds:1},decisionFrames:6,seconds:60,entrance:false,profiles,evaluationPolicy:'stochastic-fixed-stream',evaluationSeeds,hidden:numeric(args,'hidden',32,4,256),seed:numeric(args,'seed',1,0,0xffffffff),rollout:numeric(args,'rollout',rollout,8,16384),epochs:numeric(args,'epochs',4,1,100),batchSize:numeric(args,'batch-size',64,2,4096),learningRate:numeric(args,'learning-rate',.0003,.000001,.1,false),gamma:1,returnEstimator:'monte-carlo',clip:.2,entropy:.01,valueCoefficient:.5,targetKl:.02};
    runId=args['run-id']||'ppo-milk-'+Date.now();random=new Random(config.seed);net=new Network(featureCount,config.hidden,random);adam=new Adam(net.parameters.length);
    if(args['warm-start']){
      const saved=JSON.parse(fs.readFileSync(args['warm-start'],'utf8'));
      if(saved.contract!==contract||saved.sourceDigest!==sourceDigest||saved.sizes[0]!==featureCount||saved.config.hidden!==config.hidden||saved.parameters.length!==net.parameters.length||!saved.parameters.every(Number.isFinite))throw Error('Incompatible warm-start model');
      net.parameters.set(saved.parameters);config.warmStart={runId:saved.runId,generation:saved.generation};
    }
  }
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(runId))throw Error('Invalid run-id');
  const folder=path.join(directory,'models',runId);fs.mkdirSync(folder,{recursive:true});
  if(!args.resume&&fs.existsSync(path.join(folder,'latest.json')))throw Error('Run already exists; use --resume or a new run-id');
  const bankFile=path.join(folder,'starts.json');
  let banks;
  if(fs.existsSync(bankFile)){banks=JSON.parse(fs.readFileSync(bankFile,'utf8'));for(const profile of profiles)validateBank(banks.find(b=>JSON.stringify(b.profile)===JSON.stringify(profile)),profile);}
  else{
    if(!args['curriculum-replay'])throw Error('A new run requires --curriculum-replay PATH for the breakthrough curriculum');
    const tape=JSON.parse(fs.readFileSync(args['curriculum-replay'],'utf8')),late=breakthroughStarts(tape);
    banks=profiles.map(profile=>{const bank=createStartBank({profile,seed:0x20000000+(config.seed%0x10000000),size:config.curriculum.bankSize});bank.starts[30]=bank.starts[30].map(materialize);bank.starts[50]=late;bank.generator=config.curriculum.generator;return validateBank(bank,profile);});atomic(bankFile,banks);
  }
  let probeBest=-Infinity;
  const probeFile=path.join(folder,'curriculum-probe.json');if(fs.existsSync(probeFile))probeBest=JSON.parse(fs.readFileSync(probeFile)).best;
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
        // Minimum budgets independent of worker count; each job finishes its episode and
        // uses deterministic generation/job seeds. No per-step process startup.
        const jobs=rolloutJobs({config,random,parameters:net.parameters,banks});
        const results=await Promise.all(jobs.map(j=>pool.run(j)));rolloutMs=performance.now()-generationStart;const updateStart=performance.now();trainedSteps+=results.reduce((s,r)=>s+r.physicsSteps,0);
        training={starts:Object.fromEntries(results.map(r=>[r.startAt,{decisions:r.buffer.length,completedEpisodes:r.episodes,minimumDecisions:jobs.find(j=>j.startAt===r.startAt).decisions,lossShare:stageShares[startTimes.indexOf(r.startAt)],physicsSteps:r.physicsSteps,skillCounts:r.skillCounts,itemMetrics:r.itemMetrics,damage:r.damage}])),timeBuckets:{0:0,30:0,50:0}};for(const r of results)for(const t of startTimes)training.timeBuckets[t]+=r.timeBuckets[t];
        stats=optimize(net,adam,weightRollouts(results),random,{epochs:config.epochs,batchSize:config.batchSize,learningRate:config.learningRate});updateMs=performance.now()-updateStart;
      }
      const evaluationStart=performance.now();
      const results=await Promise.all(evaluationSeeds.map((seed,i)=>pool.run({kind:'evaluate',seed,policySeed:0xd0000000+i,profile:profiles[i%profiles.length],decisions:601,hidden:config.hidden,parameters:net.parameters})));
      const probeResults=await Promise.all(Array.from({length:4},(_,i)=>pool.run({kind:'evaluate',seed:0x30000000+i,policySeed:0xc0000000+i,profile:profiles[i%profiles.length],decisions:601,hidden:config.hidden,parameters:net.parameters})));
      const probeMean=probeResults.reduce((s,r)=>s+r.score,0)/probeResults.length;
      // A generation only consumes the previous completed generation's bank.
      // Held-out evaluation episodes never enter training.
      if(!Number.isFinite(probeBest)){probeBest=probeMean;atomic(probeFile,{best:probeBest,generation});}
      else if(probeMean>probeBest+1e-9){const bestProbe=probeResults.reduce((a,b)=>a.score>=b.score?a:b);if(bestProbe.score>=4){const entries=breakthroughStarts(bestProbe.replay);for(const bank of banks)bank.starts[50]=[...bank.starts[50],...entries].slice(-8);probeBest=probeMean;atomic(bankFile,banks);atomic(probeFile,{best:probeBest,generation,replay:bestProbe.replay});}}
      const evaluationMs=performance.now()-evaluationStart,saveStart=performance.now();
      const scores=results.map(r=>r.score),best=results.reduce((a,b)=>a.score>=b.score?a:b),record={runId,name:'蕉片崛起 PPO（突破盤面課程）',trainer:'PPO / NN (CPU)',generation,evaluationSeeds,scores,config};
      const recordFile=path.join(folder,'pending-generation.json'),replayFile=path.join(folder,'pending-replay.json');
      atomic(recordFile,record);atomic(replayFile,best.replay);
      const result=JSON.parse(execFileSync('python3',[path.join(root,'scripts/record-generation.py'),recordFile,'--replay',replayFile,'--directory',directory],{encoding:'utf8'}));
      const saved=checkpoint(net,adam,config,generation,runId,random,stats);saved.training=training;saved.evaluation={seeds:evaluationSeeds,scores,profiles,itemMetrics:results.map(r=>r.itemMetrics),damage:results.map(r=>r.damage)};atomic(path.join(folder,'latest.json'),saved);if(result.reason==='baseline')atomic(path.join(folder,'initial.json'),saved);if(result.reason!=='score-only')atomic(path.join(folder,'best.json'),saved);
      fs.appendFileSync(path.join(folder,'damage-history.jsonl'),JSON.stringify({generation,training:Object.fromEntries(Object.entries(training?.starts||{}).map(([stage,r])=>[stage,r.damage])),evaluation:saved.evaluation.damage})+'\n');
      fs.unlinkSync(recordFile);fs.unlinkSync(replayFile);
      const mean=scores.reduce((a,b)=>a+b)/scores.length,toSeconds=ms=>Math.round(ms)/1000;
      console.log(JSON.stringify({runId,generation,mean,min:Math.min(...scores),success:scores.filter(n=>n>=60-1e-6).length/scores.length,desktop:mean,archive:result.reason,probeMean,evaluationItemMetrics:results.map(r=>r.itemMetrics),evaluationDamage:results.map(r=>r.damage),training,optimizer:stats,timingSeconds:{rollout:toSeconds(rolloutMs),update:toSeconds(updateMs),evaluation:toSeconds(evaluationMs),save:toSeconds(performance.now()-saveStart),total:toSeconds(performance.now()-generationStart)},physicsStepsPerSecond:Math.round(trainedSteps/((Date.now()-started)/1000))}));
      if(stopping)break;
    }
    console.log(`Checkpoint: ${path.join(folder,'latest.json')}\nDashboard: http://127.0.0.1:8893/training/`);
  }finally{process.removeListener('SIGINT',requestStop);process.removeListener('SIGTERM',requestStop);await pool.close();}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={Pool,checkpoint,restore,trainingSetup,main};
