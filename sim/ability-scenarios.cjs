'use strict';
const {createEnvironment}=require('./environment.cjs');
const {createCodec}=require('./snapshot.cjs');
// Independent diagnostic fixtures. Only initial worlds/spawn clocks change;
// subsequent movement, AI, collision, damage and resources use the real game.
function scenarios(split='test'){
 if(!['development','test'].includes(split))throw Error('Unknown diagnostic split');
 const gap=split==='test'?225:180,out=[];
 for(const side of [-1,1])for(const count of [1,5])out.push({id:`bullets-${side}-${count}`,family:'bullets',side,count,gap,seconds:4});
 for(const side of [-1,1])for(const pose of ['ground','rising','falling','flight'])out.push({id:`slices-${side}-${pose}`,family:'slices',side,pose,gap,seconds:5});
 for(const sx of [-1,1])for(const sy of [-1,1])out.push({id:`corner-${sx}-${sy}`,family:'corner',sx,sy,gap,seconds:6});
 for(const side of [-1,1])for(const unsafe of [false,true])out.push({id:`bottle-${side}-${unsafe}`,family:'bottle',side,unsafe,gap,seconds:6});
 return out.map(s=>({...s,split,seed:split==='test'?0xd1000001:0x21000001}));
}
function fixture(spec){
 if(!scenarios(spec.split).some(s=>JSON.stringify(s)===JSON.stringify(spec)))throw Error('Unknown fixture specification');
 const env=createEnvironment({mode:'milk',survivalOnly:true,entrance:false,seed:spec.seed,width:1000,height:650,mobile:false});
 const saved=env.snapshot(),codec=createCodec(),w=codec.decode(saved.world),template={...w.enemies[0]};
 for(const k of ['enemies','peels','particles','texts','pickups','orbitPeels','spawnWarnings','durianWarnings','surfPickups','surfFlights','milkBottles','milkDrops','sliceRallies'])w[k]=[];
 for(const k of ['spawnClock','nextMilkAt','nextPickupAt','nextSurfAt','nextDurianAt','nextChargerAt','nextThrowerAt'])w[k]=1e6;
 w.spawnDueWaves=0;w.charge=0;w.milkPack=null;w.surfStock=0;
 Object.assign(w.player,{x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0});
 const addSlice=(x,y)=>{const e={...template,id:w.serial++,x,y,type:'slice',hp:1,stackCount:1,stackAnchor:false,stackTime:0,z:0,sliceHop:null,sliceFlight:null,sliceHopWait:.5,sliceGoal:'player',sliceBottleRevision:w.milkBottleRevision};w.enemies.push(e);return e;};
 const bullet=(x,y,vx,vy)=>w.milkDrops.push({x,y,z:32,vx,vy,life:3,hostile:true});
 if(spec.family==='bullets')for(let i=0;i<spec.count;i++){const a=(i-(spec.count-1)/2)*Math.PI/12;bullet(spec.side*spec.gap,0,-spec.side*240*Math.cos(a),240*Math.sin(a));}
 if(spec.family==='slices'){
  const e=addSlice(spec.side*spec.gap,0);
  if(spec.pose==='flight'){e.z=32;e.sliceFlight={t:0,ax:e.x,ay:0,bx:-spec.side*201.6,by:0,startZ:32,duration:Math.max(.42,(spec.gap+201.6)/460)};}
  if(['rising','falling'].includes(spec.pose)){const u=spec.pose==='rising'?.15:.65,travel=80;e.z=Math.sin(u*Math.PI)*48;e.sliceHop={t:u*.63,ax:e.x+spec.side*travel*u,ay:0,bx:e.x-spec.side*travel*(1-u),by:0};}
 }
 if(spec.family==='corner'){
  w.player.x=spec.sx*1225;w.player.y=spec.sy*1225;
  for(let i=0;i<3;i++)addSlice(w.player.x-spec.sx*(100+i*30),w.player.y-spec.sy*(180-i*35));
 }
 if(spec.family==='bottle'){
  w.milkBottles.push({id:w.serial++,x:spec.side*200,y:0,age:0});w.milkBottleRevision++;
  if(spec.unsafe)for(const dx of [-20,20])bullet(spec.side*100+dx,-150,0,240);
 }
 saved.world=codec.encode(w);return saved;
}
module.exports={scenarios,fixture};
