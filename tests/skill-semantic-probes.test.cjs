'use strict';
const assert=require('node:assert/strict');
const {cases,input,probe}=require('../sim/skill-semantic-probes.cjs');
const {featureCount}=require('../sim/training.cjs');
const {targetSlots,validateChoice}=require('../sim/skills.cjs');
const specs=cases();assert.equal(specs.length,864);
for(const s of specs){const v=input(s);assert.equal(v.features.length,featureCount);assert.ok(Array.from(v.features).every(Number.isFinite));assert.equal(targetSlots(v.observation).filter(Boolean).length,1);}
const s=specs[0],a=input(s),b=input({...s,distance:400});
assert.equal(a.features[2],b.features[2]);assert.notEqual(a.features[33],b.features[33]);
const fake={sample(f,r,g,c){const action=[2,0,1,0];validateChoice(action,c);return {action};},forward(){return {probs:[[0,0,1,0,0,0,0,0,0,0]]};}};
assert.equal(probe(fake,s).requestJump,true);
assert.equal(probe(fake,{...s,phase:'falling'}).requestJump,false);
assert.deepEqual(input(s).features,a.features);
console.log('Skill semantic probe tests passed');
