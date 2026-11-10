import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (/[\\/]node_modules[\\/](react|react-dom)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
              return 'vendor-icons';
            }
            if (/[\\/]node_modules[\\/]jszip[\\/]/.test(id)) {
              return 'vendor-zip';
            }
            if (/[\\/]node_modules[\\/]mp4-muxer[\\/]/.test(id)) {
              return 'vendor-mp4';
            }
            if (/[\\/]src[\\/]lib[\\/]canvas[\\/]/.test(id)) {
              return 'engine-canvas';
            }
            if (/[\\/]src[\\/]lib[\\/]motion[\\/]/.test(id)) {
              return 'engine-motion';
            }
            if (/[\\/]src[\\/]lib[\\/]synthesis[\\/]/.test(id)) {
              return 'engine-synthesis';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/data/**', '**/scratch/**', '**/dist/**', '**/.git/**', '**/test-results/**'],
      },
    },
  };
});
