'use strict';
const assert=require('node:assert/strict'),{balancedProbe}=require('../sim/imitation-probe.cjs');
const rows=[];for(const skill of [0,6,3,7])for(let i=0;i<24;i++)rows.push({action:[skill,skill===7?0:1+i%8,0,0],id:rows.length});
const picked=balancedProbe(rows);assert.equal(picked.length,32);assert.equal(new Set(picked).size,32);assert.deepEqual(picked,balancedProbe(rows));for(const skill of [0,6,3,7]){const group=picked.filter(r=>r.action[0]===skill);assert.equal(group.length,8);if(skill!==7)assert.equal(new Set(group.map(r=>r.action[1])).size,8);}assert.throws(()=>balancedProbe(rows.filter(r=>r.action[0]!==3)),/Insufficient/);
console.log('PASS balanced probe keeps unique rows, rare skills and direction coverage');
