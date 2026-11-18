/**
 * Regression test for the exact visual/gameplay cellar tilemap.
 * Run: node tools/test_cellar_grid.mjs
 *
 * Each occupied square is one wall; neither player nor crates may enter it.
 * The illustrative background is decoration, never a second collision map.
 */
import fs from "node:fs";
import assert from "node:assert/strict";
const html=fs.readFileSync(new URL("../cellar.html",import.meta.url),"utf8");
const text=html.match(/<script id="cellar-level" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
assert.ok(text,"Missing authoritative tilemap");
const L=JSON.parse(text);
assert.equal(L.tiles.length,11);
assert.ok(L.tiles.every(row=>row.length===13));
assert.equal(L.crates.length,4);
assert.equal(L.goals.length,4);
const K=(p)=>p.join(",");
const D=[[1,0],[-1,0],[0,1],[0,-1]];
const add=(a,d)=>[a[0]+d[0],a[1]+d[1]];
const tile=(p)=>L.tiles[p[1]]?.[p[0]];
const playable=(p)=>!!tile(p)&&tile(p)!=="#";
for(const p of [L.entry,L.northernGate,L.southernGate,L.southLanding,...L.crates,...L.goals])
 assert.ok(playable(p),"Object placed into a wall: "+K(p));
const flood=(start,crates)=>{
 const block=new Set(crates.map(K)),seen=new Set([K(start)]),q=[start];
 for(const p of q)for(const d of D){const n=add(p,d),k=K(n);
  if(playable(n)&&!block.has(k)&&!seen.has(k)){q.push(n);seen.add(k);}}
 return seen;
};
function shortestWalk(start,end,crates){
 const k=K(start),goal=K(end),via=new Map([[k,null]]),q=[start],block=new Set(crates.map(K));
 for(const p of q)for(const d of D){
  if(via.has(goal))break;
  const n=add(p,d),key=K(n);
  if(!playable(n)||block.has(key)||via.has(key))continue;
  via.set(key,{prev:K(p),d});q.push(n);
 }
 if(!via.has(goal))return null;
 const moves=[];for(let cur=goal;cur!==k;){const v=via.get(cur);moves.push(v.d);cur=v.prev;}return moves.reverse();
}
// Verified reversible scramble: all four crates participate; unlike the old
// brittle map, the solution does not rely on entering wall squares.
const plan=[
[[10,8],[10,7],[0,-1],[10,9]],[[8,7],[8,8],[0,1],[8,6]],
[[10,7],[10,6],[0,-1],[10,8]],[[6,7],[6,8],[0,1],[6,6]],
[[4,8],[3,8],[-1,0],[5,8]],[[8,8],[7,8],[-1,0],[9,8]],
[[3,8],[2,8],[-1,0],[4,8]],[[6,8],[6,7],[0,-1],[6,9]],
[[7,8],[8,8],[1,0],[6,8]],[[10,6],[10,5],[0,-1],[10,7]],
[[6,7],[6,8],[0,1],[6,6]],[[6,8],[5,8],[-1,0],[7,8]],
[[2,8],[3,8],[1,0],[1,8]],[[10,5],[10,6],[0,1],[10,4]],
[[8,8],[7,8],[-1,0],[9,8]],[[10,6],[9,6],[-1,0],[11,6]],
[[5,8],[5,7],[0,-1],[5,9]],[[3,8],[3,7],[0,-1],[3,9]],
[[7,8],[7,7],[0,-1],[7,9]],[[9,6],[9,7],[0,1],[9,5]]
];
let hero=L.entry,crates=L.crates.map(p=>[...p]),walks=0;
for(const [before,after,d,stand]of plan){
 const index=crates.findIndex(p=>K(p)===K(before));
 assert.notEqual(index,-1,"Wrong box location");
 const route=shortestWalk(hero,stand,crates);
 assert.notEqual(route,null,"Walk to box support blocked");
 for(const move of route){hero=add(hero,move);walks++;assert.ok(playable(hero),"Walk through wall");}
 assert.equal(K(hero),K(stand));
 assert.equal(K(add(before,d)),K(after));
 assert.ok(playable(after),"Push into wall");
 assert.ok(!crates.some((b,i)=>i!==index&&K(b)===K(after)),"Push into crate");
 crates[index]=after;hero=before;
}
assert.deepEqual(crates.map(K).sort(),L.goals.map(K).sort(),"Puzzle not solved");
assert.ok(walks>=50,"Puzzle unexpectedly trivial");
for(const p of [L.southernGate,L.southLanding,[1,9],L.northernGate]){
 const route=shortestWalk(hero,p,crates);
 assert.notEqual(route,null,"Gate not connected: "+K(p));
 hero=p;
}
assert.equal(K(L.northernGate),"0,9");
assert.equal(K(L.southernGate),"12,9");
assert.ok(!html.includes("cellar_single_scene.jpg"),"Old painted maze used as floor texture");
assert.ok(html.includes("drawWall(e.x,e.y)"),"Walls not rendered from grid");
console.log("PASS:",L.tiles.length+"x"+L.tiles[0].length,"grid,",plan.length,"pushes,",walks,"walking steps, gates reachable, no blocked tiles");
