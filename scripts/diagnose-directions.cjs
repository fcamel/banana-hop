'use strict';
const fs=require('node:fs');
const {createNetwork,Random}=require('../sim/ppo.cjs');
const {featureCount,contract}=require('../sim/training.cjs');
const {sourceDigest}=require('../sim/environment.cjs');
const {diagnose}=require('../sim/direction-probes.cjs');
if(process.argv.length!==4||process.argv[2]!=='--checkpoint')throw Error('Usage: node scripts/diagnose-directions.cjs --checkpoint PATH');
const c=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
// Read-only cross-implementation comparison is intentional. Strict training
// resume still checks implementationDigest; these probes never update weights.
if(c.contract!==contract||c.sourceDigest!==sourceDigest||c.sizes?.[0]!==featureCount)throw Error('Checkpoint observation/game source mismatch');
const net=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture||'mlp-v1');
if(c.parameters.length!==net.parameters.length||!c.parameters.every(Number.isFinite))throw Error('Invalid checkpoint parameters');net.parameters.set(c.parameters);
console.log(JSON.stringify({runId:c.runId,generation:c.generation,architecture:c.architecture,note:'Controlled observations only; probabilities measure sensitivity, not proven survival or safe directions.',cases:diagnose(net)},null,2));
