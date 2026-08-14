import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fix-neplex-vectorizer-browser-worker-url',
      transform(code, id) {
        if (!id.includes('vectorizer.wasi-browser')) return;
        return code.replace(
          /new URL\('@neplex\/vectorizer-wasm32-wasi\/wasi-worker-browser\.mjs', import\.meta\.url\)/,
          `new URL('./wasi-worker-browser.mjs', import.meta.url)`,
        );
      },
    },
  ],
  optimizeDeps: {
    exclude: ['@neplex/vectorizer', '@neplex/vectorizer-wasm32-wasi'],
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
});
