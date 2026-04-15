import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => {
  const devDomain = process.env.SYNAPSENOTE_DEV_DOMAIN?.trim()
  const devPort = Number(process.env.SYNAPSENOTE_DEV_PORT || 5173)
  const upstreamOrigin = process.env.SYNAPSENOTE_DEV_UPSTREAM?.trim() || 'http://127.0.0.1:3002'

  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
      allowedHosts: devDomain ? [devDomain] : undefined,
      hmr: devDomain
        ? {
            host: devDomain,
            protocol: 'wss',
            clientPort: 443,
          }
        : undefined,
      proxy: {
        '/api': { target: upstreamOrigin, changeOrigin: true },
        '/auth': { target: upstreamOrigin, changeOrigin: true },
      },
    },
  }
})
