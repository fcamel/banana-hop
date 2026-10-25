'use strict';
const {Random}=require('./ppo.cjs');
function batch(original,extra,rng,mixed){if(!original.length||(mixed&&!extra.length))throw Error('Empty training pool');return Array.from({length:32},(_,i)=>{const pool=mixed&&i>=16?extra:original;return pool[Math.floor(rng.next()*pool.length)];});}
function metrics(net,rows){let positive=0,tp=0,fp=0,negative=0,correct=0;const rng=new Random(1);for(const r of rows){const a=net.sample(r.features,rng,true,r.context).action,p=r.action[0]===6;positive+=+p;tp+=+(p&&a[0]===6);if(!p&&r.context.skills[6]){negative++;fp+=+(a[0]===6);}correct+=+a.every((v,i)=>v===r.action[i]);}return {rows:rows.length,positive,tp,negative,fp,recall:positive?tp/positive:null,falsePositiveRate:negative?fp/negative:null,jointAccuracy:rows.length?correct/rows.length:null};}
module.exports={batch,metrics};
