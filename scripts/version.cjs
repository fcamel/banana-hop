'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),packagePath=path.join(root,'package.json'),htmlPath=path.join(root,'dist/index.html');
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')),html=fs.readFileSync(htmlPath,'utf8');
const current=pkg.version,parts=current.split('.').map(Number),label=html.match(/class="game-version">v([^<]+)</)?.[1];
if(!/^\d+\.\d+\.\d+$/.test(current))throw Error(`Invalid package version: ${current}`);
const action=process.argv[2]||'patch';
if(action==='--check'){
  if(label!==current)throw Error(`Menu v${label} does not match package ${current}`);
  console.log(`Version consistent: v${current}`);
}else{
  let next;
  if(action==='patch')next=`${parts[0]}.${parts[1]}.${parts[2]+1}`;
  else if(action==='minor')next=`${parts[0]}.${parts[1]+1}.0`;
  else if(action==='major')next=`${parts[0]+1}.0.0`;
  else if(/^\d+\.\d+\.\d+$/.test(action))next=action;
  else throw Error('Use patch, minor, major, an exact x.y.z version, or --check');
  if(!label)throw Error('Main menu version label not found');
  for(const name of ['style.css','boss.js','surf.js','game.js'])if(!html.includes(name+'?v='))throw Error(`Missing cache key: ${name}`);
  const updated=html.replace(/(class="game-version">)v[^<]+/,`$1v${next}`).replace(/(style\.css|boss\.js|surf\.js|game\.js)\?v=[^"\s]+/g,`$1?v=${next}`);
  pkg.version=next;fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n');fs.writeFileSync(htmlPath,updated);
  console.log(`Version updated: ${current} -> ${next} (no commit, tag, push or deploy)`);
}
