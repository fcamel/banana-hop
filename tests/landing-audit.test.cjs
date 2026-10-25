'use strict';
const assert=require('node:assert/strict');const {threatProbe,landingContext,recordFrame}=require('../sim/landing-audit.cjs');
const view={player:{z:30},objects:[{kind:'drops',x:100,y:0,z:32,vx:-100,vy:0,valid:true}]};
const toward=threatProbe(view,{x:1,y:0},'drops'),away=threatProbe(view,{x:-1,y:0},'drops');assert.equal(toward.nearest.toward,1);assert.equal(away.nearest.toward,-1);assert.ok(toward.forecast.distance<away.forecast.distance);assert.equal(threatProbe(view,{x:1,y:0},'slices').visible,0);
const f=[{time:1,z:0,vz:-20,beforeZ:3,landed:true,crossedMilkHeight:false,jump:false},{time:1.1,z:10,vz:20,beforeZ:3,landed:false,crossedMilkHeight:false,jump:true}];assert.ok(Math.abs(landingContext(f,1.2).lastLandingAgo-.2)<1e-9);assert.equal(landingContext(f,2).lastLandingAgo,null);assert.equal(landingContext(f,1.2).jumpRequestsAirborne,1);
console.log('Landing audit tests passed');

const before={player:{hp:5,z:60,vz:-100}},after={time:1,player:{hp:4,z:0,vz:0}};
assert.equal(recordFrame(before,after,{}, {player:{z:55}}).landed,false);
assert.equal(recordFrame(before,after,{}, {player:{z:55}}).crossedMilkHeight,false);
assert.equal(recordFrame(before,after,{}, {player:{z:35}}).crossedMilkHeight,true);
assert.throws(()=>recordFrame(before,after,{},null));
