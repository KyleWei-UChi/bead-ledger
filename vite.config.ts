import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_PORT = Number(process.env.BEAD_API_PORT ?? 8787);

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // `artifact` mode builds a bundle that talks to the Artifact database
  // instead of the local file server. See src/store/index.ts.
  define: {
    __STORE_TARGET__: JSON.stringify(mode === 'artifact' ? 'artifact' : 'http'),
  },
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    emptyOutDir: true,
    // Artifact publishing is simplest with a small, fixed set of asset names.
    rollupOptions:
      mode === 'artifact'
        ? {
            output: {
              entryFileNames: 'app.js',
              assetFileNames: 'app.[ext]',
              // The Artifact page inlines one script tag, so the dynamically
              // imported store adapter has to land in the main bundle.
              inlineDynamicImports: true,
            },
          }
        : {},
  },
  server: {
    port: 5178,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
    },
  },
}));
