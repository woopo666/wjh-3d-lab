import {build} from 'vite';import {cpSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const root=resolve('docs/gallery'),out=resolve('artifacts/gallery-site');
await build({configFile:false,root,base:'./',publicDir:false,build:{target:"es2022",outDir:out,emptyOutDir:true,chunkSizeWarningLimit:700}});
mkdirSync(out,{recursive:true});for(const name of ['images','models','data.json'])cpSync(resolve(root,name),resolve(out,name),{recursive:true});
