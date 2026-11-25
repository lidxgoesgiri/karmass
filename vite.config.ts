import { defineConfig, type BuildEnvironmentOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

// framer-motion ships "use client" directives (meaningless outside RSC); the real
// size budget is enforced by `npm run size`, so Vite's 500 kB per-chunk warning is noise.
const quiet: BuildEnvironmentOptions = {
  chunkSizeWarningLimit: 2048,
  sourcemap: false, // keeps the Devvit upload small and source private on the CDN
  rollupOptions: {
    onwarn(warning, warn) {
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
      warn(warning);
    },
  },
};

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    devvit({ client: { build: quiet }, server: { build: quiet } }),
  ],
});
