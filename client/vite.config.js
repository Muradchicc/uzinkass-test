import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Nisbiy yo'llar — lokal serverda ham, GitHub Pages'dagi /uzinkass-test/ ostida ham ishlaydi
  base: './',
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:80' },
  },
});
