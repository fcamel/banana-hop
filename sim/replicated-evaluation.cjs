'use strict';
const {Random}=require('./ppo.cjs');
// Crossed resampling: one sampled set of game columns is shared by all sampled
// training rows. Do not count correlated seed pairs as independent episodes.
function crossedBootstrap(matrix){
 if(!matrix.length||!matrix[0].length||matrix.some(r=>r.length!==matrix[0].length||r.some(x=>!Number.isFinite(x))))throw Error('Invalid replicate matrix');
 const n=matrix.length,m=matrix[0].length,rng=new Random(417),draws=[];
 const perReplicate=matrix.map(r=>r.reduce((a,b)=>a+b,0)/m),mean=perReplicate.reduce((a,b)=>a+b,0)/n;
 for(let b=0;b<4000;b++){const rows=Array.from({length:n},()=>Math.floor(rng.next()*n)),cols=Array.from({length:m},()=>Math.floor(rng.next()*m));let sum=0;for(const i of rows)for(const j of cols)sum+=matrix[i][j];draws.push(sum/n/m);}
 draws.sort((a,b)=>a-b);return {mean,ci95:[draws[100],draws[3899]],perReplicate,trainingReplicates:n,gameSeeds:m};
}
module.exports={crossedBootstrap};
