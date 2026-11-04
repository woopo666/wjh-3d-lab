import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

// One decoder configuration for old uncompressed and new compressed assets.
export function createGltfLoader(){
 return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
