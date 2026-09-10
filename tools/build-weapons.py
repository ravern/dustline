"""Build licensed weapon viewmodels with Blender 4.2+ (no third-party Python packages).

  blender --background --factory-startup --disable-autoexec --python tools/build-weapons.py -- --source-dir /path/to/sources

Source download locations and licenses: public/models/weapons/SOURCES.md.
All output coordinates use meters, Y up, and a muzzle pointing down -Z.
"""
import bpy, json, os, pathlib, sys
from array import array
from mathutils import Vector
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/weapons'
OUT.mkdir(parents=True, exist_ok=True)
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
SOURCE = pathlib.Path(args[args.index('--source-dir')+1] if '--source-dir' in args else os.environ.get('DUSTLINE_WEAPON_SOURCES', str(ROOT / 'art/weapon-sources'))).resolve()
ONLY = args[args.index('--only')+1].split(',') if '--only' in args else ['ak47','m9','knife']
stats = {}

def image(name, path=None, data=False):
    im = bpy.data.images.load(str(path), check_existing=True) if path else bpy.data.images[name]
    im.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    if im.size[0] > 1024 or im.size[1] > 1024:
        ratio = 1024/max(im.size); im.scale(round(im.size[0]*ratio), round(im.size[1]*ratio))
    width,height=im.size[:]
    if not width:raise RuntimeError('Missing source image '+str(path or name))
    # Copy resized pixels into a fresh image; old packed bytes must never reach glTF.
    pixels=array('f',[0])*(width*height*4);im.pixels.foreach_get(pixels)
    result=bpy.data.images.new('Dustline '+im.name,width=width,height=height,alpha=False)
    result.colorspace_settings.name='Non-Color' if data else 'sRGB'
    result.pixels.foreach_set(pixels);result.update();result.pack()
    return result

def pbr(name, base, normal=None, rough=None, metal=None, metallic=0):
    mat = bpy.data.materials.new(name);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=.55;bsdf.inputs['Metallic'].default_value=metallic
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    def texture(im):
        n=nodes.new('ShaderNodeTexImage');n.image=im;links.new(uv.outputs['UV'],n.inputs['Vector']);return n.outputs['Color']
    links.new(texture(base),bsdf.inputs['Base Color'])
    if rough:links.new(texture(rough),bsdf.inputs['Roughness'])
    if metal:links.new(texture(metal),bsdf.inputs['Metallic'])
    if normal:
        n=nodes.new('ShaderNodeNormalMap');links.new(texture(normal),n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
    return mat

def export(weapon, objects, transform, length, grip_source, grip_target=(0,-.12,.065)):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    # Freeze authored modifiers/instance transforms before changing basis.
    dependency=bpy.context.evaluated_depsgraph_get();parts=[]
    for old in objects:
        evaluated=old.evaluated_get(dependency)
        mesh=bpy.data.meshes.new_from_object(evaluated, depsgraph=dependency)
        mesh.transform(old.matrix_world)
        if mesh.uv_layers:
            active=mesh.uv_layers.active or mesh.uv_layers[0];active.name='UVMap';active.active_render=True;mesh.uv_layers.active_index=0
        new=bpy.data.objects.new(weapon+'_part',mesh);bpy.context.collection.objects.link(new);parts.append(new)
    points=[Vector(transform(v.co)) for o in parts for v in o.data.vertices]
    lo=min(p.z for p in points);hi=max(p.z for p in points);scale=length/(hi-lo)
    grip=Vector(transform(Vector(grip_source)));target=Vector(grip_target)
    for o in parts:
        for v in o.data.vertices:
            p=(Vector(transform(v.co))-grip)*scale+target
            v.co=(p.x,-p.z,p.y)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=weapon
    tris=sum(len(p.vertices)-2 for p in o.data.polygons)
    if tris > 20000:
        dec=o.modifiers.new('Browser triangle budget','DECIMATE');dec.ratio=19500/tris;bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    coords=[Vector((v.co.x,v.co.z,-v.co.y)) for v in o.data.vertices]
    bounds=[[round(f(p[k] for p in coords),5) for k in range(3)] for f in [min,max]]
    bpy.ops.export_scene.gltf(filepath=str(OUT/(weapon+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=95)
    stats[weapon]={'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'bytes':(OUT/(weapon+'.glb')).stat().st_size,'bounds':bounds,'grip':list(grip_target),'textureLimit':1024}
    print('WEAPON_EXPORTED',weapon,json.dumps(stats[weapon]),flush=True)

if 'ak47' in ONLY:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'akm54.blend'),load_ui=False,use_scripts=False)
    mat=pbr('AKM · weathered blued steel and wood',image('Material_BaseColor.png'),image('Material_Normal.png',data=True),image('Material_Roughness.png',data=True),image('Material_Metallic.png',data=True))
    o=bpy.data.objects['AKM'];o.data.materials.clear();o.data.materials.append(mat)
    export('ak47',[o],lambda p:(p.x,p.z,-p.y),1.08,(0,-.20,-.085))
if 'm9' in ONLY:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'pistol/pistol.blend'),load_ui=False,use_scripts=False)
    diffuse=image('diffuse.png',SOURCE/'pistol/diffuse.png')
    mat=pbr('M9 · photographed blued finish',diffuse,metallic=.65)
    gripmat=pbr('M9 · textured polymer grip',diffuse,metallic=.02)
    gripmat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.76
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)]
    for o in objects:o.data.materials.clear();o.data.materials.append(gripmat if o.name in ['Cube.007','Cube.008'] else mat)
    export('m9',objects,lambda p:(-p.z,p.y,p.x),.26,(1,-.35,-.02))
if 'knife' in ONLY:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'m9_knife/m9_knife.blend'),load_ui=False,use_scripts=False)
    o=bpy.data.objects['M9-LP']
    for i,name in enumerate(['Knife','Handle']):
        folder=SOURCE/'m9_knife/Textures'
        mat=pbr('M9 bayonet · '+name,image('',folder/(name+'_albedo.png')),image('',folder/(name+'_nm.png'),data=True),image('',folder/(name+'_roughness.png'),data=True),image('',folder/(name+'_metallic.png'),data=True))
        o.data.materials[i]=mat
    export('knife',[o],lambda p:(-p.y,p.z,-p.x),.36,(-3.5,0,.28),(0,-.02,.025))
path=OUT/'stats.json'
previous=json.loads(path.read_text()) if path.exists() else {}
hardpoints={'ak47':{'sightHeight':.022,'muzzle':[0,-.034,-.701],'supportContact':[0,-.054,-.35]},'m9':{'sightHeight':-.006,'muzzle':[0,-.023,-.144],'supportContact':[0,-.13,.067]},'knife':{'sightHeight':0,'muzzle':[0,-.019,-.263],'supportContact':None}}
for key,value in stats.items():value.update(hardpoints[key])
previous.update(stats);path.write_text(json.dumps(previous,indent=2)+'\n')
print('DUSTLINE_WEAPONS_COMPLETE',flush=True)
