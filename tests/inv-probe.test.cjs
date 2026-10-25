'use strict';
const assert=require('node:assert/strict'),{variant}=require('../sim/inv-probe.cjs');
const f=Float64Array.from({length:50},(_,i)=>i/100),copy=Array.from(f);
for(const mode of ['inv','damage','paired']){const v=variant(f,2,mode);for(let i=0;i<f.length;i++)assert.equal(v[i],i===5&&mode!=='damage'||i===6&&mode!=='inv'?.8:f[i]);}
assert.deepEqual(Array.from(f),copy);assert.throws(()=>variant(f,3,'paired'),/Invalid/);assert.throws(()=>variant(f,1,'unknown'),/Invalid/);console.log('Invulnerability probe tests passed');
