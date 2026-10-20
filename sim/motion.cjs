'use strict';
const {inViewport}=require('./skills.cjs');
// Estimate motion from consecutive visible samples only, never flight endpoints,
// internal timers or future world states. Lost visibility discards the history.
class MotionHistory{
  constructor(){this.entries=new Map();}
  update(o){
    const next=new Map();
    for(const e of o.enemies){
      if(e.id===undefined||!inViewport(o,e))continue;
      const old=this.entries.get(e.id),dt=old?o.time-old.time:0;
      if(old&&old.type===e.type&&Math.abs(dt)<1e-9){next.set(e.id,old);continue;}
      const valid=!!old&&old.type===e.type&&dt>1e-9;
      next.set(e.id,{type:e.type,x:e.x,y:e.y,z:e.z||0,time:o.time,valid,
        vx:valid?(e.x-old.x)/dt:0,vy:valid?(e.y-old.y)/dt:0,vz:valid?((e.z||0)-old.z)/dt:0});
    }
    this.entries=next;
  }
  get(e){const m=this.entries.get(e.id);return m&&m.type===e.type?m:{vx:0,vy:0,vz:0,valid:false};}
}
module.exports={MotionHistory};
