#!/usr/bin/env node
// Node-only regression checks for the reusable visual compiler.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {compile,createRenderer}=require("../assets/js/cellar-visual.js");
const source=fs.readFileSync("cellar.html","utf8");
const m=source.match(/<script id="cellar-level" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(m,"Missing gameplay blueprint");
const level=JSON.parse(m[1]);
const pr={OX:600,OY:30,HW:40,HH:20,wallHeight:36};
const spec=compile(level,pr);
const truth=new Set();
for(let y=0;y<level.tiles.length;y++)for(let x=0;x<level.tiles[y].length;x++)
 if(level.tiles[y][x]==="#")truth.add(x+","+y);
assert.equal(spec.wallCount,truth.size);
assert.equal(spec.walkableCount,level.tiles.length*level.tiles[0].length-truth.size);
assert.equal(spec.drawOrder.filter(x=>x.type==="wall").length,spec.wallCount);
const K=(x,y)=>x+","+y;
for(const wall of spec.walls) {
 assert.ok(truth.has(K(wall.x,wall.y)),"Orphan painted wall");
 assert.equal(wall.visibleLeft,!truth.has(K(wall.x,wall.y+1)));
 assert.equal(wall.visibleRight,!truth.has(K(wall.x+1,wall.y)));
 assert.equal(wall.mask & 1,truth.has(K(wall.x,wall.y-1))?1:0);
 assert.equal(Boolean(wall.mask & 2),truth.has(K(wall.x+1,wall.y)));
 assert.equal(Boolean(wall.mask & 4),truth.has(K(wall.x,wall.y+1)));
 assert.equal(Boolean(wall.mask & 8),truth.has(K(wall.x-1,wall.y)));
}
assert.deepEqual(spec.gates.map(x=>x.kind).sort(),["N","S"]);
for(const p of [level.entry,...level.crates,...level.goals,level.southLanding]) {
 assert.ok(spec.walkable(...p),"Entity on visually solid wall");
}
const html=fs.readFileSync("cellar.html","utf8");
assert.ok(html.includes('src="assets/js/cellar-visual.js"'),"Renderer is not loaded");
assert.ok(html.includes("skin.wall(x,y)"),"Old wall painter still in use");
assert.ok(html.includes("skin.gate(x,y,kind"),"Old gate painter still in use");
assert.ok(html.includes('assets/props/dungeon_gate_art_v2.webp'),"Deluxe gate artwork not restored");
assert.ok(!html.includes("cellar_single_scene.jpg"),"Old painted blueprint is layered on top");
const noop=()=>{},gradient=()=>({addColorStop:noop});
const canvas={width:1085,height:566};
const ctx=new Proxy({canvas}, {get(t,k) {
 if(k in t)return t[k];
 if(k==="createLinearGradient"||k==="createRadialGradient")return gradient;
 return noop;
},set(t,k,v){t[k]=v;return true}});
const img={complete:true,naturalWidth:512,naturalHeight:256};
const pics={stone:img,ambient:img,premiumGate:img};
const render=createRenderer(ctx,level,pics,pr);
render.backdrop(1000);
for(const f of spec.floors)render.floor(f.x,f.y);
for(const w of spec.walls)render.wall(w.x,w.y);
for(const q of spec.gates) {
 render.gate(q.x,q.y,q.kind,1800,1000,false);
 render.gate(q.x,q.y,q.kind,1800,1000,true);
}
for(const goal of level.goals)render.goal(...goal,false);
render.lighting();
assert.deepEqual(render.spec.export(),spec.export());
console.log("PASS: visual grammar",spec.wallCount,"wall tiles,",
 spec.visibleFaces.left+spec.visibleFaces.right,"exposed wall faces,",
 spec.gates.length,"gates, no geometry overlap");
