'use strict';
const {inViewport}=require('./skills.cjs');
// Current, visible windup only. This is not the cooldown until a future attack;
// remaining time assumes this windup is not interrupted by damage or a new state.
function attackTelegraph(o,e){
  const inactive={active:false,seconds:0};
  if(!inViewport(o,e)||e.hp<=0||e.hit>0||e.knock>0||e.down>0)return inactive;
  let seconds;
  if(e.type==='slice'&&e.stackAnchor&&(e.stackCount||1)>1&&!e.sliceFlight&&!e.sliceHop){
    seconds=e.nextSliceShot-e.stackTime;
  }else if(e.type==='charger'&&e.phase==='aim'||e.type==='thrower'&&e.phase==='windup'){
    seconds=e.phaseTime;
  }else return inactive;
  if(!Number.isFinite(seconds))return inactive;
  return {active:true,seconds:Math.max(0,seconds)};
}
module.exports={attackTelegraph};
