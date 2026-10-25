'use strict';
const {scenarios,fixture}=require('./ability-scenarios.cjs');
const {createCodec}=require('./snapshot.cjs');
function curriculumCases(split){
 if(!['train','validation'].includes(split))throw Error('Invalid split');
 return ['jet','evade','flight'].flatMap(family=>Array.from({length:8},(_,i)=>({id:`${split}-${family}-${i}`,family,angle:(i+(split==='train'?0:.5))*Math.PI/4,radius:split==='train'?100:125,seed:(split==='train'?0xd7000000:0xd8000000)+i,seconds:3,split})));
}
function curriculumFixture(spec){
 if(!curriculumCases(spec.split).some(s=>JSON.stringify(s)===JSON.stringify(spec)))throw Error('Invalid curriculum fixture');
 const base=scenarios('development').find(s=>s.pose==='flight'),saved=fixture(base),codec=createCodec(),w=codec.decode(saved.world);saved.config.seed=spec.seed;w.simulationRandomState=spec.seed;
 const c=Math.cos(spec.angle),s=Math.sin(spec.angle),rotate=(x,y)=>({x:x*c-y*s,y:x*s+y*c});w.milkDrops=[];
 if(spec.family==='flight'){
  const e=w.enemies[0],p=rotate(spec.radius,0),end=rotate(-201.6,0);Object.assign(e,p);e.sliceFlight={t:0,ax:p.x,ay:p.y,bx:end.x,by:end.y,startZ:32,duration:(spec.radius+201.6)/460};
 }else{
  w.enemies=[];w.milkPack=spec.family==='jet'?{ammo:5,emit:0,spraying:false}:null;
  for(let i=0;i<8;i++){const a=spec.angle+i*Math.PI/4,r=spec.radius*(1+i*.08);w.milkDrops.push({x:Math.cos(a)*r,y:Math.sin(a)*r,z:32,vx:-Math.cos(a)*240,vy:-Math.sin(a)*240,life:3,hostile:true});}
 }
 saved.world=codec.encode(w);return saved;
}
module.exports={curriculumCases,curriculumFixture};
