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
        // The screen-left face borders the +x (SW) tile. The screen-right
        // face borders the +y (SE) tile; swapping these caused wall seams.
        const visibleLeft=!isWall(x+1,y),visibleRight=!isWall(x,y+1);
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
    function material(name){
      const atlas=images.illustrated;
      if(ready(atlas))return atlas;
      return images.stone;
    }
    function floor(x,y){
      const p=point(x,y),d=diamond(p),v=hash(x,y,7);
      polygon(d,"#30262b");
      if(ready(images.illustrated)){
        // Author-generated hand-painted stone, not a photograph of the
        // previously painted maze. Every sample is confined to floor.
        const sx=v%38,sy=(v>>>9)%45;
        clippedMaterial(d,images.illustrated,[sx,sy,89,76],
          (v%5===0)?"rgba(20,13,24,.12)":null);
      }else if(ready(images.stone)){
        const sx=255+v%49;
        clippedMaterial(d,images.stone,[sx,6,80,40],"rgba(12,7,16,.13)");
      }
      // Only edge joints of paving stones; no second collision blueprint.
      ctx.strokeStyle="rgba(20,11,20,.18)";ctx.lineWidth=.55;path(d);ctx.stroke();
    }
    function wall(x,y){
      const tile=wallByKey.get(key(x,y));if(!tile)return;
      const p=point(x,y),t=p.y-WH;
      const n=[p.x,t-HH],e=[p.x+HW,t],s=[p.x,t+HH],w=[p.x-HW,t];
      const be=[p.x+HW,p.y],bs=[p.x,p.y+HH],bw=[p.x-HW,p.y];
      const L=[w,s,bs,bw],R=[s,e,be,bs],TOP=[n,e,s,w];
      const atlas=images.illustrated,painted=ready(atlas),v=hash(x,y);
      // Continuous masonry: every full one-square wall has ONE visible
      // top. Front faces are drawn only on the exposed (SW, SE) edges.
      // Never draw front faces between two contiguous wall squares.
      if(tile.visibleLeft){
        polygon(L,"#37262d");
        if(painted){
          clippedMaterial(L,atlas,[v%29,128+(v>>>4)%34,90,91],"rgba(6,8,17,.24)");
        }else{
          clippedMaterial(L,images.stone,[230+v%40,180,64,73],"rgba(18,8,17,.18)");
        }
        ctx.strokeStyle="rgba(19,14,19,.42)";ctx.lineWidth=.95;
        ctx.beginPath();ctx.moveTo(...bw);ctx.lineTo(...w);ctx.stroke();
      }
      if(tile.visibleRight){
        polygon(R,"#231c25");
        if(painted){
          clippedMaterial(R,atlas,[128+(v%25),10+(v>>>8)%32,88,76],"rgba(4,7,17,.44)");
        }else{
          clippedMaterial(R,images.stone,[350+v%30,165,75,77],"rgba(8,8,18,.32)");
        }
        ctx.strokeStyle="rgba(13,11,18,.47)";ctx.lineWidth=.95;
        ctx.beginPath();ctx.moveTo(...be);ctx.lineTo(...e);ctx.stroke();
      }
      polygon(TOP,"#60433b");
      if(painted){
        clippedMaterial(TOP,atlas,[128+v%31,(v>>>7)%35,92,78],
          "rgba(22,10,18,.06)");
      }else{
        clippedMaterial(TOP,images.stone,[135+v%120,132,80,40],
          "rgba(19,9,17,.10)");
      }
      // Draw ONLY exterior contour edges, omitting the shared grout
      // line of each adjacent wall square. These strokes join naturally.
      const wallNorth=spec.isWall(x-1,y);
      const wallEast=spec.isWall(x,y+1);
      const wallSouth=spec.isWall(x+1,y);
      const wallWest=spec.isWall(x,y-1);
      const contour=[
        [n,e,!wallNorth],[e,s,!wallEast],
        [s,w,!wallSouth],[w,n,!wallWest]
      ];
      for(const [a,b,exposed] of contour){
        if(!exposed)continue;
        ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);
        ctx.strokeStyle="rgba(17,12,20,.77)";ctx.lineWidth=1.3;ctx.stroke();
      }
      // Beveled top highlights only along genuine visible perimeters.
      for(const [a,b,exposed]of [[w,s,tile.visibleLeft],[s,e,tile.visibleRight]]){
        if(!exposed)continue;
        ctx.beginPath();ctx.moveTo(a[0],a[1]-.6);ctx.lineTo(b[0],b[1]-.6);
        ctx.strokeStyle="rgba(237,163,93,.35)";ctx.lineWidth=.85;ctx.stroke();
      }
      // Rare trailing ivy, painted over only actually exposed masonry.
      if(tile.decor==="moss"&&(tile.visibleLeft||tile.visibleRight)){
        const off=tile.visibleLeft?(-HW*.42):(HW*.42);
        ctx.strokeStyle="#4a4728";ctx.lineWidth=2.1;ctx.lineCap="round";
        for(let j=0;j<4;j++){
          let len=9+(hash(x,y,j)%15),xx=p.x+off+j*3;
          ctx.beginPath();ctx.moveTo(xx,t+HH);
          ctx.lineTo(xx+(j%2?3:-2),t+HH+len*.54);
          ctx.lineTo(xx+(j%2?-1:3),t+HH+len);ctx.stroke();
        }
        ctx.lineCap="butt";
      }
    }
    function backdrop(now=0) {
      const ambient=images.ambient;
      if(ready(ambient))ctx.drawImage(ambient,0,0,projection.logicalWidth||1085,projection.logicalHeight||566);
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
    function gate(x,y,kind,now,openingTime,openState){
      const p=point(x,y);
      const painted=ready(images.illustrated),pan=painted?images.illustrated:null;
      const premium=ready(images.premiumGate)?images.premiumGate:images.gate;
      const fraction=openState?Math.max(0,Math.min(1,(now-openingTime)/(kind==="N"?1000:1150))):0;
      const bw=kind==="N"?94:108,bh=kind==="N"?127:127;
      const bx=p.x-bw/2,by=p.y-bh+9;
      // Illustrated stone ARCH remains fixed across all states. Only the
      // central wooden/iron leaf moves. Its background is transparent,
      // preventing an artificial rectangular wall laid over the corridor.
      if(painted){
        const sx=kind==="N"?128:256;
        ctx.save();
        ctx.drawImage(pan,sx,128,128,128,bx,by,bw,bh);
        if(fraction>0){
          ctx.save();
          const innerLeft=bx+bw*.25,innerW=bw*.50;
          const innerTop=by+bh*.33,innerH=bh*.64;
          ctx.beginPath();
          ctx.moveTo(innerLeft,by+bh*.96);
          ctx.lineTo(innerLeft,innerTop+16);
          ctx.quadraticCurveTo(innerLeft+innerW*.5,innerTop-15,innerLeft+innerW,innerTop+16);
          ctx.lineTo(innerLeft+innerW,by+bh*.96);ctx.closePath();
          ctx.clip();
          ctx.fillStyle="#100b13";
          ctx.fillRect(innerLeft-1,innerTop-18,innerW+2,innerH+18);
          if(fraction<.999){
            if(kind==="N"){
              ctx.save();ctx.translate(innerLeft,0);
              ctx.transform(1-.95*fraction,0,-.06*fraction,1,0,0);
              ctx.drawImage(pan,176,185,32,62,0,innerTop,innerW,innerH);
              ctx.restore();
            }else{
              ctx.save();ctx.translate(0,-fraction*innerH);
              ctx.drawImage(pan,304,174,32,71,innerLeft,innerTop,innerW,innerH);
              ctx.restore();
            }
          }
          ctx.restore();
        }
        ctx.restore();
      }else if(ready(premium)){
        ctx.save();
        const sx=kind==="N"?0:premium.naturalWidth*.50;
        ctx.drawImage(premium,sx,0,premium.naturalWidth*.50,premium.naturalHeight,bx,by,bw,bh);
        // Legacy detailed asset as fallback while high-res texture loads.
        ctx.restore();
      }
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
      const W=projection.logicalWidth||1085,H=projection.logicalHeight||566;
      const vignette=ctx.createRadialGradient(W*.48,H*.42,W*.06,W*.52,H*.48,W*.69);
      vignette.addColorStop(0,"rgba(4,5,10,0)");
      vignette.addColorStop(1,"rgba(3,4,10,.27)");
      ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    }
    return {spec,backdrop,floor,wall,gate,goal,lighting};
  }
  return {compile,createRenderer,hash};
});
