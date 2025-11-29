import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Cast process to any to avoid TS error 'Property cwd does not exist on type Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'manifest.json',
            dest: '.'
          },
          {
            src: 'sw.js',
            dest: '.'
          }
        ]
      })
    ],
    // Base needs to be './' for GitHub Pages sub-directory hosting
    base: './',
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || process.env.API_KEY),
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});