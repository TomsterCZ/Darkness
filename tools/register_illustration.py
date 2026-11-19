#!/usr/bin/env python3
"""REGISTER only geometry-accurate, independently checked illustrated scenes.

First generate an image-conditioning reference:
  python tools/register_illustration.py --level cellar.html --out art/reference

Then draw an image of the SAME 2170x1132 map with NO crates or character,
trace its wall silhouette separately, and use --scene and --wall-mask.
An unverified image must never be silently substituted for the gameplay map.
"""
import argparse, json, re, hashlib
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
SIZE=(2170,1132)
FIELDS=("tiles","entry","crates","goals","northernGate","southernGate","southLanding")

def read(path):
    s=Path(path).read_text("utf-8")
    if str(path).endswith(".json"):return json.loads(s)
    m=re.search(r'<script id="cellar-level" type="application/json">(.*?)</script>',s,re.S)
    if not m:raise ValueError("Missing canonical cellar-level JSON")
    return json.loads(m.group(1))

def project(level):
    opts=level.get("render",{})
    p=dict(ox=float(opts.get("ox",600)),oy=float(opts.get("oy",30)),
           hw=float(opts.get("halfWidth",40)),hh=float(opts.get("halfHeight",20)),
           h=float(opts.get("wallHeight",36)),scale=2)
    def point(x,y):return p["ox"]+(y-x)*p["hw"],p["oy"]+(x+y)*p["hh"]
    return p,point

def geometry(level):
    rows=level["tiles"]
    if not rows or any(len(row)!=len(rows[0]) for row in rows):
        raise ValueError("Level must be rectangular")
    p,point=project(level)
    def wall(x,y):return 0<=y<len(rows) and 0<=x<len(rows[0]) and rows[y][x]=="#"
    def px(q):return [(round(x*2),round(y*2)) for x,y in q]
    tiles=[]
    for y,row in enumerate(rows):
      for x,v in enumerate(row):
        cx,cy=point(x,y);hw,hh,h=p["hw"],p["hh"],p["h"]
        tiles.append(dict(x=x,y=y,kind=v,depth=x+y,
          floor=px([(cx,cy-hh),(cx+hw,cy),(cx,cy+hh),(cx-hw,cy)]),
          top=px([(cx,cy-h-hh),(cx+hw,cy-h),(cx,cy-h+hh),(cx-hw,cy-h)]),
          left=px([(cx-hw,cy-h),(cx,cy-h+hh),(cx,cy+hh),(cx-hw,cy)]),
          right=px([(cx,cy-h+hh),(cx+hw,cy-h),(cx+hw,cy),(cx,cy+hh)]),
          expose_left=not wall(x+1,y),expose_right=not wall(x,y+1)))
    return p,tiles

def masks(tiles):
    wallmask=Image.new("L",SIZE,0)
    all_layers=defaultdict(lambda:Image.new("L",SIZE,0))
    for c in tiles:
      if c["kind"]!="#":continue
      polys=[c["top"]]
      if c["expose_left"]:polys.append(c["left"])
      if c["expose_right"]:polys.append(c["right"])
      for poly in polys:
        ImageDraw.Draw(wallmask).polygon(poly,fill=255)
        ImageDraw.Draw(all_layers[c["depth"]]).polygon(poly,fill=255)
    return wallmask,all_layers

def alignment(reference,artist):
    if artist.size!=SIZE:raise ValueError("Artist wall mask must be exactly 2170x1132")
    a=reference.point(lambda v:255 if v>=128 else 0)
    b=artist.convert("L").point(lambda v:255 if v>=128 else 0)
    na=a.histogram()[255];nb=b.histogram()[255]
    intersection=ImageChops.multiply(a,b).histogram()[255]
    return dict(iou=round(intersection/max(1,na+nb-intersection),5),
                precision=round(intersection/max(1,nb),5),
                recall=round(intersection/max(1,na),5))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--level",type=Path,default=Path("cellar.html"))
    parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--scene",type=Path)
    parser.add_argument("--wall-mask",type=Path)
    parser.add_argument("--north-closed",type=Path)
    parser.add_argument("--north-open",type=Path)
    parser.add_argument("--south-closed",type=Path)
    parser.add_argument("--south-open",type=Path)
    parser.add_argument("--approve-art",action="store_true",
                        help="Manual assertion: no crates/hero/goal art is baked in")
    parser.add_argument("--preview",action="store_true")
    opt=parser.parse_args()
    opt.out.mkdir(parents=True,exist_ok=True)
    level=read(opt.level);projection,tiles=geometry(level)
    walls,depth=masks(tiles)
    reference=Image.new("RGB",SIZE,(11,10,17))
    d=ImageDraw.Draw(reference)
    for t in sorted(tiles,key=lambda q:q["depth"]):
      if t["kind"]=="#":
        if t["expose_left"]:d.polygon(t["left"],fill=(58,41,47))
        if t["expose_right"]:d.polygon(t["right"],fill=(38,29,42))
        d.polygon(t["top"],fill=(130,89,74),outline=(40,27,34),width=2)
      else:d.polygon(t["floor"],fill=(53,40,46),outline=(93,65,63))
    for t in tiles:
      if t["kind"] in ("N","S","E"):
        d.polygon(t["floor"],fill={"N":(83,153,209),"S":(211,142,85),"E":(122,168,130)}[t["kind"]])
    walls.save(opt.out/"expected-wall-mask.png")
    reference.save(opt.out/"blueprint-reference.png")
    world={k:level.get(k) for k in FIELDS}
    fingerprint=hashlib.sha256(json.dumps(dict(world=world,projection=projection),
      sort_keys=True,separators=(",",":")).encode()).hexdigest()
    manifest=dict(schema=1,status="reference-only",manual_review_status="pending",
                  canvas=list(SIZE),projection=projection,level=world,
                  level_geometry_sha256=fingerprint)
    if opt.scene:
      scene=Image.open(opt.scene).convert("RGBA")
      if scene.size!=SIZE:raise ValueError("Art must be natively authored in 2170x1132")
      if not opt.wall_mask and not opt.preview:raise ValueError("Independent --wall-mask required")
      if opt.wall_mask:
        score=alignment(walls,Image.open(opt.wall_mask))
        manifest["alignment"]=score
        if score["iou"]<.965 or score["precision"]<.98 or score["recall"]<.98:
          raise ValueError("Illustration DOES NOT match the puzzle: "+str(score))
        manifest["status"]="geometry-validated"
      else:manifest["status"]="preview-unverified"
      if opt.approve_art:
        if manifest["status"]!="geometry-validated":raise ValueError("Must validate first")
        gatepaths=[opt.north_closed,opt.north_open,opt.south_closed,opt.south_open]
        if not all(gatepaths):raise ValueError("Four illustrated gate states mandatory")
        manifest["manual_review_status"]="approved"
      if opt.approve_art or opt.preview:
        scene.save(opt.out/"illustrated-scene.png",optimize=True)
      if opt.approve_art:
        layers=[]
        for z,mask in sorted(depth.items()):
          bounds=mask.getbbox()
          if not bounds:continue
          sprite=Image.new("RGBA",SIZE,(0,0,0,0))
          sprite.paste(scene,(0,0),mask)
          file=f"occlusion-{z:02d}.png"
          sprite.crop(bounds).save(opt.out/file,optimize=True)
          layers.append(dict(depth=z,file=file,bounds=list(bounds)))
        manifest["scene_file"]="illustrated-scene.png"
        manifest["occlusion_layers"]=layers
        gates={}
        for kind,closed,opened,rect in [
           ("N",opt.north_closed,opt.north_open,[866,90,120,140]),
           ("S",opt.south_closed,opt.south_open,[425,337,120,140])]:
          for state,path in (("closed",closed),("open",opened)):
            im=Image.open(path).convert("RGBA")
            if min(im.size)<128:raise ValueError("Gate art too small")
            im.save(opt.out/(kind.lower()+"-"+state+".png"),optimize=True)
          gates[kind]=dict(rect=rect,closed=kind.lower()+"-closed.png",
                           open=kind.lower()+"-open.png",duration=1100)
        manifest["gates"]=gates
      elif opt.preview:
        highlight=Image.new("RGBA",SIZE,(233,73,82,0))
        highlight.putalpha(walls.point(lambda x:int(x*.34)))
        Image.alpha_composite(scene,highlight).save(opt.out/"alignment-overlay.png")
    (opt.out/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    print("status:",manifest["status"],"; expected maze wall cells:",sum(t["kind"]=="#" for t in tiles))

if __name__=="__main__":main()
