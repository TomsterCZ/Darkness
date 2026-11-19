/* Darkness registered-illustration runtime.
 *
 * The authored picture is static. Movement and collisions remain in cellar.html.
 * Never activate an unverified image or infer wall positions from its pixels.
 * Registered art supplies one full-room illustration plus transparent wall
 * occlusion bands, ensuring player/crate depth sorting stays exact.
 */
(function(root,factory){
  const api=factory();root.DarknessIllustrated=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis,()=>{
"use strict";
const REQUIRED=["tiles","entry","crates","goals","northernGate","southernGate","southLanding"];
function canonicalLevel(level){
 const o={};for(const key of REQUIRED)o[key]=level[key]??null;
 return o;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function image(uri){
 return new Promise((resolve,reject)=>{
  const im=new Image();
  im.onload=()=>resolve(im);im.onerror=()=>reject(Error("Illustration missing: "+uri));
  im.src=uri;
 });
}
function check(manifest,level,projection){
 if(!manifest||manifest.schema!==1||manifest.status!=="geometry-validated"||manifest.manual_review_status!=="approved")
  throw Error("Illustration not independently geometry-validated and visually approved");
 if(!same(manifest.level,canonicalLevel(level)))
  throw Error("Illustration belongs to a DIFFERENT gameplay blueprint");
 if(!same(manifest.canvas,[2170,1132]))
  throw Error("Registered scene must be 2170x1132");
 const p=manifest.projection;
 if(!p||p.ox!==projection.OX||p.oy!==projection.OY||p.hw!==projection.HW||
      p.hh!==projection.HH||p.h!==projection.wallHeight||p.scale!==2)
  throw Error("Illustration projection does not match the game");
 if(!Array.isArray(manifest.occlusion_layers)||!manifest.occlusion_layers.length)
  throw Error("Registered art requires depth-sorted stone occlusion masks");
 if(!manifest.scene_file||!manifest.gates||!manifest.gates.N||!manifest.gates.S)
  throw Error("Registered art needs a full illustrated scene and BOTH animated gate states");
}
async function loadRegistered(level,projection,base="assets/scene/registered/"){
 const response=await fetch(base+"manifest.json",{cache:"no-cache"});
 if(!response.ok)throw Error("No registered scene manifest");
 const m=await response.json();
 check(m,level,projection);
 const [scene,occluders,gateFrames]=await Promise.all([
  image(base+m.scene_file),
  Promise.all(m.occlusion_layers.map(async entry=>{
   const im=await image(base+entry.file);
   const [x0,y0,x1,y1]=entry.bounds;
   if(x1<=x0||y1<=y0||im.naturalWidth!==x1-x0||im.naturalHeight!==y1-y0)
    throw Error("Wall-depth mask does not fit "+entry.file);
   return {...entry,image:im};
  })),
  Promise.all(["N","S"].map(async key=>{
   const cfg=m.gates[key];
   if(!Array.isArray(cfg.rect)||cfg.rect.length!==4||!cfg.closed||!cfg.open)
    throw Error("Incomplete authored gate overlay "+key);
   return [key,{...cfg,closedImage:await image(base+cfg.closed),openImage:await image(base+cfg.open)}];
  }))
 ]);
 const gates=Object.fromEntries(gateFrames);
 const masks=new Map();
 for(const o of occluders){
  if(!masks.has(o.depth))masks.set(o.depth,[]);
  masks.get(o.depth).push(o);
 }
 return {
  ready:true,manifest:m,level,projection,
  backdrop(ctx,W,H){ctx.drawImage(scene,0,0,W,H);},
  // Draw ONLY when the corresponding logical wall passes in depth order.
  // Static scene already contains all masonry; this re-paints the same
  // image pixels in front of moving sprites where geometry requires.
  occlude(ctx,depth){
   for(const o of masks.get(depth)||[]){
    const [x0,y0,x1,y1]=o.bounds;
    ctx.drawImage(o.image,x0/2,y0/2,(x1-x0)/2,(y1-y0)/2);
   }
  },
  gate(ctx,kind,now,opened,started){
   const c=gates[kind],rect=c.rect;
   const duration=c.duration||900;
   const t=opened?Math.min(1,Math.max(0,(now-started)/duration)):0;
   ctx.save();
   if(t<1){ctx.globalAlpha=1-t;ctx.drawImage(c.closedImage,...rect);}
   if(t>0){ctx.globalAlpha=t;ctx.drawImage(c.openImage,...rect);}
   ctx.restore();
  }
 };
}
return {canonicalLevel,check,loadRegistered};
});