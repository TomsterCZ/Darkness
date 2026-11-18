#!/usr/bin/env node
/**
 * Render-spec compiler for Darkness levels.
 * node tools/compile_cellar_visual.cjs
 * node tools/compile_cellar_visual.cjs --svg > /tmp/cellar-blueprint.svg
 * node tools/compile_cellar_visual.cjs levels/another-level.json --svg
 */
const fs=require("node:fs");
const path=require("node:path");
const {compile}=require("../assets/js/cellar-visual.js");
const args=process.argv.slice(2),svg=args.includes("--svg");
const file=args.find(a=>!a.startsWith("--"))||"cellar.html";
const source=fs.readFileSync(path.resolve(process.cwd(),file),"utf8");
let level;
if(file.endsWith(".json"))level=JSON.parse(source);
else {
 const match=source.match(/<script id="cellar-level" type="application\/json">([\s\S]*?)<\/script>/);
 if(!match)throw Error("Missing authoritative level JSON in "+file);
 level=JSON.parse(match[1]);
}
const {OX,OY,HW,HH,wallHeight}={OX:600,OY:30,HW:40,HH:20,wallHeight:36};
const spec=compile(level,{OX,OY,HW,HH,wallHeight});
if(!svg) {console.log(JSON.stringify(spec.export(),null,2));process.exit(0);}
const escape=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");
const out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1085 566" width="1085" height="566">',
'<rect width="1085" height="566" fill="#0e0a12"/>',
'<g stroke="#1a101a" stroke-width="1">'];
function pt(x,y){return {x:OX+(y-x)*HW,y:OY+(x+y)*HH};}
const diamond=(x,y)=>{const p=pt(x,y);return [
 [p.x,p.y-HH],[p.x+HW,p.y],[p.x,p.y+HH],[p.x-HW,p.y]
 ].map(p=>p.join(",")).join(" ");};
for(const f of spec.floors)
 out.push('<polygon points="'+diamond(f.x,f.y)+'" fill="#49342f" data-cell="'+f.x+','+f.y+'"/>');
for(const w of spec.walls) {
 const p=pt(w.x,w.y),t=p.y-wallHeight;
 const q=[[p.x,t-HH],[p.x+HW,t],[p.x,t+HH],[p.x-HW,t]]
 .map(z=>z.join(",")).join(" ");
 out.push('<polygon points="'+q+'" fill="#7c5950" data-mask="'+w.mask+'" data-variant="'+escape(w.variant)+'"><title>'+w.x+','+w.y+': '+escape(w.variant)+' mask '+w.mask+'</title></polygon>');
 if(w.visibleLeft)out.push('<polygon points="'+(p.x-HW)+','+t+' '+p.x+','+(t+HH)+' '+p.x+','+(p.y+HH)+' '+(p.x-HW)+','+p.y+'" fill="#423333"/>');
 if(w.visibleRight)out.push('<polygon points="'+p.x+','+(t+HH)+' '+(p.x+HW)+','+t+' '+(p.x+HW)+','+p.y+' '+p.x+','+(p.y+HH)+'" fill="#2b242c"/>');
}
out.push('</g>');
for(const p of level.goals){const q=pt(...p);out.push('<circle cx="'+q.x+'" cy="'+q.y+'" r="10" fill="none" stroke="#dbaa67" stroke-width="3"/>');}
for(const p of level.crates){const q=pt(...p);out.push('<rect x="'+(q.x-15)+'" y="'+(q.y-28)+'" width="30" height="30" rx="2" fill="#a26c3d" stroke="#4d281a" stroke-width="3"/>');}
const start=pt(...level.entry);out.push('<circle cx="'+start.x+'" cy="'+start.y+'" r="9" fill="#ded5c6"/>');
for(const gate of spec.gates){const p=pt(gate.x,gate.y);out.push('<circle cx="'+p.x+'" cy="'+p.y+'" r="16" fill="none" stroke="'+(gate.kind==="N"?"#8bb8dd":"#cf9f74")+'" stroke-width="4"/>');}
out.push('<text x="24" y="546" font-family="monospace" font-size="15" fill="#e0c7a4">AUTHORITATIVE TILE MAP · '+spec.width+'×'+spec.height+' · '+spec.wallCount+' wall cells · '+spec.walkableCount+' floor cells</text>');
out.push('</svg>');
console.log(out.join("\n"));
