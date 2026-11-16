"""Builds the playable cellar board from the painted scene and injects it into cellar.html.

Rule: a cell is somewhere the hero's feet can visibly stand.  Every cell centre lies on floor that
is actually visible in the painting, never under a wall's top or face, so on screen the walls are
exactly what limits movement.  Each chamber's rows and columns are spread evenly between the walls
that bound it (the painting is not a perfectly regular lattice), instead of sitting on one rigid grid.

tools/cellar_walls.json holds the walls digitised from the art (cap centre line a->b, half
thickness t, height h, in pixels) and the paving lattice.
Run from the repo root:  python3 -I tools/cellar_level.py [--board out.txt] [--overlay out.png]
"""
import json, re, sys
J=json.load(open('tools/cellar_walls.json'))
L=J['lattice']; OX,OY,HW,HH=L['OX'],L['OY'],L['HW'],L['HH']; H=J['h']
P=lambda c,r:(OX+(r-c)*HW, OY+(c+r)*HH)
def inv(x,y):
    u=(x-OX)/HW; v=(y-OY)/HH; return ((v-u)/2,(v+u)/2)
def hull(pts):
    pts=sorted(set(pts))
    cr=lambda o,a,b:(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[]
    for p in pts:
        while len(lo)>=2 and cr(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    up=[]
    for p in reversed(pts):
        while len(up)>=2 and cr(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    return lo[:-1]+up[:-1]
walls={}
for n,w in J['walls'].items():
    a,b,t=w['a'],w['b'],w['t']; hh=w.get('h',H)
    cap=[(a[0]-t[0],a[1]-t[1]),(b[0]-t[0],b[1]-t[1]),(b[0]+t[0],b[1]+t[1]),(a[0]+t[0],a[1]+t[1])]
    base=[(x,y+hh) for x,y in cap]; lat=[inv(x,y) for x,y in base]
    walls[n]=dict(hull=hull(cap+base),box=[min(p[0] for p in lat),max(p[0] for p in lat),min(p[1] for p in lat),max(p[1] for p in lat)])
PILLARS=[[(503,0),(537,0),(537,101),(503,101)],[(698,0),(727,0),(727,136),(698,136)]]
solids=[w['hull'] for w in walls.values()]+PILLARS
def inpoly(pt,poly):
    x,y=pt; ins=False
    for i in range(len(poly)):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%len(poly)]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: ins=not ins
    return ins
def seg_int(p,q,a,b):
    o=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return (o(p,q,a)*o(p,q,b)<0) and (o(a,b,p)*o(a,b,q)<0)
def seg_hits(p,q,poly):
    return inpoly(p,poly) or inpoly(q,poly) or any(seg_int(p,q,poly[i],poly[(i+1)%len(poly)]) for i in range(len(poly)))

# ---------------------------------------------------------------- cells: logical (c,r) -> lattice position
cells={}          # (c,r) -> dict(l=(lc,lr) lattice coords used for depth/occlusion, p=(x,y) pixel, heroOnly)
def put(c,r,lc,lr,**kw): cells[(c,r)]=dict(l=(lc,lr),p=P(lc,lr),**kw)
def putpx(c,r,x,y,front=False,**kw): cells[(c,r)]=dict(l=(20.0,20.0) if front else inv(x,y),p=(x,y),**kw)
# West chamber (stairs): 5 x 4 between the back parapet, the long middle wall, the stub wall and the stairs-side parapet
for i in range(4,9):
    lc=4.75+(i-4)*0.9175; back=0.2-(lc-1.66)*0.0428+0.5
    for j in range(0,4): put(i,j,lc,back+j*(3.22-back)/3)
# North nook (torch): two full rows open to the west chamber, a shorter third row behind the stub wall
for j,(lr,e,w,n) in enumerate([(0.5,0.05,3.75,5),(1.3,-0.22,3.75,5),(2.3,-0.56,2.22,4)]):
    for q in range(n): put(-1+q,j,e+q*(w-e)/(n-1),lr)
# Pocket between the west chamber and the front chamber, round the end of the middle wall
put(9,3,9.5,3.5); put(9,4,9.5,4.5); put(9,5,9.6,5.6); put(10,3,10.5,3.55); put(10,4,10.35,4.4)
# Front chamber: 5 x 5 between the middle wall and the two front parapets (which are not parallel to the paving)
for i in range(4,9):
    for j in range(5,10):
        lc=4.27+(i-4)*1.0925; lr=5.75
        for _ in range(3):
            front=9.58+max(0,lc-6.66)*0.149; lr=5.75+(j-5)*(front-5.75)/4
            west=8.64-0.082*max(0,lr-7.08); lc=4.27+(i-4)*(west-4.27)/4
        put(i,j,lc,lr)
# East chamber: 4 x 3 between its two back parapets and the parapet with the opening
for i in range(0,4):
    lc=3.5-(3-i)*1.14
    for j in range(4,7): put(i,j,lc,5.1+(j-4)*(0.76+0.046*lc))
# Through the opening and along the walkway outside the parapet, then south beside the front parapet
for r,(x,y) in enumerate([(864.9,253),(895,286),(896,326),(893,366),(886,404),(860,428),(823,447),(786,466),(748,485),(711,504),(676,522)],start=7):
    putpx(0,r,x,y,front=r>=10)
putpx(-1,8,938,255); putpx(-2,8,950,218,heroOnly=True)                    # up to the threshold of the east arch
# Low ground beyond the barred gate (hero only; reached through the gate once it is raised)
for (c,r),(x,y) in {(13,9):(486,531),(13,10):(523,550),(14,9):(448,547),(14,8):(411,528),(15,8):(373,544),(15,7):(336,525),
                    (15,6):(298,506),(16,7):(298,541),(16,6):(260,522),(16,5):(223,503),(17,6):(223,538)}.items():
    putpx(c,r,x,y,front=True,heroOnly=True)

problems=[k for k,v in cells.items() if any(inpoly(v['p'],s) for s in solids)]
blocked=[]
for (c,r) in sorted(cells):
    for dc,dr in((1,0),(0,1)):
        n=(c+dc,r+dr)
        if n in cells and any(seg_hits(cells[(c,r)]['p'],cells[n]['p'],s) for s in solids): blocked.append([[c,r],list(n)])
blocked=[e for e in blocked if e!=[[0,6],[0,7]]]      # the opening in the east parapet: the hero steps through behind the wall end
order=sorted(cells,key=lambda p:(p[1],p[0]))
if '--board' in sys.argv:                                   # graph for tools/sokoban_gen.cpp: cells a crate may stand on
    o2=[p for p in order if not cells[p].get('heroOnly')]; idx={p:i for i,p in enumerate(o2)}
    bl={(tuple(a),tuple(b)) for a,b in blocked}; bl|={(b,a) for a,b in bl}
    with open(sys.argv[sys.argv.index('--board')+1],'w') as f:
        f.write(f"{len(o2)}\n")
        for p in o2:
            nb=[]
            for d in((1,0),(-1,0),(0,1),(0,-1)):
                q=(p[0]+d[0],p[1]+d[1]); nb.append(idx[q] if q in idx and (p,q) not in bl else -1)
            f.write(f"{p[0]} {p[1]} {' '.join(map(str,nb))}\n")
if '--overlay' in sys.argv:
    from PIL import Image, ImageDraw
    s=2; im=Image.open('assets/scene/cellar_scene_gate.png').convert('RGB'); im=im.resize((im.size[0]*s,im.size[1]*s),Image.NEAREST); d=ImageDraw.Draw(im,'RGBA')
    for w in walls.values(): d.polygon([(x*s,y*s) for x,y in w['hull']],outline=(0,200,255,160))
    for (c,r),v in cells.items():
        x,y=v['p']; col=(255,60,60,255) if (c,r) in problems else ((255,160,0,255) if v.get('heroOnly') else (0,255,120,255))
        d.polygon([((x)*s,(y-11)*s),((x+22)*s,y*s),(x*s,(y+11)*s),((x-22)*s,y*s)],outline=col); d.text((x*s-12,y*s-5),f"{c},{r}",fill=(255,255,0,255))
        for dc,dr in((1,0),(0,1)):
            n=(c+dc,r+dr)
            if n in cells:
                bad=[[c,r],list(n)] in blocked
                d.line([(x*s,y*s),(cells[n]['p'][0]*s,cells[n]['p'][1]*s)],fill=(255,0,0,255) if bad else (255,255,255,70),width=3 if bad else 1)
    im.save(sys.argv[sys.argv.index('--overlay')+1])
data=dict(OX=OX,OY=OY,HW=HW,HH=HH,
          cells=[[c,r,round(cells[(c,r)]['p'][0],1),round(cells[(c,r)]['p'][1],1),round(cells[(c,r)]['l'][0],2),round(cells[(c,r)]['l'][1],2),1 if cells[(c,r)].get('heroOnly') else 0] for c,r in order],
          blocked=blocked,
          walls=[dict(n=n,box=[round(v,2) for v in w['box']],hull=[[round(x,1),round(y,1)] for x,y in w['hull']]) for n,w in walls.items()])
src=open('cellar.html').read()
block='/*BOARD-BEGIN*/const BOARD='+json.dumps(data,separators=(',',':'))+';/*BOARD-END*/'
new,n=re.subn(r'/\*BOARD-BEGIN\*/.*?/\*BOARD-END\*/',lambda m:block,src,flags=re.S)
if n and '--dry' not in sys.argv: open('cellar.html','w').write(new)
print(len(cells),'cells,',len(blocked),'blocked steps:',blocked,'| centres under a wall:',problems)
