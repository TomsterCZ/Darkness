/* Regression: image art must NOT modify or silently replace the puzzle. */
const fs=require('node:fs'), assert=require('node:assert/strict');
const {check,canonicalLevel}=require('../assets/js/cellar-registered.js');
const html=fs.readFileSync('cellar.html','utf8');
const raw=html.match(/<script id="cellar-level" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(raw);
const level=JSON.parse(raw[1]);
const p={OX:600,OY:30,HW:40,HH:20,wallHeight:36};
const pending=JSON.parse(fs.readFileSync('assets/scene/registered/manifest.json','utf8'));
assert.throws(()=>check(pending,level,p),/approved/);
const approved=JSON.parse(JSON.stringify(pending));
approved.status='geometry-validated';
approved.manual_review_status='approved';
approved.scene_file='illustrated-scene.png';
approved.occlusion_layers=[{depth:1,file:'occlusion-01.png',bounds:[100,100,110,110]}];
approved.gates={N:{rect:[900,90,120,140],closed:'n-closed.png',open:'n-open.png'},
                S:{rect:[420,330,120,140],closed:'s-closed.png',open:'s-open.png'}};
assert.deepEqual(canonicalLevel(level),approved.level);
assert.doesNotThrow(()=>check(approved,level,p));
const wrong=JSON.parse(JSON.stringify(level));
wrong.tiles[2]=wrong.tiles[2].slice(0,1)+'#'+wrong.tiles[2].slice(2);
assert.throws(()=>check(approved,wrong,p),/DIFFERENT gameplay blueprint/);
assert.throws(()=>check(approved,level,{...p,OX:p.OX+40}),/projection/);
assert.throws(()=>check({...approved,canvas:[1085,566]},level,p),/2170x1132/);
assert.throws(()=>check({...approved,occlusion_layers:[]},level,p),/occlusion/);
console.log('PASS: registered-scene validation rejects missing approval, wrong walls, incorrect perspective, small images and missing wall masks');
