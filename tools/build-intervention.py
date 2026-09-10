"""Original Dustline precision rifle art, CC0 1.0. Blender 4.2+.
Continuous machined profiles, ventilated handguard, glass scope, and original
baked finish textures. Coordinates describe visual artwork, not physical plans.
Run: blender --background --factory-startup --python tools/build-intervention.py
"""
import bpy, math, pathlib, json
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/models/weapons';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
parts=[]
def xyz(p):return (p[0],-p[2],p[1])
# A shared UV finish is baked directly to image pixels, so no procedural shader
# evaluation is required in the browser. The seed makes rebuilds reproducible.
rng=np.random.default_rng(417);n=1024
noise=rng.normal(0,.012,(n,n)).astype(np.float32)
brush=rng.normal(0,.008,(n,1)).astype(np.float32)
finish=np.clip(.64+noise+brush,.50,.79)
for _ in range(580):
    x=int(rng.integers(0,n));y=int(rng.integers(0,n));length=int(rng.integers(2,48))
    finish[y,min(x,n-1):min(x+length,n)]+=rng.uniform(.016,.060)
def texture(name,gray):
    pixels=np.empty((n,n,4),np.float32);pixels[:,:,:3]=gray[:,:,None];pixels[:,:,3]=1
    im=bpy.data.images.new(name,width=n,height=n,alpha=False)
    im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pixels.ravel());im.update();im.pack();return im
color=texture('Original precision-rifle parkerized finish',finish)
rough=texture('Original precision-rifle finish roughness',np.clip(.6+noise*2+brush,.40,.78))
def material(name,tint,metallic,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True;nd=m.node_tree.nodes;li=m.node_tree.links;bs=nd.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*tint,1);bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=roughness
    tex=nd.new('ShaderNodeTexImage');tex.image=color
    mix=nd.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*tint,1)
    li.new(tex.outputs['Color'],mix.inputs[1]);li.new(mix.outputs[0],bs.inputs['Base Color'])
    # glTF recognizes the factor multiplied by a base-color image.
    rt=nd.new('ShaderNodeTexImage');rt.image=rough;li.new(rt.outputs['Color'],bs.inputs['Roughness'])
    return m
steel=material('Phosphated barrel steel',(.11,.12,.115),.82,.48)
coat=material('Olive anodized chassis',(.28,.285,.25),.50,.61)
rubber=material('Textured graphite polymer',(.075,.079,.073),.04,.8)
edge=material('Machined fasteners',(.22,.23,.225),.85,.39)
glass=bpy.data.materials.new('Coated scope optics');glass.use_nodes=True
s=glass.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(.018,.06,.052,1);s.inputs['Metallic'].default_value=.6;s.inputs['Roughness'].default_value=.08

def mesh(name,verts,faces,mat,smooth=False,bevel=0):
    me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(mat);parts.append(o)
    for p in me.polygons:p.use_smooth=smooth
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    if bevel:
        mod=o.modifiers.new('Machined edge radii','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    o.select_set(False);return o

def profile(name,outline,width,mat,bevel=.002,x=0):
    verts=[(xx,y,z) for xx in [x-width/2,x+width/2] for z,y in outline];k=len(outline)
    faces=[tuple(range(k-1,-1,-1)),tuple(range(k,2*k))]+[(i,(i+1)%k,(i+1)%k+k,i+k) for i in range(k)]
    return mesh(name,verts,faces,mat,bevel=bevel)

def tube(name,points,radii,mat,sides=20):
    verts=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)]);tangent.normalize()
        u=tangent.cross(Vector((0,1,0)))
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u).normalized()
        for j in range(sides):
            a=j*math.tau/sides;verts.append(tuple(Vector(p)+(u*math.cos(a)+v*math.sin(a))*radii[i]))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces+=[tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh(name,verts,faces,mat,True)

def ztube(name,zs,rs,y,mat,x=0,sides=24):return tube(name,[(x,y,z) for z in zs],rs,mat,sides)
def bolt(name,p,r=.004):
    x,y,z=p;return tube(name,[(x-.002,y,z),(x+.002,y,z)],[r,r],edge,8)

# Receiver and lower chassis each use a single silhouette extrusion.
profile('Milled upper receiver',[(-.20,-.022),(.10,-.022),(.14,.005),(.13,.045),(.06,.065),(-.17,.06),(-.20,.035)],.061,coat,.003)
profile('Lower chassis',[(-.19,-.01),(-.16,-.073),(-.02,-.076),(.012,-.04),(.105,-.037),(.13,-.02),(.11,.01),(-.19,.018)],.049,coat,.003)
profile('Contoured pistol grip',[(.028,-.035),(.087,-.035),(.119,-.18),(.106,-.193),(.062,-.187),(.047,-.14)],.041,rubber,.004)
# Trigger guard is an open annular profile, never a solid block.
tube('Open trigger guard',[(0,-.039,.035),(0,-.063,.015),(0,-.08,-.006),(0,-.078,-.061),(0,-.051,-.087)],[.004]*5,steel,10)
tube('Curved trigger',[(0,-.042,-.022),(0,-.06,-.035),(0,-.067,-.027)],[.003]*3,steel,8)
profile('Detachable magazine',[(-.14,-.05),(-.055,-.05),(-.053,-.152),(-.066,-.171),(-.141,-.17),(-.15,-.154)],.037,steel,.003)
for x in [-.021,.021]:
    for z in [-.131,-.11,-.088]:profile('Magazine stiffening crease',[(z,-.085),(z+.005,-.085),(z+.005,-.153),(z,-.153)],.001,edge,.0005,x)
# Rear telescopic stock, rails, cheek support and contoured recoil pad.
for x in [-.022,.022]:
    tube('Telescopic stock rail',[(x,.019,.1),(x,.019,.385)],[.009,.009],steel,16)
profile('Cheek support',[(.12,.028),(.15,.066),(.275,.066),(.296,.037),(.27,.017),(.135,.011)],.071,rubber,.006)
profile('Rear stock yoke',[(.345,.038),(.37,.059),(.405,.046),(.413,-.136),(.395,-.151),(.366,-.145)],.044,coat,.004)
profile('Curved recoil pad',[(.405,.062),(.434,.049),(.446,.0),(.445,-.09),(.43,-.154),(.406,-.16)],.066,rubber,.006)
for y in [-.12,-.095,-.07,-.045,-.02,.005,.03]:
    tube('Recoil pad ribs',[(-.028,y,.435),(.028,y,.435)],[.002,.002],rubber,6)
tube('Rear monopod',[(0,-.115,.367),(0,-.196,.367)],[.011,.008],steel,12)
ztube('Monopod foot',[.357,.377],[.02,.02],-.196,rubber,sides=12)

# Barrel shroud with genuine through-vents, modelled as a hollow shell.
zs=[-.455,-.434,-.42,-.374,-.363,-.317,-.306,-.26,-.249,-.203,-.191,-.17]
sides=32;rad=.045;wall=.003;verts=[]
for rr in [rad,rad-wall]:
    for z in zs:
        for j in range(sides):a=j*math.tau/sides;verts.append((rr*math.cos(a),.018+rr*math.sin(a),z))
ring=len(zs)*sides
keep={}
for k in range(len(zs)-1):
    for j in range(sides):keep[k,j]=not(k in [2,4,6,8] and j%8 in [1,2,3,4])
faces=[]
for (k,j),visible in keep.items():
    if not visible:continue
    jn=(j+1)%sides;a=k*sides+j;b=k*sides+jn;c=(k+1)*sides+jn;d=(k+1)*sides+j
    faces.extend([(a,b,c,d),(a+ring,d+ring,c+ring,b+ring)])
    for neighbor,edgeids in [((k,j-1 if j else sides-1),(a,d)),((k,jn),(b,c)),((k-1,j),(a,b)),((k+1,j),(d,c))]:
        if not keep.get(neighbor,False):p,q=edgeids;faces.append((p,q,q+ring,p+ring))
mesh('Ventilated tubular handguard',verts,faces,coat,True)
ztube('Precision barrel',[-.865,-.825,-.48,-.455,-.155],[.014,.016,.017,.02,.023],.018,steel,sides=24)
# Long flutes catch light without excessive polygons.
for j in range(8):
    a=j*math.tau/8;x=.0172*math.cos(a);y=.018+.0172*math.sin(a)
    tube('Barrel flute',[(x,y,-.8),(x,y,-.50)],[.0013,.0013],edge,6)
# Muzzle brake side windows are open spaces between machined ribs.
for z in [-.904,-.882,-.86]:
    ztube('Muzzle brake collar',[z,z+.009],[.024,.024],.018,steel,sides=16)
for a in [math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]:
    x=.018*math.cos(a);y=.018+.018*math.sin(a);tube('Muzzle brake spine',[(x,y,-.895),(x,y,-.851)],[.005,.005],steel,8)
ztube('Muzzle bore shadow',[-.906,-.904],[.0105,.0105],.018,rubber,sides=20)
# Rail runs along the upper surface; each tooth has a machined trapezoid profile.
profile('Continuous optics rail',[(-.20,.06),(.07,.06),(.07,.075),(-.20,.075)],.038,steel,.001)
for i in range(18):
    z=-.197+i*.015;profile('Picatinny tooth',[(z,.074),(z+.002,.081),(z+.009,.081),(z+.011,.074)],.046,edge,.0006)
# Scope rings and realistically stepped optic body.
for z in [-.14,.002]:
    profile('Scope mounting saddle',[(z-.02,.078),(z+.02,.078),(z+.014,.105),(z-.014,.105)],.045,steel,.002)
    ztube('Scope mounting ring',[z-.009,z+.009],[.032,.032],.127,edge)
ztube('Optical scope body',[-.381,-.372,-.321,-.29,-.263,-.034,-.017,.068,.081],[.039,.042,.042,.029,.025,.025,.031,.031,.029],.127,rubber,sides=32)
ztube('Objective glass',[-.382,-.380],[.034,.034],.127,glass,sides=32)
ztube('Eyepiece glass',[.081,.083],[.025,.025],.127,glass,sides=32)
for z,rad in [(-.367,.043),(-.307,.038),(-.025,.032),(.062,.033)]:
    ztube('Optic grip ring',[z-.003,z+.003],[rad,rad],.127,steel,sides=32)
tube('Elevation turret',[(0,.147,-.097),(0,.187,-.097)],[.02,.02],steel,24)
tube('Windage turret',[(.017,.127,-.097),(.049,.127,-.097)],[.019,.019],steel,24)
# Knurl marks and scope engraved range ticks are geometry at submillimeter depth.
for i in range(16):
    a=i*math.tau/16;x=.0205*math.cos(a);z=-.097+.0205*math.sin(a)
    tube('Turret knurl',[(x,.166,z),(x,.183,z)],[.0008,.0008],edge,5)
# Bolt handle, safety, screws and front folded bipod.
tube('Bolt handle',[(.027,.02,.065),(.065,.016,.072),(.074,-.025,.095)],[.007,.006,.007],steel,12)
tube('Bolt handle knob',[(.074,-.025,.095),(.078,-.043,.10)],[.012,.010],rubber,16)
for x in [-.033,.033]:
    for z,y in [(-.172,.018),(-.06,.036),(.091,.015)]:bolt('Receiver fastener',(x,y,z))
for side in [-1,1]:
    x=side*.042
    tube('Folded bipod upper',[(x,-.02,-.405),(side*.068,-.06,-.315)],[.012,.010],steel,12)
    tube('Folded bipod lower',[(side*.068,-.06,-.315),(side*.072,-.065,-.205)],[.008,.007],edge,12)
    tube('Bipod rubber foot',[(side*.072,-.065,-.213),(side*.072,-.065,-.192)],[.012,.012],rubber,12)

# UV unwrap the original surfaces, join them, preserve a small material palette.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='intervention'
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.007);bpy.ops.object.mode_set(mode='OBJECT')
# Use a directly linked texture with an explicit tint, which glTF preserves.
for m in [steel,coat,rubber,edge]:
    bs=m.node_tree.nodes.get('Principled BSDF');mix=next(n for n in m.node_tree.nodes if n.type=='MIX_RGB');tex=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==color)
    tint=mix.inputs[2].default_value[:]
    # Create tint-specific baked base colors: browsers sample ordinary textures.
    pixels=np.empty((n,n,4),np.float32);pixels[:,:,:3]=finish[:,:,None]*np.array(tint[:3]);pixels[:,:,3]=1
    im=bpy.data.images.new(m.name+' baked color',width=n,height=n,alpha=False);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pixels.ravel());im.update();im.pack();tex.image=im;m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
tris=sum(len(p.vertices)-2 for p in obj.data.polygons)
if tris>19500:
    d=obj.modifiers.new('Browser detail budget','DECIMATE');d.ratio=19000/tris;bpy.ops.object.modifier_apply(modifier=d.name)
coords=[Vector((v.co.x,v.co.z,-v.co.y)) for v in obj.data.vertices]
stats={'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'textureLimit':1024,'bounds':[[round(f(p[k] for p in coords),5) for k in range(3)] for f in [min,max]],'grip':[0,-.12,.065],'sightHeight':.127,'muzzle':[0,.018,-.906],'supportContact':[0,-.027,-.29]}
bpy.ops.export_scene.gltf(filepath=str(OUT/'intervention.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
stats['bytes']=(OUT/'intervention.glb').stat().st_size
path=OUT/'stats.json';previous=json.loads(path.read_text()) if path.exists() else {};previous['intervention']=stats;path.write_text(json.dumps(previous,indent=2)+'\n')
(ROOT/'art').mkdir(exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/intervention.blend'),compress=True)
print('INTERVENTION_COMPLETE',json.dumps(stats),flush=True)
