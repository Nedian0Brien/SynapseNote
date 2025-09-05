import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { viteExternalsPlugin } from 'vite-plugin-externals';
import { createHtmlPlugin } from 'vite-plugin-html';
import istanbul from 'vite-plugin-istanbul';
import svgr from 'vite-plugin-svgr';
import { totalBundleSize } from 'vite-plugin-total-bundle-size';
import { stripTestIdPlugin } from './vite-plugin-strip-testid';

const resourcesPath = path.resolve(__dirname, '../resources');
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.COVERAGE === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Strip data-testid attributes in production builds
    isProd ? stripTestIdPlugin() : undefined,
    createHtmlPlugin({
      inject: {
        data: {
          injectCdn: isProd,
          cdnLinks: isProd
            ? `
              <link rel="dns-prefetch" href="//cdn.jsdelivr.net">
              <link rel="preconnect" href="//cdn.jsdelivr.net">
              
              <script crossorigin src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js"></script>
              <script crossorigin src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js"></script>
            `
            : '',
        },
      },
    }),
    isProd
      ? viteExternalsPlugin({
          react: 'React',
          'react-dom': 'ReactDOM',
        })
      : undefined,
    svgr({
      svgrOptions: {
        prettier: false,
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
        icon: true,
        svgoConfig: {
          multipass: true,
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeViewBox: false,
                },
              },
            },
            {
              name: 'prefixIds',
              params: {
                prefix: (node, { path }) => {
                  const fileName = path?.split('/')?.pop()?.split('.')?.[0];
                  return `${fileName}-`;
                },
              },
            },
          ],
        },
        svgProps: {
          role: 'img',
        },
        replaceAttrValues: {
          '#333': 'currentColor',
          black: 'currentColor',
        },
      },
    }),
    // Enable istanbul for code coverage (active if isTest is true)
    isTest
      ? istanbul({
          cypress: true,
          requireEnv: false,
          include: ['src/**/*'],
          exclude: ['**/__tests__/**/*', 'cypress/**/*', 'node_modules/**/*'],
        })
      : undefined,
    process.env.ANALYZE_MODE
      ? visualizer({
          emitFile: true,
        })
      : undefined,
    process.env.ANALYZE_MODE
      ? totalBundleSize({
          fileNameRegex: /\.(js|css)$/,
          calculateGzip: false,
        })
      : undefined,
  ],
  // prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    host: '0.0.0.0', // Listen on all network interfaces (both IPv4 and IPv6)
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    strictPort: true,
    watch: {
      ignored: ['node_modules'],
    },
    cors: false,
    sourcemapIgnoreList: false,
  },
  envPrefix: ['APPFLOWY'],
  esbuild: {
    keepNames: true,
    sourcesContent: true,
    sourcemap: true,
    minifyIdentifiers: false, // Disable identifier minification in development
    minifySyntax: false, // Disable syntax minification in development
    drop: !isDev ? ['console', 'debugger'] : [],
  },
  build: {
    target: `esnext`,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: isProd
      ? {
          output: {
            chunkFileNames: 'static/js/[name]-[hash].js',
            entryFileNames: 'static/js/[name]-[hash].js',
            assetFileNames: 'static/[ext]/[name]-[hash].[ext]',
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // Bundle i18n first to ensure it's loaded before editor
                if (id.includes('/i18next') || id.includes('i18n')) {
                  return 'i18n-vendor';
                }
                
                if (
                  id.includes('/react-is@') ||
                  id.includes('/react-custom-scrollbars') ||
                  id.includes('/react-virtualized-auto-sizer') ||
                  id.includes('/react-window')
                ) {
                  return 'react-vendor';
                }
                
                if (
                  id.includes('/yjs@') ||
                  id.includes('/y-indexeddb@') ||
                  id.includes('/quill-delta')
                ) {
                  return 'editor-vendor';
                }
                
                if (
                  id.includes('/dexie') ||
                  id.includes('/redux') ||
                  id.includes('/@reduxjs')
                ) {
                  return 'data-vendor';
                }
                
                if (
                  id.includes('/@mui') ||
                  id.includes('/@emotion') ||
                  id.includes('/@popperjs')
                ) {
                  return 'mui-vendor';
                }
                
                if (
                  id.includes('/dayjs') ||
                  id.includes('/smooth-scroll-into-view-if-needed') ||
                  id.includes('/lodash') ||
                  id.includes('/uuid')
                ) {
                  return 'utils-vendor';
                }
                
                if (id.includes('/@appflowyinc/editor')) {
                  return 'appflowy-editor';
                }
                
                if (id.includes('/@appflowyinc/ai-chat')) {
                  return 'appflowy-ai';
                }
                
                if (id.includes('/react-colorful')) {
                  return 'color-vendor';
                }
                
                if (id.includes('/react-katex') || id.includes('/katex')) {
                  return 'katex-vendor';
                }
              }
            },
          },
        }
      : {},
  },
  resolve: {
    alias: [
      { find: 'src/', replacement: `${__dirname}/src/` },
      { find: '@/', replacement: `${__dirname}/src/` },
      { find: 'cypress/support', replacement: `${__dirname}/cypress/support` },
    ],
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-katex',
      '@appflowyinc/editor',
      '@appflowyinc/ai-chat',
      'react-colorful',
      'i18next',
      'i18next-browser-languagedetector',
      'i18next-resources-to-backend',
      'react-i18next'
    ],
  },
});
