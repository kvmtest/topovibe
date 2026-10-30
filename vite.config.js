import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Dev: Vite serves the client on :4173 and proxies API/MCP to the Express
// server on the internal dev port :4180 (scripts/dev-server.mjs).
// Production: `npm start` — Express serves dist/ and the API on PORT (4173).
export default defineConfig({
  plugins: [cesium()],
  server: {
    port: 4173,
    strictPort: true,
    watch: {
      // editor temp files (~RF*.TMP) crash chokidar with EBUSY on Windows
      ignored: ['**/*.TMP', '**/.git/**', '**/cache/**'],
    },
    proxy: {
      '/api': { target: 'http://localhost:4180', changeOrigin: true },
      '/mcp': { target: 'http://localhost:4180', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 5000,
  },
});
