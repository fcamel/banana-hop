'use strict';
// Only current visible positions and observed velocities; never flight endpoints.
function threatProbe(view,input,kind){
 const objects=view.objects.filter(o=>o.kind===kind&&!o.disabled),p=view.player,n=Math.hypot(input.x||0,input.y||0)||1;
 let nearest=null,forecast=null;
 for(const o of objects){
  const distance=Math.hypot(o.x,o.y),toward=distance?((input.x||0)*o.x+(input.y||0)*o.y)/n/distance:0;
  if(!nearest||distance<nearest.distance)nearest={distance,toward,height:o.z,flight:!!o.flight,hop:!!o.hop};
  // Nominal walking velocity is diagnostic only: jet/recoil can differ.
  if(!o.valid)continue;
  for(const t of [.1,.2,.3,.4,.5]){
   const x=o.x+o.vx*t-(input.x||0)/n*205*t,y=o.y+o.vy*t-(input.y||0)/n*205*t,d=Math.hypot(x,y);
   if(!forecast||d<forecast.distance)forecast={distance:d,after:t,height:o.z,velocityKnown:true};
  }
 }
 return {visible:objects.length,nearest,forecast,note:'Horizontal linear estimate only; not a safe-route oracle or identified culprit.'};
}
function landingContext(frames,time){
 const recent=frames.filter(f=>f.time<=time+1e-8&&f.time>=time-.5-1e-8);
 const landed=recent.filter(f=>f.landed).at(-1),low=recent.filter(f=>f.crossedMilkHeight).at(-1),last=recent.at(-1);
 return {lastLandingAgo:landed?time-landed.time:null,lastMilkHeightCrossingAgo:low?time-low.time:null,descending:last?last.vz<0:false,height:last?.z??null,jumpRequestsAirborne:recent.filter(f=>f.jump&&f.beforeZ>1).length};
}
function recordFrame(before,after,action,damage){
 const lost=after.player.hp<before.player.hp;if(lost&&!damage)throw Error('Missing pre-hurt height');
 const z=lost?damage.player.z:after.player.z;
 return {time:after.time,z,vz:before.player.vz,beforeZ:before.player.z,jump:!!action.jump,landed:before.player.z>1&&z<=1,crossedMilkHeight:before.player.z>=48&&z<48};
}
module.exports={threatProbe,landingContext,recordFrame};
