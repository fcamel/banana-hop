'use strict';
const assert=require('node:assert/strict'),{crossedBootstrap}=require('../sim/replicated-evaluation.cjs');
assert.deepEqual(crossedBootstrap([[2,2],[2,2]]).ci95,[2,2]);const r=crossedBootstrap([[-10,-10,-10],[10,10,10]]);assert.equal(r.mean,0);assert.deepEqual(r.perReplicate,[-10,10]);assert.ok(r.ci95[0]<=-10&&r.ci95[1]>=10);assert.equal(r.trainingReplicates,2);assert.equal(r.gameSeeds,3);assert.deepEqual(r,crossedBootstrap([[-10,-10,-10],[10,10,10]]));assert.throws(()=>crossedBootstrap([[1],[2,3]]));assert.throws(()=>crossedBootstrap([[NaN]]));
console.log('PASS crossed bootstrap retains between-training variance and paired game columns');
// training-worker registers a parentPort listener; diagnostic workers must close
// their port after returning results so the parent can wait for a clean exit.
const {Worker}=require('node:worker_threads'),path=require('node:path');
const w=new Worker(`require(${JSON.stringify(path.resolve(__dirname,'../sim/training-worker.cjs'))});const {parentPort}=require('node:worker_threads');parentPort.postMessage('done');parentPort.close();`,{eval:true});
let message;const timeout=setTimeout(()=>{w.terminate();throw Error('Diagnostic worker did not close');},10000);w.on('message',m=>message=m);w.on('error',e=>{clearTimeout(timeout);throw e;});w.on('exit',code=>{clearTimeout(timeout);assert.equal(code,0);assert.equal(message,'done');console.log('PASS diagnostic worker closes inherited message listener and exits');});
