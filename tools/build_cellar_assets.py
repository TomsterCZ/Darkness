"""Builds the derived cellar assets from the painted scene:
   - assets/scene/cellar_scene_gate.png : the scene with a gate opening cut into the parapet by the east arch
   - assets/props/cellar_gate.png       : the iron wicket gate with its padlock (drawn over the opening)
   - assets/props/cellar_key.png        : brass key (inventory + floating pickup)
   - assets/ui/restart.png, assets/ui/slot.png : pixel-art UI
Run from the repo root:  python3 -I tools/build_cellar_assets.py
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC='assets/scene/cellar_single_scene.jpg'
bg=Image.open(SRC).convert('RGB')
out=bg.copy()

def mask_poly(poly,size=bg.size,feather=0):
    m=Image.new('L',size,0); ImageDraw.Draw(m).polygon(poly,fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m

def clone(dst_poly,offset,gain=1.0,feather=0.6,src=bg):
    """paint dst_poly with pixels taken from dst_poly+offset"""
    ox,oy=offset
    shifted=src.transform(src.size,Image.AFFINE,(1,0,ox,0,1,oy),resample=Image.NEAREST)
    if gain!=1.0:
        a=np.asarray(shifted).astype(float)*gain
        shifted=Image.fromarray(np.clip(a,0,255).astype('uint8'))
    out.paste(shifted,(0,0),mask_poly(dst_poly,feather=feather))

H=39
F1,F2,N2,N1=(871,190.9),(835,215),(855,226),(891,201.9)      # cap of the two removed blocks (far/near edges)
dn=lambda p,d=H:(p[0],p[1]+d)
# 1. floor showing through the opening (cloned from the corridor floor three paving steps away)
gap=[F1,F2,N2,dn(N2),dn(N1),N1]
clone(gap,(75.2,19.2),gain=0.92,feather=0.8)
# 2. the newly exposed end face of the right-hand post (cloned from the end face of the long middle wall)
endface=[F1,N1,dn(N1),dn(F1)]
clone(endface,(400-871,307-190.9),gain=0.42,feather=0.4)
# soft shadow on the threshold
sh=Image.new('L',bg.size,0); ImageDraw.Draw(sh).polygon([dn(F1),dn(N1),(N1[0]-14,N1[1]+H+8),(F1[0]-16,F1[1]+H+6)],fill=110)
out.paste(Image.new('RGB',bg.size,(8,6,8)),(0,0),sh.filter(ImageFilter.GaussianBlur(2.2)))
# 3. taller gate posts: stack a copy of each neighbouring block one course higher
post_r=[(871,188),(893,175),(916,188),(916,228),(893,241),(871,229)]
post_l=[(816,226),(836,214),(856,226),(856,266),(837,277),(816,266)]
snap=out.copy()
for post in (post_l,post_r):
    up=[(x,y-17) for x,y in post]
    clone(up,(0,17),gain=1.0,feather=0.3,src=snap)
out.save('assets/scene/cellar_scene_gate.png')

# 4. iron wicket gate with padlock, a parallelogram following the parapet line
gx0,gx1=846,880
line=lambda x:196.4+(881-x)*0.6694            # parapet centre line at cap level
g=Image.new('RGBA',bg.size,(0,0,0,0)); d=ImageDraw.Draw(g)
top=lambda x:line(x)-9; bot=lambda x:line(x)+H+1
IRON=(58,54,60,255); LIGHT=(126,116,110,255); DARK=(24,22,26,255)
for x in range(gx0,gx1+1):
    for (off,th) in ((0,2),(20,2),(40,2)):       # three rails
        y=int(round(top(x)+off))
        d.point((x,y),fill=LIGHT); d.point((x,y+1),fill=IRON)
        if off==40: d.point((x,y+2),fill=DARK)
for x in range(gx0+1,gx1,5):                     # bars with spear tips
    y0=int(round(top(x)))-4; y1=int(round(bot(x)))
    d.line([(x,y0),(x,y1)],fill=LIGHT); d.line([(x+1,y0+1),(x+1,y1)],fill=DARK)
    d.point((x,y0-1),fill=LIGHT)
# padlock
px=863; py=int(round(top(px)+19))
BR=(214,164,62,255); BR2=(150,104,34,255); BR3=(250,222,130,255)
d.rectangle([px-4,py,px+4,py+8],fill=BR,outline=BR2)
d.line([(px-3,py+1),(px+2,py+1)],fill=BR3)
d.rectangle([px-1,py+3,px,py+5],fill=(40,28,14,255))
d.arc([px-3,py-6,px+3,py+2],180,360,fill=(170,170,176,255))
d.point((px-3,py-1),fill=(170,170,176,255)); d.point((px+3,py-1),fill=(170,170,176,255))
box=(gx0-2,int(top(gx1))-8,gx1+3,int(bot(gx0))+4)
g.crop(box).save('assets/props/cellar_gate.png'); print('gate box',box)

# 5. brass key from the iron key icon
k=np.asarray(Image.open('assets/props/iron_key.png').convert('RGBA')).astype(float)
lum=(k[...,0]*.3+k[...,1]*.59+k[...,2]*.11)/255
lum=np.clip((lum-lum[k[...,3]>20].min())/(np.ptp(lum[k[...,3]>20])+1e-6),0,1)
brass=np.stack([70+185*lum,44+150*lum**1.1,10+70*lum**1.6,k[...,3]],-1)
Image.fromarray(np.clip(brass,0,255).astype('uint8')).save('assets/props/cellar_key.png')

# 6. pixel-art UI
def px_img(rows,pal,scale=1):
    h=len(rows); w=len(rows[0]); im=Image.new('RGBA',(w,h),(0,0,0,0))
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            if ch in pal: im.putpixel((x,y),pal[ch])
    return im
PAL={'#':(22,16,18,255),'s':(74,60,56,255),'S':(112,92,80,255),'d':(46,36,36,255),'g':(232,196,120,255),'G':(160,116,52,255),'h':(255,236,170,255),'.':(30,23,25,235)}
restart=[
"####################",
"#SSSSSSSSSSSSSSSSSs#",
"#Sssssssssssssssssd#",
"#Ss..............sd#",
"#Ss.....hggg.....sd#",
"#Ss...hgGGGGg.g..sd#",
"#Ss..hgG....GggG.sd#",
"#Ss..gG.....gggG.sd#",
"#Ss.hg.....ggggG.sd#",
"#Ss.gG......GGGG.sd#",
"#Ss.gG...........sd#",
"#Ss.gG.......hg..sd#",
"#Ss.gg.......gG..sd#",
"#Ss..gg.....ggG..sd#",
"#Ss..Ggg...ggG...sd#",
"#Ss...GgggggG....sd#",
"#Ss....GGGGG.....sd#",
"#Ss..............sd#",
"#sdddddddddddddddd##",
"####################"]
px_img(restart,PAL).save('assets/ui/restart.png')
slot=["#"*26]+["#"+"S"*23+"s#"]+["#S"+"s"*22+"d#"]+["#Ss"+"."*20+"sd#"]*20+["#s"+"d"*23+"#"]+["#"*26]
px_img(slot,PAL).save('assets/ui/slot.png')
print('ok')
