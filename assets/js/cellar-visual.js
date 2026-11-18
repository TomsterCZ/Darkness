/* Darkness visual compiler + painter
 * The ASCII level is authoritative. Rendering does not change collision,
 * walkability, crate positions or puzzle rules.
 * Shared by the game and the standalone map compiler / test tools.
 */
(function (root, factory) {
  const api = factory();
  root.DungeonVisual = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const CARDINAL = Object.freeze([[0,-1],[1,0],[0,1],[-1,0]]);
  const WALL = "#";
  const key = (x,y) => x + "," + y;
  const hash = (x,y,salt=0) => {
    let h = (Math.imul(x + 23, 92821) ^ Math.imul(y + 79, 68917) ^ Math.imul(salt + 19, 12853)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return (h ^ (h >>> 15)) >>> 0;
  };
  function compile(level, projection={OX:600, OY:30, HW:40, HH:20, wallHeight:34}) {
    const rows = level.tiles || [];
    if (!rows.length || rows.some(r=>r.length!==rows[0].length))
      throw Error("Level needs a rectangular tile grid");
    const width=rows[0].length,height=rows.length;
    const inBounds=(x,y)=>x>=0&&y>=0&&x<width&&y<height;
    const tile=(x,y)=>inBounds(x,y)?rows[y][x]:null;
    const isWall=(x,y)=>tile(x,y)===WALL;
    const walkable=(x,y)=>tile(x,y)!==null && !isWall(x,y);
    const walls=[],floors=[],gates=[],drawOrder=[],wallSet=new Set(),faces={left:0,right:0};
    const topology={end:0,straight:0,corner:0,tee:0,cross:0,isolated:0};
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const ch=tile(x,y),depth=x+y,pos={x,y,depth};
      if(ch===WALL) {
        const neighbor=CARDINAL.map(([dx,dy])=>isWall(x+dx,y+dy));
        // NESW. Out-of-bounds is exposed, never secretly walkable.
        const mask=neighbor.reduce((n,yes,i)=>n|(yes?(1<<i):0),0);
        const neighbors=neighbor.filter(Boolean).length;
        let variant=neighbors===0?"isolated":neighbors===1?"end":neighbors===2?(mask===5||mask===10?"straight":"corner"):neighbors===3?"tee":"cross";
        topology[variant]++;
        const visibleLeft=!isWall(x,y+1),visibleRight=!isWall(x+1,y);
        if(visibleLeft)faces.left++;
        if(visibleRight)faces.right++;
        const entry={...pos,mask,variant,visibleLeft,visibleRight,decor:hash(x,y)%17===0?"moss":null};
        walls.push(entry);drawOrder.push({...entry,type:"wall"});wallSet.add(key(x,y));
      }else if(ch!==null) {
        const tileInfo={...pos,type:ch==="N"||ch==="S"?"gate":"floor",kind:ch};
        floors.push(tileInfo);
        if(tileInfo.type==="gate")gates.push(tileInfo);
        if(tileInfo.type==="gate")drawOrder.push(tileInfo);
      }
    }
    const points=[level.entry,...(level.crates||[]),...(level.goals||[]),level.northernGate,level.southernGate,level.southLanding].filter(Boolean);
    for(const [x,y] of points)if(!walkable(x,y))throw Error("Entity occupies a wall at "+key(x,y));
    if(level.crates?.length!==level.goals?.length)throw Error("Crate / goal count mismatch");
    drawOrder.sort((a,b)=>a.depth-b.depth||a.y-b.y||a.x-b.x);
    return {
      version:2, width,height,projection, levelId:level.id||"cellar",
      walls,floors,gates,drawOrder,topology,visibleFaces:faces,
      walkableCount:floors.length,wallCount:walls.length,
      isWall,walkable,wallSet,
      project(x,y){return {x:projection.OX+(y-x)*projection.HW,y:projection.OY+(x+y)*projection.HH}},
      // For tools / diagnostics, no generated texture changes the collision grid.
      export(){
        return {version:2,id:level.id||"cellar",width,height,wallCount:walls.length,
          walkableCount:floors.length,topology,visibleFaces:faces,
          walls:walls.map(({x,y,mask,variant,visibleLeft,visibleRight,decor})=>({x,y,mask,variant,visibleLeft,visibleRight,decor})),
          gates:gates.map(({x,y,kind})=>({x,y,kind}))};
      }
    };
  }

  function createRenderer(ctx, level, images, projection) {
    const spec=compile(level,projection),{HW,HH,wallHeight:WH}=projection;
    const ready=im=>Boolean(im&&im.complete&&im.naturalWidth>0);
    const point=(x,y)=>spec.project(x,y);
    let wallByKey=new Map(spec.walls.map(w=>[key(w.x,w.y),w]));
    let staticFloor=null, lastFloorStamp="", lightStrength=1;
    const diamond = p => [[p.x,p.y-HH],[p.x+HW,p.y],[p.x,p.y+HH],[p.x-HW,p.y]];
    function path(pts) {
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
      for(let j=1;j<pts.length;j++)ctx.lineTo(pts[j][0],pts[j][1]);
      ctx.closePath();
    }
    function polygon(pts,fill,stroke=null,line=1){
      path(pts);ctx.fillStyle=fill;ctx.fill();
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
    }
    function clippedMaterial(pts, img, source, shade=null) {
      const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      const bx=Math.min(...xs),by=Math.min(...ys),bw=Math.max(...xs)-bx,bh=Math.max(...ys)-by;
      ctx.save();path(pts);ctx.clip();
      if(ready(img)){
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(img,...source,bx,by,bw,bh);
      }
      if(shade){ctx.fillStyle=shade;ctx.fillRect(bx,by,bw,bh);}
      ctx.restore();
    }
    function floor(x,y){
      const p=point(x,y),d=diamond(p),n=hash(x,y,7);
      polygon(d, n%4===0?"#34292b":"#372a2b");
      const src=images.stone||images.floor;
      if(ready(src)) {
        // Guaranteed clean: source rectangle in the north-east floor
        // section of cellar_stone_atlas.jpg (no wall pixels).
        const sx=250+n%70, sy=4+(n>>>9)%22;
        clippedMaterial(d,src,[sx,sy,80,40],n%7===0?"rgba(45,24,24,.12)":null);
      }
      ctx.strokeStyle="rgba(20,15,19,.30)";ctx.lineWidth=.65;path(d);ctx.stroke();
      if(n%19===3){
        ctx.fillStyle="rgba(184,123,75,.11)";
        ctx.fillRect(Math.round(p.x)-3,Math.round(p.y)-1,2,1);
        ctx.fillRect(Math.round(p.x)+4,Math.round(p.y)+2,1,1);
      }
    }
    function wall(x,y) {
      const tile=wallByKey.get(key(x,y));if(!tile)return;
      const p=point(x,y),t=p.y-WH;
      const n=[p.x,t-HH],e=[p.x+HW,t],s=[p.x,t+HH],w=[p.x-HW,t];
      const be=[p.x+HW,p.y],bs=[p.x,p.y+HH],bw=[p.x-HW,p.y];
      const stone=images.stone,nv=hash(x,y);
      const L=[w,s,bs,bw],R=[s,e,be,bs],TOP=[n,e,s,w];
      // Wall faces are rendered only when exposed toward the viewer.
      // A neighbor wall occupies its own complete square; no overlapping
      // visual mask or fake extra floor-plane geometry.
      if(tile.visibleLeft){
        polygon(L,"#312329");
        clippedMaterial(L,stone,[235+(nv%56),193,58,59],"rgba(21,11,20,.14)");
        ctx.strokeStyle="rgba(19,13,17,.55)";ctx.lineWidth=1;path(L);ctx.stroke();
      }
      if(tile.visibleRight){
        polygon(R,"#241f26");
        clippedMaterial(R,stone,[382+(nv%26),174,52,67],"rgba(8,11,20,.23)");
        ctx.strokeStyle="rgba(16,11,18,.63)";ctx.lineWidth=1;path(R);ctx.stroke();
      }
      polygon(TOP,"#5f4943");
      clippedMaterial(TOP,stone,[135+(nv%170),132,80,40],"rgba(78,48,41,.08)");
      // Quiet stone joints. Runs share the same dimensions and depth.
      ctx.strokeStyle="rgba(26,16,24,.70)";ctx.lineWidth=1.3;path(TOP);ctx.stroke();
      if(tile.visibleLeft){ctx.strokeStyle="rgba(221,158,95,.27)";ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(...w);ctx.lineTo(...s);ctx.stroke();}
      if(tile.visibleRight){ctx.strokeStyle="rgba(205,153,95,.22)";ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(...s);ctx.lineTo(...e);ctx.stroke();}
      if(tile.decor==="moss" && (tile.visibleLeft||tile.visibleRight)){
        const side=tile.visibleLeft?-1:1;
        ctx.lineCap="round";ctx.lineWidth=2.3;ctx.strokeStyle="rgba(74,73,35,.83)";
        const xx=p.x+side*(HW*.38);
        for(let a=0;a<3;a++){
          const length=10+(hash(x,y,a)%19);
          ctx.beginPath();ctx.moveTo(xx+a*4,t+HH-3);ctx.lineTo(xx+a*4-2,t+HH+length/2);
          ctx.lineTo(xx+a*4+1,t+HH+length);ctx.stroke();
        }
        ctx.lineCap="butt";
      }
    }
    function backdrop(now=0) {
      const ambient=images.ambient;
      if(ready(ambient))ctx.drawImage(ambient,0,0,ctx.canvas.width,ctx.canvas.height);
      else {ctx.fillStyle="#0c0b12";ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}
      // Warm torches already belong to the original illustrated background.
      // Add a tiny animated glow that connects them to the playable stone.
      const flicker=.94+.06*Math.sin(now*.0039);
      for(const [x,y,r,alpha] of [[172,208,205,.075],[650,95,250,.056],[940,175,180,.027]]) {
        let g=ctx.createRadialGradient(x,y,1,x,y,r);
        g.addColorStop(0,"rgba(255,153,75,"+(alpha*flicker)+")");
        g.addColorStop(1,"rgba(255,136,68,0)");
        ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
    }
    function gate(x,y,kind,now,openingTime,openState) {
      const p=point(x,y);
      const premium=ready(images.premiumGate)?images.premiumGate:images.gate;
      const deluxe=ready(images.premiumGate);
      const fraction=openState ? Math.min(1,Math.max(0,(now-openingTime)/(kind==="N"?1000:1150))) : 0;
      const bx=p.x-39,by=p.y-94,bw=78,bh=94;
      // A single actual doorway tile, not a solid block hidden underneath.
      // Use the original illustrated wooden door / iron portcullis artwork.
      ctx.save();
      ctx.fillStyle="#09090e";
      const opening=[[p.x-27,p.y],[p.x-27,p.y-61],[p.x-17,p.y-77],[p.x,p.y-84],
        [p.x+17,p.y-77],[p.x+27,p.y-61],[p.x+27,p.y]];
      polygon(opening,"#0b0b11");
      if(ready(premium)){
        const sx=kind==="N"?0:premium.naturalWidth*.50, sw=premium.naturalWidth*.5;
        ctx.imageSmoothingEnabled=false;
        // Source carries its OWN hand-drawn arch, stones and metalwork.
        // No procedural second arch is superimposed on it.
        ctx.drawImage(premium,sx,0,sw,premium.naturalHeight,bx,by,bw,bh);
        if(fraction>0){
          // Only the inner leaf is removed, leaving original stone voussoirs
          // and jambs completely unchanged in both states.
          ctx.save();
          const inner={x:p.x-24,y:p.y-73,w:48,h:73};
          ctx.beginPath();ctx.rect(inner.x,inner.y,inner.w,inner.h);ctx.clip();
          ctx.fillStyle="#0b0c13";ctx.fillRect(inner.x,inner.y,inner.w,inner.h);
          if(fraction<1){
            if(kind==="S"){
              ctx.save();ctx.translate(0,-fraction*79);
              ctx.drawImage(premium,sx+sw*.21,premium.naturalHeight*.16,sw*.58,premium.naturalHeight*.78,inner.x,inner.y,inner.w,inner.h);
              ctx.restore();
            }else{
              ctx.save();ctx.translate(inner.x,0);
              ctx.transform(1-.94*fraction,0,-.055*fraction,1,0,0);
              ctx.drawImage(premium,sx+sw*.20,premium.naturalHeight*.17,sw*.60,premium.naturalHeight*.77,0,inner.y,inner.w,inner.h);
              ctx.restore();
            }
          }
          ctx.restore();
        }
      }else {
        ctx.fillStyle="#513729";ctx.fillRect(p.x-18,p.y-67,36,67);
      }
      ctx.restore();
    }
    function goal(x,y,occupied) {
      const p=point(x,y);
      ctx.save();
      ctx.globalAlpha=occupied?.88:.63;
      polygon([[p.x,p.y-12],[p.x+21,p.y],[p.x,p.y+12],[p.x-21,p.y]],
        "#50352b","rgba(222,159,91,.80)",1.5);
      ctx.strokeStyle=occupied?"#eac58b":"#bb8f56";ctx.lineWidth=1.3;
      ctx.beginPath();ctx.moveTo(p.x,p.y-8);ctx.lineTo(p.x+13,p.y);
      ctx.lineTo(p.x,p.y+8);ctx.lineTo(p.x-13,p.y);ctx.closePath();ctx.stroke();
      ctx.fillStyle="#eac085";ctx.fillRect(Math.round(p.x)-2,Math.round(p.y)-2,4,4);
      ctx.restore();
    }
    function lighting() {
      // A single subtle final exposure pass, not another geometry layer.
      const W=ctx.canvas.width,H=ctx.canvas.height;
      const vignette=ctx.createRadialGradient(W*.48,H*.42,W*.06,W*.52,H*.48,W*.69);
      vignette.addColorStop(0,"rgba(4,5,10,0)");
      vignette.addColorStop(1,"rgba(3,4,10,.27)");
      ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    }
    return {spec,backdrop,floor,wall,gate,goal,lighting};
  }
  return {compile,createRenderer,hash};
});
