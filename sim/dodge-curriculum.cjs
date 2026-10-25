'use strict';
const {fixture,scenarios}=require('./ability-scenarios.cjs');
const {createCodec}=require('./snapshot.cjs');
const {skillEnvironment}=require('./training.cjs');
const {Random,monteCarloReturns}=require('./ppo.cjs');
const {choose}=require('./visible-baseline.cjs');
function specification(index,split='train',pattern='single'){
 if(!['single','cross'].includes(pattern))throw Error('Invalid pattern');
 if(!Number.isInteger(index)||index<0||!['train','test'].includes(split))throw Error('Invalid course case');
 const rng=new Random((index+ (split==='train'?0x310000:0x810000))>>>0);
 return {pattern,seed:index+1,angle:((index%16)+(split==='test'?.5:0))*Math.PI/8,gap:100+rng.next()*140,speed:240+rng.next()*100,count:[1,3,5][Math.floor(rng.next()*3)]};
}
function initial(spec){
 const saved=fixture(scenarios('development')[0]),codec=createCodec(),w=codec.decode(saved.world);
 saved.config.seed=spec.seed;w.simulationRandomState=spec.seed;w.player.hp=1;w.milkDrops=[];
 for(let source=0;source<(spec.pattern==='cross'?3:1);source++)for(let i=0;i<spec.count;i++){
  const angle=spec.angle+source*2*Math.PI/3;
  const a=angle+Math.PI+(i-(spec.count-1)/2)*Math.PI/18;
  w.milkDrops.push({x:Math.cos(angle)*spec.gap,y:Math.sin(angle)*spec.gap,z:32,vx:Math.cos(a)*spec.speed,vy:Math.sin(a)*spec.speed,life:3,hostile:true});
 }
 saved.world=codec.encode(w);return saved;
}
function episode(policy,spec,{rng=new Random(1),greedy=false,collect=false}={}){
 const env=skillEnvironment({seed:spec.seed,width:1000,height:650,mobile:false,diagnosticStart:initial(spec),diagnosticUntil:4}),trajectory=[];let previous=0;
 for(let steps=0;steps<100;steps++){
  const features=env.features(),context=env.context(),sample=policy.net?policy.net.sample(features,rng,greedy,context):{action:policy.name==='idle'?[0,0,0,0]:choose(features,context,previous).choice};
  previous=sample.action[1];const result=env.step(sample.action),done=result.terminated||result.truncated;
  // Four seconds is this isolated task's terminal goal, not a cut-off in a 60s return.
  if(collect)trajectory.push({...sample,features,reward:result.reward,terminated:done});
  if(done)return {seconds:env.summary().gameSeconds,success:!result.terminated,buffer:collect?monteCarloReturns(trajectory):undefined};
 }
 throw Error('Course exceeded decision bound');
}
module.exports={specification,initial,episode};
