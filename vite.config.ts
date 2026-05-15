import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const buildShared = {
  target: 'chrome120' as const,
  minify: false as const,
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
};

const contentBuildShared = {
  ...buildShared,
  resolve: {
    ...buildShared.resolve,
    alias: {
      ...buildShared.resolve.alias,
      mammoth: resolve(__dirname, 'node_modules/mammoth/mammoth.browser.min.js'),
    },
  },
};

const topShared = {
  ...buildShared,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
};

export default defineConfig(({ command }) => {
  const buildTarget = process.env.BUILD_TARGET;

  if (buildTarget === 'service-worker') {
    return {
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/background/service-worker.ts'),
          formats: ['iife'],
          name: 'serviceWorker',
          fileName: () => 'service-worker.iife.js',
        },
        ...buildShared,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
      ...topShared,
    };
  }

  if (buildTarget === 'devtools') {
    return {
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/devtools/devtools.ts'),
          formats: ['iife'],
          name: 'devtoolsPage',
          fileName: () => 'devtools.iife.js',
        },
        ...buildShared,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
      ...topShared,
    };
  }

  if (buildTarget === 'content-script') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/content/content-script.tsx'),
          formats: ['iife'],
          name: 'contentScript',
          fileName: () => 'content-script.js',
        },
        ...contentBuildShared,
        rollupOptions: { output: { inlineDynamicImports: true } },
        cssCodeSplit: false,
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      resolve: contentBuildShared.resolve,
    };
  }

  if (buildTarget === 'panel') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/devtools/panel/panel.tsx'),
          formats: ['iife'],
          name: 'panelApp',
          fileName: () => 'panel.iife.js',
        },
        ...buildShared,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
      ...topShared,
    };
  }

  if (buildTarget === 'popup') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/popup/popup.tsx'),
          formats: ['iife'],
          name: 'popupApp',
          fileName: () => 'popup.iife.js',
        },
        ...buildShared,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
      ...topShared,
    };
  }

  // Default: dev server（index.html 预览）+ 生产构建抽取 CSS
  return {
    plugins: [react()],
    base: command === 'serve' ? '/' : './',
    server:
      command === 'serve'
        ? {
            port: 5173,
            open: '/index.html',
          }
        : undefined,
    appType: 'spa',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          panel: resolve(__dirname, 'src/devtools/panel/panel.html'),
          popup: resolve(__dirname, 'src/popup/popup.html'),
        },
        output: {
          assetFileNames: 'assets/[name].[ext]',
        },
      },
      ...buildShared,
    },
    ...topShared,
  };
});
