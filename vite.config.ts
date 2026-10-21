import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';

// Read the app version at build time so the web build can report it in the
// "new update available" check without shipping package.json to the client.
const appVersion = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    return String(pkg?.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
})();

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        // The version shown in the browser tab, the page description and the
        // social tags comes from package.json, so it can never drift away
        // from the version the app itself reports.
        name: 'cardiovault-version-meta',
        transformIndexHtml(html: string) {
          return html.replaceAll('__APP_VERSION__', appVersion);
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      minify: 'esbuild' as const,
      sourcemap: false,
      cssMinify: true,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: a release only re-downloads the app code,
          // not React or the Firebase SDK.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
            if (/node_modules[\\/](firebase|@firebase|@capacitor-firebase)[\\/]/.test(id)) return 'firebase-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
