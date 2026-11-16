"""Derives the playable cellar board from the painted scene and injects it into cellar.html.

The walls in tools/cellar_walls.json were digitised from the painting (cap centre line a->b,
half-thickness t, height h in pixels).  From them this script works out, on the isometric
lattice the paving follows:
  * which cells are open floor,
  * which steps between neighbouring cells a wall blocks,
  * a silhouette polygon + lattice box per wall, used at runtime to hide whatever stands behind it.
Run from the repo root:  python3 -I tools/cellar_level.py [--board out.txt]
"""
import json, re, sys
J=json.load(open('tools/cellar_walls.json'))
L=J['lattice']; OX,OY,HW,HH=L['OX'],L['OY'],L['HW'],L['HH']; H=J['h']
P=lambda c,r:(OX+(r-c)*HW, OY+(c+r)*HH)
C=lambda c,r:P(c+.5,r+.5)
def inv(x,y):
    u=(x-OX)/HW; v=(y-OY)/HH; return ((v-u)/2,(v+u)/2)
def hull(pts):
    pts=sorted(set(pts))
    def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
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
    top=[(x,y-w.get('raise',0)) for x,y in cap]
    walls[n]=dict(base=base,hull=hull(top+base),
                  box=[min(p[0] for p in lat),max(p[0] for p in lat),min(p[1] for p in lat),max(p[1] for p in lat)])
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
REG=[(0,9,0,3),(4,11,4,4),(0,3,5,7),(4,9,5,10),(10,11,5,6)]      # floor areas of the platform (c0,c1,r0,r1)
cand={(c,r) for c0,c1,r0,r1 in REG for c in range(c0,c1+1) for r in range(r0,r1+1)}
cells=set()
for (c,r) in cand:
    pts=[C(c,r)]+[P(c+.5+dc,r+.5+dr) for dc,dr in((.22,0),(-.22,0),(0,.22),(0,-.22))]
    if not any(inpoly(p,w['base']) for p in pts for w in walls.values()): cells.add((c,r))
blocked=[]
for (c,r) in sorted(cells):
    for dc,dr in((1,0),(0,1)):
        n=(c+dc,r+dr)
        if n in cells and any(seg_hits(C(c,r),C(*n),w['base']) for w in walls.values()): blocked.append([[c,r],list(n)])
order=sorted(cells,key=lambda p:(p[1],p[0]))
if '--board' in sys.argv:
    idx={p:i for i,p in enumerate(order)}; bl={(tuple(a),tuple(b)) for a,b in blocked}; bl|={(b,a) for a,b in bl}
    with open(sys.argv[sys.argv.index('--board')+1],'w') as f:
        f.write(f"{len(order)}\n")
        for p in order:
            nb=[]
            for d in((1,0),(-1,0),(0,1),(0,-1)):
                q=(p[0]+d[0],p[1]+d[1]); nb.append(idx[q] if q in idx and (p,q) not in bl else -1)
            f.write(f"{p[0]} {p[1]} {' '.join(map(str,nb))}\n")
outer=J.get('outer',{})      # walkway outside the parapet: explicit pixel positions, hero only (no crates)
data=dict(OX=OX,OY=OY,HW=HW,HH=HH,
          cells=[list(p) for p in order]+[[int(v) for v in k.split(',')] for k in outer], blocked=blocked, outer=outer,
          walls=[dict(n=n,box=[round(v,2) for v in w['box']],hull=[[round(x,1),round(y,1)] for x,y in w['hull']]) for n,w in walls.items()])
src=open('cellar.html').read()
block='/*BOARD-BEGIN*/const BOARD='+json.dumps(data,separators=(',',':'))+';/*BOARD-END*/'
new,n=re.subn(r'/\*BOARD-BEGIN\*/.*?/\*BOARD-END\*/',lambda m:block,src,flags=re.S)
if n: open('cellar.html','w').write(new)
print(len(cells),'cells,',len(blocked),'blocked steps,',len(walls),'walls; injected' if n else 'walls; NOT injected (no marker)')
