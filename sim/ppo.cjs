'use strict';
// Small CPU actor/critic and PPO-Clip implementation. No game state is modified.
// Analytic gradients and Adam are covered by finite-difference regression tests.
const {heads}=require('./skills.cjs');
const policySize=heads.reduce((a,b)=>a+b,0);
class Random{
  constructor(seed=1){this.state=seed>>>0;}
  next(){let t=this.state=(this.state+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
}
function distribution(logits,mask=null){
  if(mask&&mask.length!==logits.length)throw Error('Invalid action mask');
  const allowed=Array.from(logits,(_,i)=>!mask||mask[i]),max=Math.max(...Array.from(logits,(v,i)=>allowed[i]?v:-Infinity));
  if(!Number.isFinite(max))throw Error('Empty action mask');
  const exps=Array.from(logits,(v,i)=>allowed[i]?Math.exp(v-max):0),sum=exps.reduce((s,v)=>s+v,0);return exps.map(v=>v/sum);
}
class Network{
  constructor(input,hidden=32,rng=new Random()){
    this.sizes=[input,hidden,hidden,policySize+1];this.parameters=[];this.layers=[];
    for(let l=0;l<this.sizes.length-1;l++){
      const ins=this.sizes[l],outs=this.sizes[l+1],w=this.parameters.length,gain=l===2?.1:Math.sqrt(6/(ins+outs));
      for(let i=0;i<ins*outs;i++)this.parameters.push((rng.next()*2-1)*gain);
      const b=this.parameters.length;for(let i=0;i<outs;i++)this.parameters.push(0);
      this.layers.push({ins,outs,w,b});
    }
    this.parameters=Float64Array.from(this.parameters);
  }
  forward(input,masks=null){
    const activations=[input];let a=input;
    for(let l=0;l<this.layers.length;l++){const {ins,outs,w,b}=this.layers[l],out=new Float64Array(outs);
      for(let j=0;j<outs;j++){let z=this.parameters[b+j];for(let i=0;i<ins;i++)z+=this.parameters[w+j*ins+i]*a[i];out[j]=l===this.layers.length-1?z:Math.tanh(z);}
      a=out;activations.push(a);
    }
    const probs=[];let offset=0;for(const [h,size] of heads.entries()){probs.push(distribution(a.slice(offset,offset+size),masks?.[h]));offset+=size;}
    return {activations,probs,value:a[policySize]*60};
  }
  backward(cache,outputGradient,gradient){
    let delta=outputGradient;
    for(let l=this.layers.length-1;l>=0;l--){const {ins,outs,w,b}=this.layers[l],a=cache.activations[l],prev=new Float64Array(ins);
      for(let j=0;j<outs;j++){gradient[b+j]+=delta[j];for(let i=0;i<ins;i++){gradient[w+j*ins+i]+=delta[j]*a[i];prev[i]+=delta[j]*this.parameters[w+j*ins+i];}}
      if(l>0)for(let i=0;i<ins;i++)prev[i]*=1-a[i]*a[i];delta=prev;
    }
  }
  sample(input,rng,greedy=false,context=null){
    const draw=p=>{if(greedy)return p.indexOf(Math.max(...p));let r=rng.next();for(let i=0;i<p.length;i++){r-=p[i];if(r<0)return i;}return p.findLastIndex(v=>v>0);};
    const raw=this.forward(input),logits=raw.activations.at(-1);
    const first=distribution(logits.slice(0,heads[0]),context?.skills),skill=draw(first);
    const masks=context?[context.skills,context.parameters[skill].direction,context.parameters[skill].target]:null;
    let offset=heads[0];const probs=[first];for(let h=1;h<heads.length;h++){probs.push(distribution(logits.slice(offset,offset+heads[h]),masks?.[h]));offset+=heads[h];}
    const action=[skill,...probs.slice(1).map(draw)];return {action,value:raw.value,logp:logProbability(probs,action),probs,masks};
  }
}
function logProbability(probs,action){return probs.reduce((sum,p,i)=>sum+Math.log(Math.max(1e-30,p[action[i]])),0);}
function lossAndGradient(net,batch,{clip=.2,entropy=.01,valueCoefficient=.5}={}){
  const gradient=new Float64Array(net.parameters.length);let loss=0,kl=0,clipped=0;
  for(const item of batch){
    const weight=item.weight??1,f=net.forward(item.features,item.masks),logp=logProbability(f.probs,item.action),ratio=Math.exp(Math.max(-30,Math.min(30,logp-item.logp))),adv=item.advantage;
    const active=adv>=0?ratio<=1+clip:ratio>=1-clip,policy=-Math.min(ratio*adv,Math.max(1-clip,Math.min(1+clip,ratio))*adv);
    const deltaValue=(f.value-item.target)/60,grad=new Float64Array(policySize+1);let ent=0,offset=0;
    for(let h=0;h<heads.length;h++){
      const p=f.probs[h],H=-p.reduce((s,v)=>s+v*Math.log(Math.max(1e-30,v)),0);ent+=H;
      for(let j=0;j<p.length;j++){
        const log=Math.log(Math.max(1e-30,p[j]));
        grad[offset+j]=(active?-adv*ratio*((item.action[h]===j?1:0)-p[j]):0)+entropy*p[j]*(log+H);
        const old=item.probs[h][j];kl+=weight*old*Math.log(Math.max(1e-30,old)/Math.max(1e-30,p[j]))/batch.length;
      }offset+=p.length;
    }
    grad[policySize]=valueCoefficient*deltaValue;
    for(let i=0;i<grad.length;i++)grad[i]*=weight/batch.length;
    net.backward(f,grad,gradient);loss+=weight*(policy+valueCoefficient*.5*deltaValue*deltaValue-entropy*ent)/batch.length;if(!active)clipped+=weight;
  }
  return {loss,kl,clipFraction:clipped/batch.length,gradient};
}
class Adam{
  constructor(size){this.m=new Float64Array(size);this.v=new Float64Array(size);this.t=0;}
  step(parameters,gradient,lr=.0003,maxNorm=.5){
    let norm=0;for(const g of gradient)norm+=g*g;const scale=Math.min(1,maxNorm/(Math.sqrt(norm)||1));this.t++;
    const c1=1-Math.pow(.9,this.t),c2=1-Math.pow(.999,this.t);
    for(let i=0;i<parameters.length;i++){const g=gradient[i]*scale;this.m[i]=.9*this.m[i]+.1*g;this.v[i]=.999*this.v[i]+.001*g*g;parameters[i]-=lr*(this.m[i]/c1)/(Math.sqrt(this.v[i]/c2)+1e-8);}
    if(!parameters.every(Number.isFinite))throw Error('Non-finite model parameters');
  }
}
// Complete episodes only: targets are measured reward-to-go, never critic bootstrap.
function monteCarloReturns(trajectory){
  if(!trajectory.length||!trajectory.at(-1).terminated||trajectory.slice(0,-1).some(t=>t.terminated))throw Error('Monte Carlo returns require one complete episode');
  let remaining=0;
  for(let i=trajectory.length-1;i>=0;i--){const t=trajectory[i];remaining+=t.reward;t.target=remaining;t.advantage=remaining-t.value;}
  return trajectory;
}
function optimize(net,adam,buffer,rng,{epochs=4,batchSize=64,learningRate=.0003,targetKl=.02,...lossOptions}={}){
  const mass=buffer.reduce((s,t)=>s+(t.weight??1),0),mean=buffer.reduce((s,t)=>s+(t.weight??1)*t.advantage,0)/mass,std=Math.sqrt(buffer.reduce((s,t)=>s+(t.weight??1)*(t.advantage-mean)**2,0)/mass)+1e-8;
  for(const t of buffer)t.advantage=(t.advantage-mean)/std;
  let last,updates=0;
  for(let epoch=0;epoch<epochs;epoch++){
    const order=Array.from({length:buffer.length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(rng.next()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    for(let i=0;i<order.length;i+=batchSize){const batch=order.slice(i,i+batchSize).map(j=>buffer[j]);last=lossAndGradient(net,batch,lossOptions);if(last.kl>targetKl*1.5)return {...last,gradient:undefined,updates,earlyStopped:true};adam.step(net.parameters,last.gradient,learningRate);updates++;}
  }
  return {...last,gradient:undefined,updates,earlyStopped:false};
}
module.exports={policySize,Random,Network,Adam,heads,logProbability,lossAndGradient,monteCarloReturns,optimize};
