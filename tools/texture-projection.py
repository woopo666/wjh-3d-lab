"""Occlusion-tested orthographic texture projection for generated meshes."""
import numpy as np,moderngl
from scipy.ndimage import map_coordinates

def project_reference(mesh,world,normals,colors,reference,side=1,round_head=None,return_samples=False,alpha_threshold=0):
    ref=np.asarray(reference).astype(np.float32)/255
    alpha=reference.getchannel('A')
    left,top,right,bottom=(alpha.point(lambda a:255 if a>alpha_threshold else 0) if alpha_threshold else alpha).getbbox()
    height=mesh.bounds[1,2]-mesh.bounds[0,2];mid_x=(mesh.bounds[1,0]+mesh.bounds[0,0])/2
    width_px,height_px=reference.size;pixel_scale=(bottom-top)/height;center_px=(left+right)/2
    ctx=moderngl.create_context(standalone=True)
    program=ctx.program(vertex_shader='''#version 330
in vec3 in_pos;out float depth;uniform float scale,center,bottom_y,min_z,iw,ih,side;
void main(){float u=(center+in_pos.x*scale*side)/iw;float v=1.-(bottom_y-(in_pos.z-min_z)*scale)/ih;
gl_Position=vec4(u*2.-1.,v*2.-1.,in_pos.y*side*3.,1.);depth=in_pos.y*side;}
''',fragment_shader='''#version 330
in float depth;out float value;void main(){value=depth;}
''')
    for key,val in {'scale':pixel_scale,'center':center_px-side*mid_x*pixel_scale,'bottom_y':float(bottom),'min_z':float(mesh.bounds[0,2]),'iw':float(width_px),'ih':float(height_px),'side':float(side)}.items():program[key].value=val
    buffer=ctx.buffer(mesh.vertices.astype('f4').tobytes());indices=ctx.buffer(mesh.faces.astype('i4').tobytes())
    vao=ctx.vertex_array(program,[(buffer,'3f','in_pos')],indices)
    target=ctx.framebuffer([ctx.texture((width_px,height_px),1,dtype='f4')],depth_attachment=ctx.depth_renderbuffer((width_px,height_px)))
    target.use();target.clear(1,1,1,1,depth=1);ctx.enable(moderngl.DEPTH_TEST);vao.render()
    depth=np.frombuffer(target.color_attachments[0].read(),dtype='f4').reshape(height_px,width_px)[::-1]
    px=center_px+side*(world[:,0]-mid_x)*pixel_scale;py=bottom-(world[:,2]-mesh.bounds[0,2])*pixel_scale
    sample=np.stack([map_coordinates(ref[:,:,i],[py,px],order=1,mode='constant',cval=0) for i in range(4)],axis=1)
    nearest=map_coordinates(depth,[py,px],order=1,mode='constant',cval=1)
    facing=np.clip((-side*normals[:,1]+.06)/.44,0,1)
    visible=np.clip(1-np.maximum(0,side*world[:,1]-nearest-.003)/.012,0,1)
    if round_head is not None:
        # A mascot's painted eyes and mouth must stay crisp. Tiny reconstruction
        # dents are not occluders on its single convex face envelope.
        face=(world[:,2]>round_head)&(-side*normals[:,1]>.08)
        facing[face]=1;visible[face]=1
    blend=(sample[:,3]*facing*visible*.985)[:,None]
    result=colors*(1-blend)+sample[:,:3]*blend
    target.release();vao.release();buffer.release();indices.release();program.release();ctx.release()
    return (sample[:,:3],blend[:,0]) if return_samples else result
