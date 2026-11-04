import {createServer} from 'vite';
const server=await createServer({configFile:false,root:import.meta.dirname,server:{host:'127.0.0.1',port:Number(process.env.WJH_STUDIO_PORT)||5208,strictPort:true,hmr:false,watch:{ignored:['**/jobs/**']}},optimizeDeps:{entries:['index.html']}});
await server.listen();server.printUrls();
