'use strict';
const assert=require('node:assert/strict');const {initial,specification}=require('../sim/dodge-curriculum.cjs'),{createCodec}=require('../sim/snapshot.cjs'),{trainingEnvironment,skillEnvironment}=require('../sim/training.cjs');
function start(count=0){const s=initial({...specification(0),gap:1,speed:0,count}),c=createCodec(),w=c.decode(s.world);w.player.z=20;w.player.vz=-100;s.world=c.encode(w);return s;}
const opts={seed:1,width:1000,height:650,mobile:false,diagnosticStart:start()};
const a=trainingEnvironment({...opts,diagnosticLandingDecision:true}),b=trainingEnvironment(opts),action={x:1,y:0,jump:false,jet:false,dash:false,surf:false};
const r=a.stepAction(action,30);assert.equal(r.diagnosticLanded,true);assert.ok(r.info.steps<30);b.stepAction(action,r.info.steps);assert.deepEqual(a.summary(),b.summary());assert.deepEqual(Array.from(a.features()),Array.from(b.features()));assert.ok(a.observe().player.z<=1);
const hurt=trainingEnvironment({...opts,diagnosticStart:start(1),diagnosticLandingDecision:true}).stepAction({...action,x:0},30);assert.equal(hurt.terminated,true);assert.equal(hurt.diagnosticLanded,false);
const d=skillEnvironment(opts),off=skillEnvironment({...opts,diagnosticLandingDecision:false});assert.deepEqual(d.step([0,1,0,0]),off.step([0,1,0,0]));
const on=skillEnvironment({...opts,diagnosticLandingDecision:true});assert.equal(on.step([0,1,0,0]).option.reason,'diagnostic-landing');
console.log('Landing decision tests passed');
