import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
// Le décodeur sans DOM est aussi utilisable dans le Web Worker.
const decodeEntities=require.resolve('decode-named-character-reference');
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], resolve:{alias:{'decode-named-character-reference':decodeEntities}}, server: { port: 5173, strictPort: true, proxy: { '/api': process.env.API_PROXY_URL ?? 'http://127.0.0.1:3001' } }, build: { chunkSizeWarningLimit: 650 } });
