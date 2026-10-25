'use strict';
const {groups,featureCount}=require('./training.cjs');
const {heads,policySize}=require('./ppo.cjs');
const {masksFor}=require('./imitation.cjs');
function transform(input,{compact=false,scale=1}={}){
 if(input.length!==featureCount)throw Error('Invalid feature length');
 const f=Float64Array.from(input);let offset=32;const selected=[];
 for(const [name,count,width] of groups){
  for(let i=0;i<count;i++){
   const at=offset+i*width;if(f[at]){f[at+1]*=scale;f[at+2]*=scale;}
   const keep=name==='slices'&&i<3||name==='bottles'&&i<1;
   if(compact){if(keep)selected.push(...f.slice(at,at+width));else if(f[at])throw Error('Compact control only supports this isolated task');}
  }
  offset+=count*width;
 }
 if(f[offset]){f[offset+8]*=scale;f[offset+9]*=scale;}
 return compact?Float64Array.from([...f.slice(0,32),...selected,...f.slice(-10)]):f;
}
function norm(a){return Math.sqrt(a.reduce((s,x)=>s+x*x,0));}
function directionDiagnostics(net,rows){
 const threat=rows.filter(r=>r.side),gradient=new Float64Array(net.parameters.length);let loss=0,entropy=0,probability=0,correct=0,individualNorm=0;
 for(const row of threat){
  const f=net.forward(row.features,masksFor(row.context,row.action),row.action[0]),p=f.probs[1],label=row.action[1],g=new Float64Array(policySize+1),individual=new Float64Array(net.parameters.length);
  loss-=Math.log(Math.max(1e-30,p[label]));probability+=p[label];entropy-=p.reduce((s,x)=>s+(x?x*Math.log(x):0),0);correct+=+(p.indexOf(Math.max(...p))===label);
  for(let j=0;j<heads[1];j++)g[heads[0]+j]=p[j]-(j===label?1:0);
  net.backward(f,g,individual);individualNorm+=norm(individual);for(let j=0;j<gradient.length;j++)gradient[j]+=individual[j]/threat.length;
 }
 const rms=l=>{let sum=0,n=0;for(const x of (Array.isArray(l)?l:[l]))for(let i=x.w;i<x.b+x.outs;i++){sum+=gradient[i]**2;n++;}return Math.sqrt(sum/n);};
 return {samples:threat.length,loss:loss/threat.length,conditionalDirectionAccuracy:correct/threat.length,meanCorrectProbability:probability/threat.length,entropy:entropy/threat.length,gradientNorm:norm(gradient),meanIndividualGradientNorm:individualNorm/threat.length,cancellationRatio:norm(gradient)/(individualNorm/threat.length||1),moduleRms:net.encoders?{selfEncoder:rms(net.encoders[0]),sliceEncoder:rms(net.encoders[1]),bottleEncoder:rms(net.encoders[3]),actor:rms(net.actor),output:rms(net.output)}:{firstLayer:rms(net.layers[0]),output:rms(net.layers.at(-1))}};
}
module.exports={transform,directionDiagnostics};
