'use strict';
const {choose,decode,estimate,actionForChoice}=require('./visible-baseline.cjs');
function restricted(context,skill,direction){return {...context,skills:context.skills.map((on,i)=>on&&i===skill),parameters:context.parameters.map((p,i)=>i!==skill?p:{...p,direction:p.direction.map((on,d)=>on&&(direction===undefined||d===direction))})};}
function inspect(features,context){
 const view=decode(features),full=choose(features,context,0),move=choose(features,restricted(context,0),0),jet=choose(features,restricted(context,6),0),sameMove=choose(features,restricted(context,0,jet.choice[1]),0);
 const risk=choice=>{const a=actionForChoice(view,choice);return estimate(view,{x:a.x*205,y:a.y*205},a.jump).risk;};
 return {chosen:full.choice,move:{choice:move.choice,score:move.score,risk:risk(move.choice)},jet:{choice:jet.choice,score:jet.score,risk:risk(jet.choice)},sameDirectionMove:{score:sameMove.score,risk:risk(sameMove.choice)},scoreDifference:jet.score-sameMove.score};
}
module.exports={restricted,inspect};
