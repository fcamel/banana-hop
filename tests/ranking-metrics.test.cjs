'use strict';
const assert=require('node:assert/strict'),{ranking}=require('../sim/ranking-metrics.cjs');
const rows=[{score:.9,positive:true},{score:.1,positive:false}],copy=JSON.stringify(rows);assert.equal(ranking(rows).auc,1);assert.equal(ranking(rows).averagePrecision,1);assert.equal(JSON.stringify(rows),copy);
const reverse=rows.map(r=>({...r,score:1-r.score}));assert.equal(ranking(reverse).auc,0);assert.equal(ranking(reverse).averagePrecision,.5);
const ties=rows.map(r=>({...r,score:.5}));assert.equal(ranking(ties).auc,.5);assert.equal(ranking(ties).averagePrecision,.5);assert.equal(ranking(ties).curve.length,2);
assert.equal(ranking([]).auc,null);assert.equal(ranking([rows[0]]).auc,null);assert.equal(ranking([{score:1,positive:true}]).bins[9].count,1);assert.throws(()=>ranking([{score:NaN,positive:true}]),/Invalid/);
console.log('Ranking metrics tests passed');
